import {
  ballHeight,
  getPossessionSnapshot,
  horizontalSpeed,
  isAirborne,
  predictTrajectory,
  type BallEvent,
  type KickResult,
  type PossessionSnapshot,
} from '@touchline/ball-engine';
import { describeAI, type AIDebugInfo } from '@touchline/player-ai';
import {
  countCommandsByStatus,
  getCommand,
  getMovementCommand,
  type CommandBook,
  type BallState,
  type CommandStatus,
  type KickRequest,
  type MatchPhase,
  type MatchSnapshot,
  type MovementMode,
  type PlayerCommand,
  type PossessionState,
  type Vector2,
  type Vector3,
} from '@touchline/shared';

import { setPlayerActive } from './AICoordinator';
import {
  cancelPlannedKick,
  kickBall,
  placeBall,
  planKick,
  type PlanKickInput,
} from './BallCoordinator';
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
  type PlannedKick,
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

export interface BallDebugInfo {
  position: Vector3;
  velocity: Vector3;
  horizontalSpeed: number;
  verticalSpeed: number;
  /** Height of the ball's underside above the pitch. */
  height: number;
  airborne: boolean;
  possession: PossessionState;
  controllerPlayerId: string | null;
  lastTouchPlayerId: string | null;
  lastTouchTeamId: string | null;
  contenderIds: readonly string[];
  isOutOfPlay: boolean;
  recentEvents: readonly BallEvent[];
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
  ball: BallDebugInfo;
  /** Autonomous AI readout (play states, decisions, assignments); read-only. */
  ai: EngineAIDebugInfo;
}

export interface EngineAIDebugInfo extends AIDebugInfo {
  enabled: boolean;
  /** Simulated seconds since each player's last decision, by player id. */
  secondsSinceDecision: Readonly<Record<string, number | null>>;
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
  plannedKicks: Readonly<Record<string, PlannedKick>>;
  /**
   * The ball as of the last view change. The view updates when possession, the controller or
   * out-of-play changes, not on every tick; read the frame for the live position.
   */
  ball: BallState;
  /** Current (non-interpolated) snapshot; exact whenever the simulation is not executing. */
  snapshot: MatchSnapshot;
}

function ballViewChanged(before: BallState, after: BallState): boolean {
  return (
    before.possessionState !== after.possessionState ||
    before.controllerPlayerId !== after.controllerPlayerId ||
    before.lastTouchPlayerId !== after.lastTouchPlayerId ||
    before.isOutOfPlay !== after.isOutOfPlay
  );
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

  // ── Ball actions ──────────────────────────────────────────────────────────────────────────

  /**
   * Orders a kick for a player (planning only). It fires during execution as soon as the player
   * can legally strike the ball, and persists across turns until it fires or is cancelled.
   */
  planKick(input: PlanKickInput): PlannedKick {
    this.commit(planKick(this.current, input, this.config));
    return this.current.plannedKicks[input.playerId]!;
  }

  cancelKick(playerId: string): void {
    this.commit(cancelPlannedKick(this.current, playerId));
  }

  /** Kicks immediately (execution only). A rejected kick changes nothing. */
  kick(request: KickRequest): KickResult {
    const { state, result } = kickBall(this.current, request, this.config);
    if (result.ok) {
      this.commit(state);
      this.notifyTicks();
    }
    return result;
  }

  /** Puts a still, free ball on the pitch (planning only; debug stand-in for restarts). */
  placeBall(position: Vector2): void {
    this.commit(placeBall(this.current, position, this.config));
  }

  getBall(): BallState {
    return this.current.ball.ball;
  }

  getPossession(): PossessionSnapshot {
    return getPossessionSnapshot(this.current.ball, this.current.players);
  }

  /** Free-flight prediction of the ball (ignores players), for debug drawing. */
  predictBallTrajectory(seconds = 3): Vector3[] {
    return predictTrajectory(
      this.current.ball.ball,
      this.config.ball,
      this.config.match.fixedDeltaTime,
      seconds,
    );
  }

  /**
   * Takes a player out of normal behavior or brings him back (planning only). Reserved for
   * future match events; an inactive player gets no AI intent.
   */
  setPlayerActive(playerId: string, active: boolean): void {
    this.commit(setPlayerActive(this.current, playerId, active));
  }

  /** AI readout for debug views; building it never changes the simulation. */
  getAIDebugInfo(): EngineAIDebugInfo {
    const state = this.current;
    const info = describeAI(state.ai);
    const dt = this.config.match.fixedDeltaTime;
    const secondsSinceDecision: Record<string, number | null> = {};
    for (const player of info.players) {
      secondsSinceDecision[player.playerId] =
        player.decidedAtTick === null ? null : (state.tick - player.decidedAtTick) * dt;
    }
    return { ...info, enabled: this.config.ai.enabled, secondsSinceDecision };
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
      if (
        this.current.commands !== before.commands ||
        this.current.phase !== before.phase ||
        this.current.plannedKicks !== before.plannedKicks ||
        this.current.ai.possession !== before.ai.possession ||
        ballViewChanged(before.ball.ball, this.current.ball.ball)
      ) {
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

  /**
   * Allocation-free interpolated frame for the render loop: players (see `PLAYER_FRAME_STRIDE`)
   * followed by the ball (see `ballFrameOffset`).
   */
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
      ball: this.describeBall(),
      ai: this.getAIDebugInfo(),
    };
  }

  private describeBall(): BallDebugInfo {
    const { ball, contenderIds } = this.current.ball;
    return {
      position: ball.position,
      velocity: ball.velocity,
      horizontalSpeed: horizontalSpeed(ball),
      verticalSpeed: ball.velocity.z,
      height: ballHeight(ball),
      airborne: isAirborne(ball),
      possession: ball.possessionState,
      controllerPlayerId: ball.controllerPlayerId,
      lastTouchPlayerId: ball.lastTouchPlayerId,
      lastTouchTeamId: ball.lastTouchTeamId,
      contenderIds,
      isOutOfPlay: ball.isOutOfPlay,
      recentEvents: this.current.recentEvents,
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
      plannedKicks: this.current.plannedKicks,
      ball: this.current.ball.ball,
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
