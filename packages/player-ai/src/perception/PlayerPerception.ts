import type { PlayerState, Vector2 } from '@touchline/shared';

import { distance } from '../navigation/vector';
import { lateralOf, lineOf, type AttackDirection } from '../tactics/Formation';
import type { BallPerception } from './BallPerception';
import type { SpatialGrid } from './SpatialGrid';
import type { TeamAIState } from './TeamPerception';

/** Opponents further away than this are irrelevant to a player's immediate situation, m. */
const NEAR_RADIUS = 25;

/** One player's view of its own situation. */
export interface PlayerPerception {
  anchor: Vector2;
  distanceToAnchor: number;
  distanceToBall: number;
  /** 0 at the own goal line, 1 at the opponent's. */
  line: number;
  /** −1 team's left touchline, +1 right. */
  lateral: number;
  nearestOpponent: PlayerState | null;
  nearestOpponentDistance: number;
  nearestTeammateDistance: number;
  isCarrier: boolean;
  isChaser: boolean;
  isPresser: boolean;
  isSupportPresser: boolean;
  isCover: boolean;
  isSupporter: boolean;
  markTarget: PlayerState | null;
}

export function perceivePlayer(
  player: PlayerState,
  anchor: Vector2,
  team: TeamAIState,
  ball: BallPerception,
  grid: SpatialGrid,
  direction: AttackDirection,
  findOpponent: (id: string) => PlayerState | null,
): PlayerPerception {
  const nearestOpponent = grid.nearest(
    player.position,
    NEAR_RADIUS,
    (other) => other.teamId !== player.teamId,
  );
  const nearestTeammate = grid.nearest(
    player.position,
    NEAR_RADIUS,
    (other) => other.teamId === player.teamId && other.id !== player.id,
  );
  const markId = team.marks[player.id];
  return {
    anchor,
    distanceToAnchor: distance(player.position, anchor),
    distanceToBall: distance(player.position, ball.position),
    line: lineOf(player.position.x, direction),
    lateral: lateralOf(player.position.y, direction),
    nearestOpponent: nearestOpponent?.player ?? null,
    nearestOpponentDistance: nearestOpponent?.distance ?? Infinity,
    nearestTeammateDistance: nearestTeammate?.distance ?? Infinity,
    isCarrier: team.carrierId === player.id,
    isChaser: team.chaserId === player.id,
    isPresser: team.presserId === player.id,
    isSupportPresser: team.supportPresserId === player.id,
    isCover: team.coverId === player.id,
    isSupporter: team.supporterIds.includes(player.id),
    markTarget: markId ? findOpponent(markId) : null,
  };
}
