import {
  FIELD_WIDTH,
  GOAL_WIDTH,
  PENALTY_AREA_DEPTH,
  PENALTY_AREA_WIDTH,
  type Vector2,
} from '@touchline/shared';

import { clamp, distance } from '../navigation/vector';
import { ownGoalCentre, type AttackDirection } from '../tactics/Formation';
import type { RoleProfile } from './RoleProfile';

/** Goalkeepers only protect the goal and claim loose balls in their own box. */
export const GOALKEEPER_PROFILE: RoleProfile = {
  role: 'GK',
  weights: { protect_goal: 1, chase_loose_ball: 1, carry_ball: 0.6 },
  pressRange: PENALTY_AREA_DEPTH,
  leash: PENALTY_AREA_DEPTH - 1,
};

export interface GoalkeeperPositioning {
  /** Closest the keeper stands to the goal line, m. */
  minDepth: number;
  /** Depth gained per metre of ball distance from goal. */
  depthPerMetre: number;
  /** Deepest the keeper goes while play is near (narrowing the angle), m. */
  angleDepthMax: number;
  /** Extra depth per metre the defensive line is above `sweepLineFrom`. */
  sweepPerMetre: number;
  sweepLineFrom: number;
  /** Never further from the goal line than this (stays inside the box), m. */
  maxDepth: number;
}

export const DEFAULT_GOALKEEPER_POSITIONING: Readonly<GoalkeeperPositioning> = Object.freeze({
  minDepth: 1.5,
  depthPerMetre: 0.07,
  angleDepthMax: 5.5,
  sweepPerMetre: 0.18,
  sweepLineFrom: 28,
  maxDepth: PENALTY_AREA_DEPTH - 2.5,
});

/**
 * Where the keeper stands: on the line from the goal centre to the ball (narrowing the angle),
 * deeper as the ball gets closer, stepping out cautiously when the defensive line is high, and
 * never leaving the box however far away the ball is.
 */
export function goalkeeperTarget(
  ball: Vector2,
  direction: AttackDirection,
  defensiveLineX: number,
  positioning: GoalkeeperPositioning = DEFAULT_GOALKEEPER_POSITIONING,
): Vector2 {
  const goal = ownGoalCentre(direction);
  const ballDistance = distance(ball, goal);
  const lineDistance = Math.abs(defensiveLineX - goal.x);
  const angleDepth = Math.min(
    positioning.minDepth + positioning.depthPerMetre * ballDistance,
    positioning.angleDepthMax,
  );
  const sweep = Math.max(0, lineDistance - positioning.sweepLineFrom) * positioning.sweepPerMetre;
  const depth = clamp(angleDepth + sweep, positioning.minDepth, positioning.maxDepth);
  const dx = Math.abs(ball.x - goal.x);
  const dy = ball.y - goal.y;
  const norm = Math.hypot(dx, dy) || 1;
  const halfBox = PENALTY_AREA_WIDTH / 2 - 2;
  const lateral = clamp(goal.y + (dy / norm) * depth, goal.y - halfBox, goal.y + halfBox);
  // Inside the posts' width the keeper stays square to the ball; outside it he guards the post.
  const postLimit = GOAL_WIDTH / 2 + 1.5;
  return {
    x: goal.x + direction * Math.max((dx / norm) * depth, positioning.minDepth),
    y: clamp(lateral, FIELD_WIDTH / 2 - postLimit, FIELD_WIDTH / 2 + postLimit),
  };
}

/** True when a point is inside the team's own penalty area. */
export function inOwnPenaltyArea(point: Vector2, direction: AttackDirection): boolean {
  const goal = ownGoalCentre(direction);
  return (
    Math.abs(point.x - goal.x) <= PENALTY_AREA_DEPTH &&
    Math.abs(point.y - goal.y) <= PENALTY_AREA_WIDTH / 2
  );
}
