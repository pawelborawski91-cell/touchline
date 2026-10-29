import {
  getActiveMovementCommand,
  type CommandAction,
  type CommandBook,
  type CommandStatus,
  type MatchSnapshot,
  type MovementMode,
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
  type SimulationConfig,
  type SimulationState,
  type TurnPhase,
} from './SimulationState';
import { applyPlanningAction, nextTurn, startExecution, stepTurn } from './TurnController';

export interface PlayerDebugInfo {
  playerId: string;
  shirtNumber: number;
  role: string;
  speed: number;
  movementMode: MovementMode | null;
  commandStatus: CommandStatus | null;
  staminaCurrent: number;
}

export interface EngineDebugInfo {
  tick: number;
  turn: number;
  turnTick: number;
  ticksPerTurn: number;
  phase: TurnPhase;
  /** Simulated seconds into the current turn. */
  turnSeconds: number;
  players: PlayerDebugInfo[];
}

/**
 * Low-frequency view for UI: changes only on plan edits, phase changes and command completion,
 * never per tick, so subscribers re-render rarely.
 */
export interface EngineView {
  phase: TurnPhase;
  turn: number;
  commands: CommandBook;
  /** Current (non-interpolated) snapshot; accurate whenever the simulation is not executing. */
  snapshot: MatchSnapshot;
}

export interface MatchEngineOptions {
  config?: SimulationConfig;
  clock?: Partial<SimulationClockConfig>;
}

/**
 * Owns the simulation state and the fixed-timestep clock. The UI calls `advanceFrame` with real
 * frame time and reads interpolated snapshots; it never mutates simulation state directly.
 */
export class MatchEngine {
  readonly config: SimulationConfig;
  private readonly clock: SimulationClock;
  private previous: SimulationState;
  private current: SimulationState;
  private view: EngineView;
  private readonly listeners = new Set<() => void>();

  constructor(initial: MatchSnapshot, options: MatchEngineOptions = {}) {
    this.config = options.config ?? DEFAULT_SIMULATION_CONFIG;
    this.clock = new SimulationClock({
      ...DEFAULT_CLOCK_CONFIG,
      ...options.clock,
      fixedDeltaTime: this.config.match.fixedDeltaTime,
    });
    this.current = createSimulationState(initial);
    this.previous = this.current;
    this.view = this.buildView();
  }

  getState(): SimulationState {
    return this.current;
  }

  getView = (): EngineView => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Edits the plan (create/confirm/replace/cancel commands). Only allowed during planning. */
  dispatchCommand(action: CommandAction): void {
    this.commit(applyPlanningAction(this.current, action));
  }

  /** Commits the plan and starts executing one turn. Returns false outside planning. */
  startExecution(): boolean {
    if (this.current.phase !== 'planning') return false;
    this.clock.reset();
    this.previous = startExecution(this.current);
    this.commit(this.previous);
    return true;
  }

  /** Leaves the finished turn and returns to planning for the next one. */
  nextTurn(): boolean {
    if (this.current.phase !== 'turn_complete') return false;
    this.previous = nextTurn(this.current);
    this.commit(this.previous);
    return true;
  }

  /**
   * Feeds real elapsed time (seconds) into the fixed-timestep loop and runs the due steps.
   * Does nothing outside execution, so planning time never advances the simulation.
   * Returns the number of steps taken.
   */
  advanceFrame(realDeltaSeconds: number): number {
    if (this.current.phase !== 'executing') return 0;
    const due = this.clock.advance(realDeltaSeconds);
    let steps = 0;
    while (steps < due && this.current.phase === 'executing') {
      const before = this.current;
      this.previous = before;
      this.current = stepTurn(before, this.config);
      steps += 1;
      if (this.current.commands !== before.commands || this.current.phase !== before.phase) {
        this.notify();
      }
    }
    if (this.current.phase !== 'executing') {
      this.clock.reset();
      this.previous = this.current;
    }
    return steps;
  }

  /** Interpolation factor between the previous and current simulation states. */
  get alpha(): number {
    return this.current.phase === 'executing' ? this.clock.alpha : 1;
  }

  getInterpolatedSnapshot(): MatchSnapshot {
    return interpolateSnapshot(this.previous, this.current, this.alpha, this.config);
  }

  /** Allocation-free `[x, y, facing]` per player for the render loop. */
  writeFrame(out: number[]): number[] {
    return writeInterpolatedFrame(this.previous, this.current, this.alpha, out);
  }

  getDebugInfo(): EngineDebugInfo {
    const state = this.current;
    const dt = this.config.match.fixedDeltaTime;
    return {
      tick: state.tick,
      turn: state.turn,
      turnTick: state.turnTick,
      ticksPerTurn: ticksPerTurn(this.config),
      phase: state.phase,
      turnSeconds: state.turnTick * dt,
      players: state.players.map((player) => {
        const command =
          getActiveMovementCommand(state.commands, player.id) ??
          [...state.commands.commands].reverse().find((c) => c.playerId === player.id);
        return {
          playerId: player.id,
          shirtNumber: player.shirtNumber,
          role: player.role,
          speed: Math.hypot(player.velocity.x, player.velocity.y),
          movementMode: command?.movementMode ?? null,
          commandStatus: command?.status ?? null,
          staminaCurrent: player.staminaCurrent,
        };
      }),
    };
  }

  private commit(next: SimulationState): void {
    if (next === this.current) return;
    this.current = next;
    if (next.phase !== 'executing') this.previous = next;
    this.notify();
  }

  private buildView(): EngineView {
    return {
      phase: this.current.phase,
      turn: this.current.turn,
      commands: this.current.commands,
      snapshot: toMatchSnapshot(this.current, this.config),
    };
  }

  private notify(): void {
    this.view = this.buildView();
    for (const listener of this.listeners) listener();
  }
}
