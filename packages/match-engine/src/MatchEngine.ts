import {
  countCommandsByStatus,
  getCommand,
  getMovementCommand,
  type CommandBook,
  type CommandStatus,
  type MatchPhase,
  type MatchSnapshot,
  type MovementMode,
  type PlayerCommand,
  type Vector2,
} from '@touchline/shared';

import {
  DEFAULT_CLOCK_CONFIG,
  SimulationClock,
  type SimulationClockConfig,
} from './SimulationClock';
import { interpolateSnapshot, toMatchSnapshot, writeInterpolatedFrame } from './SimulationSnapshot';
import {
  createSimulationState,
  DEFAULT_SIMULATION_CONFIG,
  ticksPerTurn,
  type PathExecutionState,
  type SimulationConfig,
  type SimulationState,
  type TeamCommitState,
} from './SimulationState';
import {
  callStoppage,
  cancelPlannedCommand,
  commitPlans,
  commitTeam,
  endStoppage,
  finishMatch,
  getTurnSnapshot,
  planMovement,
  replaceCommand,
  stepExecution,
  type PlanMovementOptions,
  type TurnSnapshot,
} from './TurnController';

export interface PlayerDebugInfo {
  playerId: string;
  shirtNumber: number;
  role: string;
  speed: number;
  movementMode: MovementMode | null;
  commandId: string | null;
  commandStatus: CommandStatus | null;
  waypointIndex: number | null;
  waypointCount: number | null;
  progress: number | null;
  staminaCurrent: number;
}

export interface EngineDebugInfo {
  tick: number;
  turn: number;
  turnTick: number;
  ticksPerTurn: number;
  phase: MatchPhase;
  suspended: boolean;
  /** Simulated seconds into the current execution window. */
  turnSeconds: number;
  counts: Record<CommandStatus, number>;
  /** Players with a command or still moving. */
  players: PlayerDebugInfo[];
  selected: PlayerDebugInfo | null;
}

/**
 * Low-frequency view for UI: changes only on plan edits, phase changes, suspension and command
 * status changes, never per tick, so subscribers re-render rarely.
 */
export interface EngineView {
  phase: MatchPhase;
  turn: number;
  suspended: boolean;
  commands: CommandBook;
  pathStates: Readonly<Record<string, PathExecutionState>>;
  teamCommits: readonly TeamCommitState[];
  /** Current (non-interpolated) snapshot; exact whenever the simulation is not executing. */
  snapshot: MatchSnapshot;
}

export interface MatchEngineOptions {
  config?: SimulationConfig;
  clock?: Partial<SimulationClockConfig>;
}

/**
 * The single authority for a match: it owns the simulation state, match phase, command book and
 * fixed-timestep clock. The UI requests actions (plan, cancel, commit, …) and feeds real frame
 * time; it never mutates simulation state. Invalid requests throw `MatchStateError`,
 * `PhaseTransitionError`, `PlanValidationError` or `CommandTransitionError`.
 */
export class MatchEngine {
  readonly config: SimulationConfig;
  private readonly clock: SimulationClock;
  private previous: SimulationState;
  private current: SimulationState;
  private suspended = false;
  private view: EngineView;
  private turnSnapshot: TurnSnapshot;
  private snapshot: MatchSnapshot | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly tickListeners = new Set<() => void>();

  constructor(initial: MatchSnapshot, options: MatchEngineOptions = {}) {
    this.config = options.config ?? DEFAULT_SIMULATION_CONFIG;
    ticksPerTurn(this.config);
    this.clock = new SimulationClock({
      ...DEFAULT_CLOCK_CONFIG,
      ...options.clock,
      fixedDeltaTime: this.config.match.fixedDeltaTime,
    });
    this.current = createSimulationState(initial);
    this.previous = this.current;
    this.view = this.buildView();
    this.turnSnapshot = getTurnSnapshot(this.current, this.config);
  }

  getState(): SimulationState {
    return this.current;
  }

  getView = (): EngineView => this.view;

  /** Subscribe to view changes (plan, phase, command status, suspension). */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Turn timing; a new object after every simulated tick and every phase change. */
  getTurnSnapshot = (): TurnSnapshot => this.turnSnapshot;

  /** Subscribe to simulation ticks (for countdowns and debug readouts driven by sim time). */
  subscribeTicks = (listener: () => void): (() => void) => {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  };

  // ── Planning actions ──────────────────────────────────────────────────────────────────────

  /** Queues a movement command, superseding the player's current one. Planning only. */
  planMovement(
    playerId: string,
    path: readonly Vector2[],
    options: PlanMovementOptions = {},
  ): PlayerCommand {
    const result = planMovement(this.current, playerId, path, options);
    this.commit(result.state);
    return result.command;
  }

  /** Replaces a queued, active or paused command with a new path. Planning only. */
  replaceCommand(
    commandId: string,
    path: readonly Vector2[],
    options: PlanMovementOptions = {},
  ): PlayerCommand {
    const result = replaceCommand(this.current, commandId, path, options);
    this.commit(result.state);
    return result.command;
  }

  /** Cancels a queued, active or paused command. Planning only. */
  cancelCommand(commandId: string): void {
    this.commit(cancelPlannedCommand(this.current, commandId));
  }

  getCommand(commandId: string): PlayerCommand | undefined {
    return getCommand(this.current.commands, commandId);
  }

  getPathState(commandId: string): PathExecutionState | undefined {
    return this.current.pathStates[commandId];
  }

  // ── Phase actions ─────────────────────────────────────────────────────────────────────────

  /** Validates and commits every team's plan and starts the execution window. */
  commitPlans(): void {
    this.startPhase(commitPlans(this.current, this.config));
  }

  /** Commits one team; execution starts when all teams have committed. */
  commitTeam(teamId: string): void {
    this.startPhase(commitTeam(this.current, teamId, this.config));
  }

  callStoppage(): void {
    this.startPhase(callStoppage(this.current));
  }

  endStoppage(): void {
    this.startPhase(endStoppage(this.current));
  }

  finishMatch(): void {
    this.startPhase(finishMatch(this.current));
  }

  /**
   * Holds the execution clock (e.g. the app went to the background). While suspended no time
   * is simulated, however long the pause; `resume()` continues from the same tick.
   */
  suspend(): void {
    if (this.suspended || this.current.phase !== 'execution') return;
    this.suspended = true;
    this.clock.reset();
    this.previous = this.current;
    this.notify();
  }

  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    this.clock.reset();
    this.notify();
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  // ── Frame loop ────────────────────────────────────────────────────────────────────────────

  /**
   * Feeds real elapsed time (seconds) into the fixed-timestep loop and runs the due steps.
   * Does nothing outside execution or while suspended, so planning never advances the
   * simulation. Long frames are clamped by the clock. Returns the number of steps taken.
   */
  advanceFrame(realDeltaSeconds: number): number {
    if (this.current.phase !== 'execution' || this.suspended) return 0;
    const due = this.clock.advance(realDeltaSeconds);
    let steps = 0;
    while (steps < due && this.current.phase === 'execution') {
      const before = this.current;
      this.previous = before;
      this.current = stepExecution(before, this.config);
      this.snapshot = null;
      steps += 1;
      if (this.current.commands !== before.commands || this.current.phase !== before.phase) {
        this.notify();
      }
    }
    if (this.current.phase !== 'execution') {
      this.clock.reset();
      this.previous = this.current;
    }
    if (steps > 0) this.notifyTicks();
    return steps;
  }

  /** Interpolation factor between the previous and current simulation states. */
  get alpha(): number {
    return this.current.phase === 'execution' && !this.suspended ? this.clock.alpha : 1;
  }

  /** Current authoritative snapshot (cached per tick). */
  getSnapshot(): MatchSnapshot {
    this.snapshot ??= toMatchSnapshot(this.current, this.config);
    return this.snapshot;
  }

  getInterpolatedSnapshot(): MatchSnapshot {
    return interpolateSnapshot(this.previous, this.current, this.alpha, this.config);
  }

  /** Allocation-free interpolated player frame for the render loop (see `PLAYER_FRAME_STRIDE`). */
  writeFrame(out: number[]): number[] {
    return writeInterpolatedFrame(this.previous, this.current, this.alpha, out);
  }

  getDebugInfo(selectedPlayerId: string | null = null): EngineDebugInfo {
    const state = this.current;
    const describe = (playerId: string): PlayerDebugInfo | null => {
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return null;
      const command =
        (player.activeCommandId ? getCommand(state.commands, player.activeCommandId) : undefined) ??
        getMovementCommand(state.commands, player.id) ??
        [...state.commands.commands].reverse().find((c) => c.playerId === player.id);
      const pathState = command ? state.pathStates[command.id] : undefined;
      return {
        playerId: player.id,
        shirtNumber: player.shirtNumber,
        role: player.role,
        speed: Math.hypot(player.velocity.x, player.velocity.y),
        movementMode: command?.movementMode ?? null,
        commandId: command?.id ?? null,
        commandStatus: command?.status ?? null,
        waypointIndex: pathState?.currentWaypointIndex ?? null,
        waypointCount: command?.path.length ?? null,
        progress: pathState?.progress ?? null,
        staminaCurrent: player.staminaCurrent,
      };
    };
    const players = state.players
      .map((player) => describe(player.id)!)
      .filter((info) => info.commandStatus !== null || info.speed > 0.01);
    return {
      tick: state.tick,
      turn: state.turn,
      turnTick: state.turnTick,
      ticksPerTurn: ticksPerTurn(this.config),
      phase: state.phase,
      suspended: this.suspended,
      turnSeconds: state.turnTick * this.config.match.fixedDeltaTime,
      counts: countCommandsByStatus(state.commands),
      players,
      selected: selectedPlayerId ? describe(selectedPlayerId) : null,
    };
  }

  private startPhase(next: SimulationState): void {
    this.clock.reset();
    this.suspended = false;
    this.previous = next;
    this.commit(next);
    this.notifyTicks();
  }

  private commit(next: SimulationState): void {
    if (next === this.current) return;
    this.current = next;
    this.snapshot = null;
    if (next.phase !== 'execution') this.previous = next;
    this.notify();
  }

  private buildView(): EngineView {
    return {
      phase: this.current.phase,
      turn: this.current.turn,
      suspended: this.suspended,
      commands: this.current.commands,
      pathStates: this.current.pathStates,
      teamCommits: this.current.teamCommits,
      snapshot: this.getSnapshot(),
    };
  }

  private notify(): void {
    this.view = this.buildView();
    for (const listener of this.listeners) listener();
  }

  private notifyTicks(): void {
    this.turnSnapshot = getTurnSnapshot(this.current, this.config);
    for (const listener of this.tickListeners) listener();
  }
}
