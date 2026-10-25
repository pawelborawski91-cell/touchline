import { FIELD_LENGTH, FIELD_WIDTH } from './field';
import type { Vector3 } from './math';
import type { PlayerState } from './player';

export type MatchPhase = 'planning' | 'execution' | 'stoppage' | 'finished';

export interface MatchConfig {
  /** Seconds of simulated time executed per turn. */
  turnDuration: number;
  /** Seconds of simulated time per simulation tick. */
  fixedDeltaTime: number;
  /** Pitch extent along the y axis, touchline to touchline, in metres. */
  fieldWidth: number;
  /** Pitch extent along the x axis, goal line to goal line, in metres. */
  fieldLength: number;
}

export const DEFAULT_MATCH_CONFIG: Readonly<MatchConfig> = Object.freeze({
  turnDuration: 5,
  fixedDeltaTime: 0.05,
  fieldWidth: FIELD_WIDTH,
  fieldLength: FIELD_LENGTH,
});

export function getTicksPerTurn(
  config: Pick<MatchConfig, 'turnDuration' | 'fixedDeltaTime'>,
): number {
  return Math.round(config.turnDuration / config.fixedDeltaTime);
}

export type TeamSide = 'home' | 'away';

export interface TeamInfo {
  id: string;
  name: string;
  side: TeamSide;
}

export interface MatchPlayer extends PlayerState {
  shirtNumber: number;
}

export interface BallState {
  /** World position in metres; z is height above the pitch. */
  position: Vector3;
  velocity: Vector3;
}

export interface MatchScore {
  home: number;
  away: number;
}

/**
 * Read-only view of a match at one instant. Static fixtures use it today; the match engine
 * will produce it per tick later. Consumers (renderer, UI) must never mutate it.
 */
export interface MatchSnapshot {
  tick: number;
  phase: MatchPhase;
  /** Elapsed match time in seconds. */
  clockSeconds: number;
  score: MatchScore;
  home: TeamInfo;
  away: TeamInfo;
  players: readonly MatchPlayer[];
  ball: BallState;
}
