import {
  FIELD_LENGTH,
  FIELD_WIDTH,
  MOVEMENT_MODES,
  type MovementMode,
  type PlayerState,
  type Vector2,
} from '@touchline/shared';

import type { SpatialGrid } from '../perception/SpatialGrid';
import { clamp, clamp01, distance, towards } from './vector';

/** Targets stay this far inside the lines, m. */
export const TARGET_MARGIN = 1;

export function clampToPitch(point: Vector2, margin: number = TARGET_MARGIN): Vector2 {
  return {
    x: clamp(point.x, margin, FIELD_LENGTH - margin),
    y: clamp(point.y, margin, FIELD_WIDTH - margin),
  };
}

/** A point `gap` metres from `opponent` towards the goal being protected. */
export function goalSidePoint(opponent: Vector2, goal: Vector2, gap: number): Vector2 {
  return towards(opponent, goal, gap);
}

/** Keeps `target` within `radius` of `anchor`. */
export function leash(target: Vector2, anchor: Vector2, radius: number): Vector2 {
  const d = distance(target, anchor);
  return d <= radius ? target : towards(anchor, target, radius);
}

/**
 * Pushes a positional target away from teammates standing on it, so players do not stack on
 * the same spot. Uses current positions (not other players' choices), so the result does not
 * depend on the order players decide in.
 */
export function separateFromTeammates(
  target: Vector2,
  self: PlayerState,
  grid: SpatialGrid,
  minSpacing: number,
): Vector2 {
  let x = target.x;
  let y = target.y;
  grid.forEachWithin(target, minSpacing, (other, d) => {
    if (other.teamId !== self.teamId || other.id === self.id) return;
    const push = minSpacing - d;
    if (d < 1e-6) {
      // Exactly on top: step sideways, deterministically by id order.
      y += other.id < self.id ? push : -push;
      return;
    }
    x += ((target.x - other.position.x) / d) * push;
    y += ((target.y - other.position.y) / d) * push;
  });
  return clampToPitch({ x, y });
}

/** The centre plus eight points on a ring around it, in a fixed order. */
export function candidatesAround(centre: Vector2, radius: number): Vector2[] {
  const points: Vector2[] = [clampToPitch(centre)];
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    points.push(
      clampToPitch({
        x: centre.x + Math.cos(angle) * radius,
        y: centre.y + Math.sin(angle) * radius,
      }),
    );
  }
  return points;
}

/** 0–1: how far the nearest opponent is (1 at `open` metres or more). */
export function spaceScore(point: Vector2, grid: SpatialGrid, teamId: string, open = 12): number {
  const nearest = grid.nearest(point, open, (player) => player.teamId !== teamId);
  return nearest ? clamp01(nearest.distance / open) : 1;
}

/** 0–1: how clear the passing lane `from`–`to` is of opponents (1 at `clear` metres or more). */
export function laneScore(
  from: Vector2,
  to: Vector2,
  grid: SpatialGrid,
  teamId: string,
  clear = 5,
): number {
  const clearance = grid.clearanceOfSegment(from, to, clear, (player) => player.teamId !== teamId);
  return clamp01(clearance / clear);
}

/** Highest-scoring point; the first one wins ties, so the candidate order decides. */
export function bestPoint(
  points: readonly Vector2[],
  score: (point: Vector2) => number,
): { point: Vector2; score: number } {
  let best = { point: points[0]!, score: -Infinity };
  for (const point of points) {
    const value = score(point);
    if (value > best.score) best = { point, score: value };
  }
  return best;
}

/**
 * Pace for a positional move: nobody sprints a few metres. Caps `preferred` by distance:
 * walk under 3 m, jog under 8 m, run under 18 m.
 */
export function paceForDistance(d: number, preferred: MovementMode): MovementMode {
  const cap: MovementMode = d < 3 ? 'walk' : d < 8 ? 'jog' : d < 18 ? 'run' : 'sprint';
  return MOVEMENT_MODES.indexOf(cap) < MOVEMENT_MODES.indexOf(preferred) ? cap : preferred;
}
