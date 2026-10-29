import {
  createCommandBook,
  DEFAULT_MATCH_CONFIG,
  getTicksPerTurn,
  type CommandBook,
  type MatchConfig,
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
 * `planning` → `executing` (exactly one turn of fixed steps) → `turn_complete` → `planning` of the
 * next turn. The simulation only advances while executing.
 */
export type TurnPhase = 'planning' | 'executing' | 'turn_complete';

/** Path-follower progress for a player's active command. */
export interface FollowerEntry {
  commandId: string;
  waypointIndex: number;
}

/** Complete, immutable simulation state. Every step produces a new object. */
export interface SimulationState {
  /** Fixed steps simulated since kickoff. */
  readonly tick: number;
  /** 1-based turn number. */
  readonly turn: number;
  /** Fixed steps simulated in the current turn (0…ticksPerTurn). */
  readonly turnTick: number;
  readonly phase: TurnPhase;
  readonly players: readonly MatchPlayer[];
  readonly commands: CommandBook;
  readonly followers: Readonly<Record<string, FollowerEntry>>;
  /** Static match context carried through unchanged (teams, score, ball). */
  readonly context: Pick<MatchSnapshot, 'home' | 'away' | 'score' | 'ball'>;
}

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

export function ticksPerTurn(config: SimulationConfig = DEFAULT_SIMULATION_CONFIG): number {
  return getTicksPerTurn(config.match);
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
    followers: {},
    context: {
      home: snapshot.home,
      away: snapshot.away,
      score: snapshot.score,
      ball: snapshot.ball,
    },
  };
}
