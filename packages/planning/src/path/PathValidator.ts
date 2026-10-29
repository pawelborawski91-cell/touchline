import { FIELD_LENGTH, FIELD_WIDTH, type Vector2 } from '@touchline/shared';

import { pathLength } from './pathMath';

export interface FieldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Movement paths are constrained to the playing surface (touchlines and goal lines). */
export const PITCH_BOUNDS: FieldBounds = {
  minX: 0,
  minY: 0,
  maxX: FIELD_LENGTH,
  maxY: FIELD_WIDTH,
};

export const MIN_PATH_LENGTH = 1;

export function clampToBounds(point: Vector2, bounds: FieldBounds = PITCH_BOUNDS): Vector2 {
  'worklet';
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, point.y)),
  };
}

export function isFinitePoint(point: Vector2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export type PathRejection = 'too_few_points' | 'non_finite' | 'too_short';

export type PathValidationResult =
  { ok: true; path: Vector2[]; length: number } | { ok: false; reason: PathRejection };

export interface ValidatePathOptions {
  bounds?: FieldBounds;
  minLength?: number;
}

/**
 * Validates a world-space path: every coordinate finite, at least two points, clamped to the
 * pitch, and at least `minLength` metres long after clamping. Returns the clamped copy.
 */
export function validatePath(
  path: readonly Vector2[],
  options: ValidatePathOptions = {},
): PathValidationResult {
  const bounds = options.bounds ?? PITCH_BOUNDS;
  const minLength = options.minLength ?? MIN_PATH_LENGTH;
  if (path.length < 2) return { ok: false, reason: 'too_few_points' };
  if (!path.every(isFinitePoint)) return { ok: false, reason: 'non_finite' };
  const clamped = path.map((point) => clampToBounds(point, bounds));
  const length = pathLength(clamped);
  if (length < minLength) return { ok: false, reason: 'too_short' };
  return { ok: true, path: clamped, length };
}

export function describeRejection(reason: PathRejection): string {
  switch (reason) {
    case 'too_few_points':
      return 'Drag further to draw a path';
    case 'non_finite':
      return 'Path could not be read — try again';
    case 'too_short':
      return `Path too short (minimum ${MIN_PATH_LENGTH} m)`;
  }
}
