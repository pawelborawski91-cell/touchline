import type { Vector2 } from '@touchline/shared';

import { clampToBounds, PITCH_BOUNDS, type FieldBounds } from './PathValidator';
import { distance, distanceToSegment } from './pathMath';

/** Minimum world distance between stored samples while the finger moves. */
export const DEFAULT_SAMPLE_SPACING = 0.5;
/** Maximum deviation (metres) a removed point may have from the simplified polyline. */
export const DEFAULT_SIMPLIFY_TOLERANCE = 0.12;

/**
 * Appends a touch sample to a path being drawn (UI-thread safe). The sample is clamped to the
 * bounds and dropped when it is closer than `minSpacing` to the last stored point, so raw touch
 * events are never stored one-to-one. Mutates and returns `path` to avoid per-event allocation.
 */
export function appendSample(
  path: Vector2[],
  sample: Vector2,
  minSpacing: number = DEFAULT_SAMPLE_SPACING,
  bounds: FieldBounds = PITCH_BOUNDS,
): boolean {
  'worklet';
  if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return false;
  const point = clampToBounds(sample, bounds);
  const last = path[path.length - 1];
  if (last && distance(last, point) < minSpacing) return false;
  path.push(point);
  return true;
}

/**
 * Ramer–Douglas–Peucker simplification. Removes collinear and redundant points while keeping
 * every point that deviates more than `tolerance`, so curves survive. Endpoints are kept.
 */
export function simplifyPath(
  path: readonly Vector2[],
  tolerance: number = DEFAULT_SIMPLIFY_TOLERANCE,
): Vector2[] {
  if (path.length <= 2) return path.map((point) => ({ ...point }));
  const keep = new Array<boolean>(path.length).fill(false);
  keep[0] = true;
  keep[path.length - 1] = true;
  const stack: Array<[number, number]> = [[0, path.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = distanceToSegment(path[i]!, path[start]!, path[end]!);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return path.filter((_, i) => keep[i]).map((point) => ({ ...point }));
}

export interface SamplePathOptions {
  minSpacing?: number;
  tolerance?: number;
  bounds?: FieldBounds;
}

/**
 * Turns raw world-space touch samples into a stored path: the first point is pinned to the
 * player's position, samples are spaced, clamped, and then simplified.
 */
export function samplePath(
  start: Vector2,
  rawPoints: readonly Vector2[],
  options: SamplePathOptions = {},
): Vector2[] {
  const minSpacing = options.minSpacing ?? DEFAULT_SAMPLE_SPACING;
  const bounds = options.bounds ?? PITCH_BOUNDS;
  const spaced: Vector2[] = [clampToBounds(start, bounds)];
  for (const point of rawPoints) appendSample(spaced, point, minSpacing, bounds);
  // The release position is where the user aimed, so it always ends the path, even when it
  // falls inside the spacing of the previous sample.
  const release = [...rawPoints]
    .reverse()
    .find((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (release) {
    const end = clampToBounds(release, bounds);
    const last = spaced[spaced.length - 1]!;
    if (distance(last, end) > 1e-9) {
      if (spaced.length > 1 && distance(last, end) < minSpacing / 2)
        spaced[spaced.length - 1] = end;
      else spaced.push(end);
    }
  }
  return simplifyPath(spaced, options.tolerance ?? DEFAULT_SIMPLIFY_TOLERANCE);
}

/** Removes the last editable point; the anchored start point is never removed. */
export function removeLastPoint(path: readonly Vector2[]): Vector2[] {
  return path.slice(0, Math.max(1, path.length - 1)).map((point) => ({ ...point }));
}
