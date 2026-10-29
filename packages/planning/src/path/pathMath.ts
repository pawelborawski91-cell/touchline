import type { Vector2 } from '@touchline/shared';

export function distance(a: Vector2, b: Vector2): number {
  'worklet';
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pathLength(path: readonly Vector2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += distance(path[i - 1]!, path[i]!);
  return total;
}

/** Perpendicular distance from `point` to the segment `a`–`b`. */
export function distanceToSegment(point: Vector2, a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}
