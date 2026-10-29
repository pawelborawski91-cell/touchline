import {
  appendSample,
  clampToBounds,
  DEFAULT_SAMPLE_SPACING,
  distanceToSegment,
  MIN_PATH_LENGTH,
  pathLength,
  PITCH_BOUNDS,
  removeLastPoint,
  samplePath,
  simplifyPath,
  validatePath,
} from '@touchline/planning';
import { FIELD_LENGTH, FIELD_WIDTH, type Vector2 } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

/** Dense "touch events" along a quarter circle, as a finger would produce them. */
function arcTouches(centre: Vector2, radius: number, count: number): Vector2[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = ((i + 1) / count) * (Math.PI / 2);
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
  });
}

describe('appendSample', () => {
  it('drops samples closer than the minimum spacing', () => {
    const path: Vector2[] = [{ x: 10, y: 10 }];
    expect(appendSample(path, { x: 10.1, y: 10 })).toBe(false);
    expect(appendSample(path, { x: 10 + DEFAULT_SAMPLE_SPACING, y: 10 })).toBe(true);
    expect(path).toHaveLength(2);
  });

  it('clamps samples to the pitch and rejects non-finite input', () => {
    const path: Vector2[] = [{ x: 1, y: 1 }];
    appendSample(path, { x: -20, y: 90 });
    expect(path[1]).toEqual({ x: 0, y: FIELD_WIDTH });
    expect(appendSample(path, { x: Number.NaN, y: 3 })).toBe(false);
    expect(appendSample(path, { x: 3, y: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe('samplePath', () => {
  it('pins the first point to the player position', () => {
    const start = { x: 30, y: 20 };
    const path = samplePath(start, [
      { x: 35, y: 20 },
      { x: 40, y: 22 },
    ]);
    expect(path[0]).toEqual(start);
  });

  it('does not store every raw touch event', () => {
    const raw = Array.from({ length: 400 }, (_, i) => ({ x: 20 + i * 0.05, y: 30 }));
    const path = samplePath({ x: 20, y: 30 }, raw);
    // A straight 20 m stroke collapses to its endpoints.
    expect(path).toHaveLength(2);
    expect(path[1]!.x).toBeCloseTo(39.95, 5);
  });

  it('always ends at the release point, even inside the sample spacing', () => {
    const path = samplePath({ x: 10, y: 10 }, [
      { x: 12, y: 10 },
      { x: 12.2, y: 10 },
    ]);
    expect(path[path.length - 1]).toEqual({ x: 12.2, y: 10 });
  });

  it('removes collinear points but preserves curves', () => {
    const centre = { x: 50, y: 30 };
    const radius = 15;
    const start = { x: centre.x + radius, y: centre.y };
    const path = samplePath(start, arcTouches(centre, radius, 300));
    expect(path.length).toBeGreaterThan(5);
    expect(path.length).toBeLessThan(60);
    // Every stored point stays on the arc, and the polyline hugs it closely.
    for (const point of path) {
      expect(Math.hypot(point.x - centre.x, point.y - centre.y)).toBeCloseTo(radius, 5);
    }
    const quarterArc = (Math.PI / 2) * radius;
    expect(pathLength(path)).toBeGreaterThan(quarterArc * 0.99);
  });

  it('keeps every simplified point within tolerance of the original stroke', () => {
    const raw: Vector2[] = [];
    for (let i = 0; i <= 200; i += 1) raw.push({ x: 10 + i * 0.2, y: 34 + 6 * Math.sin(i / 15) });
    const spaced = samplePath(raw[0]!, raw.slice(1), { tolerance: 0 });
    const simplified = simplifyPath(spaced, 0.12);
    for (const point of spaced) {
      let best = Infinity;
      for (let i = 1; i < simplified.length; i += 1) {
        best = Math.min(best, distanceToSegment(point, simplified[i - 1]!, simplified[i]!));
      }
      expect(best).toBeLessThanOrEqual(0.12 + 1e-9);
    }
  });

  it('constrains strokes that leave the pitch to its bounds', () => {
    const path = samplePath({ x: 100, y: 60 }, [
      { x: 104, y: 66 },
      { x: 112, y: 75 },
      { x: 120, y: 80 },
    ]);
    for (const point of path) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(FIELD_LENGTH);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(FIELD_WIDTH);
    }
    expect(path[path.length - 1]).toEqual({ x: FIELD_LENGTH, y: FIELD_WIDTH });
  });
});

describe('removeLastPoint', () => {
  it('removes one point but never the anchored start', () => {
    const path = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(removeLastPoint(path)).toEqual(path.slice(0, 2));
    expect(removeLastPoint(removeLastPoint(removeLastPoint(path)))).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('validatePath', () => {
  it('accepts a valid path and reports its length', () => {
    const result = validatePath([
      { x: 10, y: 10 },
      { x: 13, y: 14 },
    ]);
    expect(result).toEqual({
      ok: true,
      path: [
        { x: 10, y: 10 },
        { x: 13, y: 14 },
      ],
      length: 5,
    });
  });

  it('requires at least two points', () => {
    expect(validatePath([])).toEqual({ ok: false, reason: 'too_few_points' });
    expect(validatePath([{ x: 3, y: 3 }])).toEqual({ ok: false, reason: 'too_few_points' });
  });

  it(`rejects paths shorter than ${MIN_PATH_LENGTH} m`, () => {
    expect(
      validatePath([
        { x: 3, y: 3 },
        { x: 3.6, y: 3.6 },
      ]),
    ).toEqual({
      ok: false,
      reason: 'too_short',
    });
    expect(
      validatePath([
        { x: 3, y: 3 },
        { x: 4, y: 3 },
      ]).ok,
    ).toBe(true);
  });

  it('rejects non-finite coordinates', () => {
    expect(
      validatePath([
        { x: 3, y: 3 },
        { x: Number.NaN, y: 4 },
      ]),
    ).toEqual({
      ok: false,
      reason: 'non_finite',
    });
  });

  it('clamps to the field before measuring', () => {
    const result = validatePath([
      { x: 104.5, y: 30 },
      { x: 130, y: 30 },
    ]);
    // Only 0.5 m of the stroke is on the pitch.
    expect(result).toEqual({ ok: false, reason: 'too_short' });
    const inside = validatePath([
      { x: 90, y: -5 },
      { x: 110, y: 80 },
    ]);
    expect(inside.ok && inside.path).toEqual([
      { x: 90, y: 0 },
      { x: FIELD_LENGTH, y: FIELD_WIDTH },
    ]);
  });

  it('clampToBounds uses the pitch by default', () => {
    expect(PITCH_BOUNDS).toEqual({ minX: 0, minY: 0, maxX: FIELD_LENGTH, maxY: FIELD_WIDTH });
    expect(clampToBounds({ x: -1, y: 99 })).toEqual({ x: 0, y: FIELD_WIDTH });
  });
});
