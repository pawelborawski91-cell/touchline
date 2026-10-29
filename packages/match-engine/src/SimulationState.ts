import {
  createCommandBook,
  DEFAULT_MATCH_CONFIG,
  getTicksPerTurn,
  type CommandBook,
  type MatchConfig,
  type MatchPhase,
  type MatchPlayer,
  type MatchSnapshot,
} from '@touchline/shared';
import {
  DEFAULT_PATH_FOLLOWER_CONFIG,
  DEFAULT_STAMINA_CONFIG,
  type PathFollowerConfig,
  type StaminaConfig,
} from '@touchline/physics';

/**
 * Path-following progress of one movement command. Stored in the simulation state (not in the
 * follower), so it survives planning phases and turn boundaries unchanged.
 */
export interface PathExecutionState {
  commandId: string;
  /** Waypoint the player is heading for (≥ 1). Only ever increases. */
  currentWaypointIndex: number;
  /** Metres of the path covered so far. Only ever increases. */
  distanceAlongPath: number;
  /** `distanceAlongPath / total`, 0–1 (1 once completed). */
  progress: number;
  isFinalWaypoint: boolean;
}

/**
 * Commit status of one team for the current planning phase. The prototype has a single local
 * planning controller that commits every team at once; the model already supports teams
 * committing separately (execution starts when all have committed).
 */
export interface TeamCommitState {
  teamId: string;
  committed: boolean;
}

/** Complete, immutable simulation state. Every step produces a new object. */
export interface SimulationState {
  /** Fixed steps simulated since kickoff (authoritative match time). */
  readonly tick: number;
  /** 1-based turn number; increments when an execution phase ends. */
  readonly turn: number;
  /** Fixed steps simulated in the current turn's execution (0…ticksPerTurn). */
  readonly turnTick: number;
  readonly phase: MatchPhase;
  readonly players: readonly MatchPlayer[];
  readonly commands: CommandBook;
  /** Path progress per command id. */
  readonly pathStates: Readonly<Record<string, PathExecutionState>>;
  readonly teamCommits: readonly TeamCommitState[];
  /** Static match context carried through unchanged (teams, score, ball). */
  readonly context: Pick<MatchSnapshot, 'home' | 'away' | 'score' | 'ball'>;
}

/** Turn timing. Ticks are authoritative; seconds are derived from them. */
export type TurnConfig = Pick<MatchConfig, 'turnDuration' | 'fixedDeltaTime'>;

export const DEFAULT_TURN_CONFIG: Readonly<TurnConfig> = Object.freeze({
  turnDuration: DEFAULT_MATCH_CONFIG.turnDuration,
  fixedDeltaTime: DEFAULT_MATCH_CONFIG.fixedDeltaTime,
});

export interface SimulationConfig {
  match: MatchConfig;
  follower: PathFollowerConfig;
  stamina: StaminaConfig;
}

export const DEFAULT_SIMULATION_CONFIG: Readonly<SimulationConfig> = Object.freeze({
  match: DEFAULT_MATCH_CONFIG,
  follower: DEFAULT_PATH_FOLLOWER_CONFIG,
  stamina: DEFAULT_STAMINA_CONFIG,
});

/**
 * Ticks per turn. Throws if the turn is not a whole number of ticks, so turn length can never
 * drift through floating-point accumulation.
 */
export function ticksPerTurn(config: { match: TurnConfig } = DEFAULT_SIMULATION_CONFIG): number {
  const { turnDuration, fixedDeltaTime } = config.match;
  const ticks = getTicksPerTurn(config.match);
  if (
    !(fixedDeltaTime > 0) ||
    ticks < 1 ||
    Math.abs(turnDuration / fixedDeltaTime - ticks) > 1e-6
  ) {
    throw new RangeError(
      `Turn duration ${turnDuration} s is not a whole number of ${fixedDeltaTime} s ticks.`,
    );
  }
  return ticks;
}

/** Initial state from a kickoff snapshot (deep-copies players; the snapshot is not retained). */
export function createSimulationState(
  snapshot: MatchSnapshot,
  commands: CommandBook = createCommandBook(),
): SimulationState {
  return {
    tick: 0,
    turn: 1,
    turnTick: 0,
    phase: 'planning',
    players: snapshot.players.map((player) => ({
      ...player,
      position: { ...player.position },
      velocity: { ...player.velocity },
      movement: { ...player.movement },
    })),
    commands,
    pathStates: {},
    teamCommits: [snapshot.home.id, snapshot.away.id].map((teamId) => ({
      teamId,
      committed: false,
    })),
    context: {
      home: snapshot.home,
      away: snapshot.away,
      score: snapshot.score,
      ball: snapshot.ball,
    },
  };
}
