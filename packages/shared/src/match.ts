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
  fieldWidth: 68,
  fieldLength: 105,
});

export function getTicksPerTurn(
  config: Pick<MatchConfig, 'turnDuration' | 'fixedDeltaTime'>,
): number {
  return Math.round(config.turnDuration / config.fixedDeltaTime);
}
