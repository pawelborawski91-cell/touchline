import {
  DEFAULT_CAMERA_CONFIG,
  getFitScale,
  getViewTransform,
  PITCH_BOUNDS,
  screenLengthToWorld,
  screenToWorld,
  worldLengthToScreen,
  worldToScreen,
  type CameraState,
  type ViewTransform,
  type Viewport,
  type WorldPoint,
} from '@touchline/renderer/core';
import { FIELD_LENGTH, FIELD_WIDTH } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const VIEWPORTS: Record<string, Viewport> = {
  'iPhone SE landscape': { width: 667, height: 375 },
  'iPhone 15 Pro Max landscape': { width: 932, height: 430 },
  'Pixel 8 landscape': { width: 915, height: 412 },
  'iPad Pro 12.9 landscape': { width: 1366, height: 1024 },
  'ultra-wide 21:9': { width: 2520, height: 1080 },
};

const ZOOMS = [1, 1.6, 2.5, 4];

const WORLD_POINTS: WorldPoint[] = [
  { x: 0, y: 0 },
  { x: FIELD_LENGTH, y: FIELD_WIDTH },
  { x: FIELD_LENGTH / 2, y: FIELD_WIDTH / 2 },
  { x: 11, y: 34 },
  { x: 88.3, y: 12.7 },
  { x: -3.5, y: 70.2 },
];

const viewportCases = Object.entries(VIEWPORTS);

function expectPointClose(actual: WorldPoint, expected: WorldPoint, digits = 9) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

describe('worldToScreen / screenToWorld', () => {
  const transform: ViewTransform = { scale: 8, translateX: 20, translateY: -10 };

  it('applies scale then translation', () => {
    expect(worldToScreen({ x: 10, y: 5 }, transform)).toEqual({ x: 100, y: 30 });
    expect(worldToScreen({ x: 0, y: 0 }, transform)).toEqual({ x: 20, y: -10 });
  });

  it('inverts the world-to-screen mapping', () => {
    expect(screenToWorld({ x: 100, y: 30 }, transform)).toEqual({ x: 10, y: 5 });
    expect(screenToWorld({ x: 20, y: -10 }, transform)).toEqual({ x: 0, y: 0 });
  });

  it('converts lengths with the scale only', () => {
    expect(worldLengthToScreen(9.15, transform)).toBeCloseTo(73.2);
    expect(screenLengthToWorld(73.2, transform)).toBeCloseTo(9.15);
  });

  it('does not mutate its inputs', () => {
    const point = Object.freeze({ x: 3, y: 4 });
    const frozen = Object.freeze({ ...transform });
    expect(() => screenToWorld(worldToScreen(point, frozen), frozen)).not.toThrow();
  });
});

describe.each(viewportCases)('camera transform on %s', (_name, viewport) => {
  it.each(ZOOMS)('round-trips world → screen → world at zoom %s', (zoom) => {
    const camera: CameraState = { centerX: 40, centerY: 30, zoom };
    const transform = getViewTransform(camera, viewport, DEFAULT_CAMERA_CONFIG);
    for (const point of WORLD_POINTS) {
      expectPointClose(screenToWorld(worldToScreen(point, transform), transform), point);
    }
  });

  it.each(ZOOMS)('round-trips screen → world → screen at zoom %s', (zoom) => {
    const camera: CameraState = { centerX: 70, centerY: 20, zoom };
    const transform = getViewTransform(camera, viewport, DEFAULT_CAMERA_CONFIG);
    const screenPoints = [
      { x: 0, y: 0 },
      { x: viewport.width, y: viewport.height },
      { x: viewport.width * 0.31, y: viewport.height * 0.77 },
    ];
    for (const point of screenPoints) {
      expectPointClose(worldToScreen(screenToWorld(point, transform), transform), point, 6);
    }
  });

  it.each(ZOOMS)('puts the camera centre at the viewport centre at zoom %s', (zoom) => {
    const camera: CameraState = { centerX: 61.2, centerY: 25.4, zoom };
    const transform = getViewTransform(camera, viewport, DEFAULT_CAMERA_CONFIG);
    expectPointClose(worldToScreen({ x: camera.centerX, y: camera.centerY }, transform), {
      x: viewport.width / 2,
      y: viewport.height / 2,
    });
  });

  it('scales linearly with zoom', () => {
    const fit = getFitScale(viewport, PITCH_BOUNDS);
    for (const zoom of ZOOMS) {
      const { scale } = getViewTransform(
        { centerX: 52.5, centerY: 34, zoom },
        viewport,
        DEFAULT_CAMERA_CONFIG,
      );
      expect(scale).toBeCloseTo(fit * zoom, 9);
    }
  });

  it('keeps the 105 × 68 m proportions on screen', () => {
    const transform = getViewTransform(
      { centerX: 52.5, centerY: 34, zoom: 1 },
      viewport,
      DEFAULT_CAMERA_CONFIG,
    );
    const topLeft = worldToScreen({ x: 0, y: 0 }, transform);
    const bottomRight = worldToScreen({ x: FIELD_LENGTH, y: FIELD_WIDTH }, transform);
    const ratio = (bottomRight.x - topLeft.x) / (bottomRight.y - topLeft.y);
    expect(ratio).toBeCloseTo(FIELD_LENGTH / FIELD_WIDTH, 9);
  });
});

describe('getFitScale', () => {
  it('fits the limiting axis exactly', () => {
    const viewport = { width: 932, height: 430 };
    const scale = getFitScale(viewport, PITCH_BOUNDS);
    const worldHeight = PITCH_BOUNDS.maxY - PITCH_BOUNDS.minY;
    const worldWidth = PITCH_BOUNDS.maxX - PITCH_BOUNDS.minX;
    expect(scale).toBeCloseTo(viewport.height / worldHeight, 9);
    expect(worldWidth * scale).toBeLessThanOrEqual(viewport.width);
  });

  it('returns 0 for an empty viewport instead of dividing by zero', () => {
    expect(getFitScale({ width: 0, height: 0 }, PITCH_BOUNDS)).toBe(0);
  });
});
