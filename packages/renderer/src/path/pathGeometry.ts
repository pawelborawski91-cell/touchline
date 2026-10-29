import type { WorldPoint } from '../types/renderer';

export interface PathHeading {
  point: WorldPoint;
  /** Direction of travel in radians (screen/world share orientation: +y is down). */
  angle: number;
}

/** End point and final heading of a polyline, or null when it has no length. */
export function getPathEnd(points: readonly WorldPoint[]): PathHeading | null {
  'worklet';
  const n = points.length;
  if (n < 2) return null;
  const end = points[n - 1]!;
  for (let i = n - 2; i >= 0; i -= 1) {
    const from = points[i]!;
    const dx = end.x - from.x;
    const dy = end.y - from.y;
    if (dx * dx + dy * dy > 1e-8) return { point: end, angle: Math.atan2(dy, dx) };
  }
  return null;
}

/**
 * Positions and headings spaced `spacing` metres apart along a polyline, for direction chevrons.
 * The first chevron sits at `offset`; none are placed within `endMargin` of the end.
 */
export function pointsAlongPath(
  points: readonly WorldPoint[],
  spacing: number,
  offset: number = spacing,
  endMargin = 0,
): PathHeading[] {
  'worklet';
  const result: PathHeading[] = [];
  if (points.length < 2 || spacing <= 0) return result;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  let target = offset;
  let travelled = 0;
  for (let i = 1; i < points.length && target <= total - endMargin; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    while (target <= travelled + length && target <= total - endMargin) {
      const t = (target - travelled) / length;
      result.push({ point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle });
      target += spacing;
    }
    travelled += length;
  }
  return result;
}
