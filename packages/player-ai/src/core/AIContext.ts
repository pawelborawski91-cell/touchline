import type { PossessionSnapshot } from '@touchline/ball-engine';
import type { BallState, MatchPhase, PlayerState } from '@touchline/shared';

import type { BallPerception } from '../perception/BallPerception';
import type { PlayerPerception } from '../perception/PlayerPerception';
import type { SpatialGrid } from '../perception/SpatialGrid';
import type { TeamAIState } from '../perception/TeamPerception';
import type { RoleProfile } from '../roles/RoleProfile';
import type { AttackDirection } from '../tactics/Formation';
import type { TeamTactics } from '../tactics/TeamTactics';
import type { AIConfig } from './AIConfig';
import type { PlayerRole } from './AIDecision';

/**
 * Everything one player's decision may use. Read-only snapshots: behaviors never mutate it.
 * All players and the ball are visible to both teams (no fog of war yet).
 */
export interface AIContext {
  tick: number;
  deltaTime: number;
  matchPhase: MatchPhase;
  player: PlayerState;
  role: PlayerRole;
  profile: RoleProfile;
  teammates: readonly PlayerState[];
  opponents: readonly PlayerState[];
  ball: BallState;
  ballInfo: BallPerception;
  possession: PossessionSnapshot;
  /** Our ball carrier, or the opponent's when they have it. */
  carrier: PlayerState | null;
  team: TeamAIState;
  opponentTeam: TeamAIState;
  teamTactics: TeamTactics;
  direction: AttackDirection;
  me: PlayerPerception;
  grid: SpatialGrid;
  config: AIConfig;
}
