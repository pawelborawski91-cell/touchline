import type { PlayerMovementAttributes, Vector2 } from '@touchline/shared';

import { angleDifference, clamp } from '../math/angles';
import { angleOf, distance, dot, normalize, sub } from '../math/vector';
import { arrivalSpeed, computeSteering, type MovementIntent } from './SteeringController';

export interface PathFollowerConfig {
  /** A waypoint counts as reached inside this radius (metres) and the next one is targeted. */
  arrivalRadius: number;
  /** The command completes once the player is this close to the end... */
  completionRadius: number;
  /** ...and slower than this (m/s). */
  completionSpeed: number;
  /** Path length (metres) over which upcoming turning is summed to set corner speeds. */
  cornerWindow: number;
  /** Lowest corner speed as a fraction of the cap (for hairpins). */
  minCornerFactor: number;
  /** Creep speed used for the last centimetres so the player does not stall short of the end. */
  minApproachSpeed: number;
}

export const DEFAULT_PATH_FOLLOWER_CONFIG: Readonly<PathFollowerConfig> = Object.freeze({
  arrivalRadius: 1,
  completionRadius: 0.25,
  completionSpeed: 0.1,
  cornerWindow: 3,
  minCornerFactor: 0.2,
  minApproachSpeed: 0.5,
});

/** A command path with precomputed arc lengths and corner speed factors. */
export interface PreparedPath {
  points: readonly Vector2[];
  /** Arc length from the start to each point. */
  cumulative: readonly number[];
  total: number;
  /** Speed factor (0–1) for passing each point, from how sharply the path turns around it. */
  cornerFactor: readonly number[];
}

function turnAt(points: readonly Vector2[], i: number): number {
  const a = points[i - 1]!;
  const b = points[i]!;
  const c = points[i + 1]!;
  if (distance(a, b) < 1e-6 || distance(b, c) < 1e-6) return 0;
  return Math.abs(angleDifference(angleOf(sub(b, a)), angleOf(sub(c, b))));
}

export function preparePath(
  points: readonly Vector2[],
  config: PathFollowerConfig = DEFAULT_PATH_FOLLOWER_CONFIG,
): PreparedPath {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1]! + distance(points[i - 1]!, points[i]!));
  }
  const turns = points.map((_, i) => (i > 0 && i < points.length - 1 ? turnAt(points, i) : 0));
  // Summing turning over a window treats a curve drawn as many small bends like one sharp corner.
  const cornerFactor = points.map((_, i) => {
    let total = 0;
    for (
      let j = i;
      j < points.length - 1 && cumulative[j]! - cumulative[i]! <= config.cornerWindow;
      j += 1
    ) {
      total += turns[j]!;
    }
    const factor = Math.sqrt((1 + Math.cos(Math.min(total, Math.PI))) / 2);
    return clamp(factor, config.minCornerFactor, 1);
  });
  return { points, cumulative, total: cumulative[cumulative.length - 1] ?? 0, cornerFactor };
}

export interface FollowerState {
  /** Index of the waypoint currently targeted (≥ 1; index 0 is the start). */
  waypointIndex: number;
}

export function createFollowerState(): FollowerState {
  return { waypointIndex: 1 };
}

export interface FollowResult {
  follower: FollowerState;
  intent: MovementIntent;
  target: Vector2;
  /** Distance left along the path, metres. */
  remaining: number;
  completed: boolean;
}

/** True once the player is beyond waypoint `i` along both adjoining segments. */
function hasPassed(points: readonly Vector2[], i: number, position: Vector2): boolean {
  const wp = points[i]!;
  const offset = sub(position, wp);
  const incoming = normalize(sub(wp, points[i - 1]!));
  const outgoing = normalize(sub(points[i + 1]!, wp));
  return dot(offset, incoming) > 0 && dot(offset, outgoing) > 0;
}

/**
 * One step of path following. Advances the target waypoint when the player is within the arrival
 * radius (or has gone past it), steers at the target, and limits speed so the player can make
 * the upcoming corners and stop at the end. Never moves the player itself.
 */
export function followPath(
  path: PreparedPath,
  follower: FollowerState,
  body: { position: Vector2; velocity: Vector2 },
  speedCap: number,
  attributes: PlayerMovementAttributes,
  config: PathFollowerConfig = DEFAULT_PATH_FOLLOWER_CONFIG,
): FollowResult {
  const { points, cumulative, total, cornerFactor } = path;
  const last = points.length - 1;
  const speed = Math.hypot(body.velocity.x, body.velocity.y);
  const end = points[last] ?? body.position;
  if (last < 1) {
    return {
      follower,
      intent: { direction: null, speed: 0 },
      target: end,
      remaining: 0,
      completed: speed <= config.completionSpeed,
    };
  }

  let index = clamp(follower.waypointIndex, 1, last);
  while (
    index < last &&
    (distance(body.position, points[index]!) <= config.arrivalRadius ||
      hasPassed(points, index, body.position))
  ) {
    index += 1;
  }

  const target = points[index]!;
  const toTarget = distance(body.position, target);
  const remaining = toTarget + (total - cumulative[index]!);

  if (remaining <= config.completionRadius) {
    return {
      follower: { waypointIndex: index },
      intent: { direction: null, speed: 0 },
      target,
      remaining,
      completed: speed <= config.completionSpeed,
    };
  }

  // Corner limits: the speed must be low enough to brake down to each upcoming corner's speed.
  let cruise = speedCap;
  const horizon =
    toTarget + (speedCap * speedCap) / (2 * attributes.deceleration) + config.cornerWindow;
  for (let k = index; k < last; k += 1) {
    const along = toTarget + (cumulative[k]! - cumulative[index]!);
    if (along > horizon) break;
    const cornerSpeed = speedCap * cornerFactor[k]!;
    cruise = Math.min(cruise, arrivalSpeed(along, attributes.deceleration, speedCap, cornerSpeed));
  }

  const steering = computeSteering({
    position: body.position,
    velocity: body.velocity,
    target,
    distanceToGoal: remaining,
    cruiseSpeed: cruise,
    attributes,
  });
  const desired = Math.max(steering.desiredSpeed, Math.min(speedCap, config.minApproachSpeed));

  return {
    follower: { waypointIndex: index },
    intent: { direction: steering.desiredDirection, speed: desired },
    target,
    remaining,
    completed: false,
  };
}
