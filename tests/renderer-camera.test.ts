import {
  clampCamera,
  clampZoom,
  createInitialCamera,
  DEFAULT_CAMERA_CONFIG,
  getCenterLimits,
  getViewTransform,
  panCamera,
  PITCH_BOUNDS,
  screenToWorld,
  worldToScreen,
  zoomCameraAt,
  type CameraState,
  type Viewport,
} from '@touchline/renderer/core';
import { FIELD_LENGTH, FIELD_WIDTH } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const config = DEFAULT_CAMERA_CONFIG;
const EPS = 1e-9;

const VIEWPORTS: Record<string, Viewport> = {
  'phone landscape': { width: 932, height: 430 },
  'small phone landscape': { width: 667, height: 375 },
  'tablet landscape': { width: 1366, height: 1024 },
  'ultra-wide': { width: 2520, height: 1080 },
};
const viewportCases = Object.entries(VIEWPORTS);

function visibleWorldRect(camera: CameraState, viewport: Viewport) {
  const transform = getViewTransform(camera, viewport, config);
  const topLeft = screenToWorld({ x: 0, y: 0 }, transform);
  const bottomRight = screenToWorld({ x: viewport.width, y: viewport.height }, transform);
  return { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y };
}

function expectViewInsideBounds(camera: CameraState, viewport: Viewport) {
  const view = visibleWorldRect(camera, viewport);
  const boundsWidth = PITCH_BOUNDS.maxX - PITCH_BOUNDS.minX;
  const boundsHeight = PITCH_BOUNDS.maxY - PITCH_BOUNDS.minY;
  // On an axis where the view is wider than the bounds it must be centred; otherwise contained.
  if (view.maxX - view.minX >= boundsWidth) {
    expect((view.minX + view.maxX) / 2).toBeCloseTo((PITCH_BOUNDS.minX + PITCH_BOUNDS.maxX) / 2);
  } else {
    expect(view.minX).toBeGreaterThanOrEqual(PITCH_BOUNDS.minX - EPS);
    expect(view.maxX).toBeLessThanOrEqual(PITCH_BOUNDS.maxX + EPS);
  }
  if (view.maxY - view.minY >= boundsHeight) {
    expect((view.minY + view.maxY) / 2).toBeCloseTo((PITCH_BOUNDS.minY + PITCH_BOUNDS.maxY) / 2);
  } else {
    expect(view.minY).toBeGreaterThanOrEqual(PITCH_BOUNDS.minY - EPS);
    expect(view.maxY).toBeLessThanOrEqual(PITCH_BOUNDS.maxY + EPS);
  }
}

describe('zoom limits', () => {
  it('defines a sensible range', () => {
    expect(config.minZoom).toBe(1);
    expect(config.maxZoom).toBeGreaterThan(config.minZoom);
  });

  it('clamps zoom to [minZoom, maxZoom]', () => {
    expect(clampZoom(0.2, config)).toBe(config.minZoom);
    expect(clampZoom(config.maxZoom * 3, config)).toBe(config.maxZoom);
    expect(clampZoom(2.2, config)).toBe(2.2);
  });

  it.each(viewportCases)('clampCamera enforces the zoom range on %s', (_name, viewport) => {
    const base = createInitialCamera(config);
    expect(clampCamera({ ...base, zoom: 0.01 }, viewport, config).zoom).toBe(config.minZoom);
    expect(clampCamera({ ...base, zoom: 99 }, viewport, config).zoom).toBe(config.maxZoom);
  });

  it.each(viewportCases)(
    'pinching past the limits clamps instead of jumping (%s)',
    (_name, viewport) => {
      const start = createInitialCamera(config);
      const focal = { x: viewport.width * 0.7, y: viewport.height * 0.4 };
      expect(zoomCameraAt(start, focal, 50, focal, viewport, config).zoom).toBe(config.maxZoom);
      expect(zoomCameraAt(start, focal, 0.1, focal, viewport, config).zoom).toBe(config.minZoom);
    },
  );
});

describe.each(viewportCases)('camera boundaries on %s', (_name, viewport) => {
  it('shows the entire pitch at minimum zoom', () => {
    const camera = clampCamera(createInitialCamera(config), viewport, config);
    const transform = getViewTransform(camera, viewport, config);
    for (const corner of [
      { x: 0, y: 0 },
      { x: FIELD_LENGTH, y: 0 },
      { x: 0, y: FIELD_WIDTH },
      { x: FIELD_LENGTH, y: FIELD_WIDTH },
    ]) {
      const screen = worldToScreen(corner, transform);
      expect(screen.x).toBeGreaterThanOrEqual(-EPS);
      expect(screen.x).toBeLessThanOrEqual(viewport.width + EPS);
      expect(screen.y).toBeGreaterThanOrEqual(-EPS);
      expect(screen.y).toBeLessThanOrEqual(viewport.height + EPS);
    }
  });

  it('cannot be panned at minimum zoom along an axis that already fits', () => {
    const start = clampCamera(createInitialCamera(config), viewport, config);
    const moved = panCamera(start, 5000, -5000, viewport, config);
    expectViewInsideBounds(moved, viewport);
    const limits = getCenterLimits(config.minZoom, viewport, config);
    expect(limits.minX === limits.maxX || limits.minY === limits.maxY).toBe(true);
  });

  it.each([1.5, 2.5, 4])(
    'keeps the view inside the bounds when panned far away at zoom %s',
    (zoom) => {
      const start = clampCamera({ ...createInitialCamera(config), zoom }, viewport, config);
      for (const [dx, dy] of [
        [1e5, 1e5],
        [-1e5, 1e5],
        [1e5, -1e5],
        [-1e5, -1e5],
      ] as const) {
        expectViewInsideBounds(panCamera(start, dx, dy, viewport, config), viewport);
      }
    },
  );

  it('clamps an out-of-range centre back inside', () => {
    const camera = clampCamera({ centerX: -500, centerY: 900, zoom: 3 }, viewport, config);
    expectViewInsideBounds(camera, viewport);
  });

  it('pans 1:1 with the finger while away from the edges', () => {
    const start = clampCamera({ centerX: 52.5, centerY: 34, zoom: 3 }, viewport, config);
    const finger = { x: viewport.width / 2, y: viewport.height / 2 };
    const before = screenToWorld(finger, getViewTransform(start, viewport, config));
    const moved = panCamera(start, 12, -7, viewport, config);
    const after = worldToScreen(before, getViewTransform(moved, viewport, config));
    expect(after.x).toBeCloseTo(finger.x + 12, 6);
    expect(after.y).toBeCloseTo(finger.y - 7, 6);
  });

  it.each([2, 2.8, 3.5])('keeps the focal world point fixed when zooming to %s', (zoom) => {
    const start = clampCamera({ centerX: 52.5, centerY: 34, zoom: 1.2 }, viewport, config);
    const focal = { x: viewport.width * 0.5 + 15, y: viewport.height * 0.5 - 10 };
    const anchor = screenToWorld(focal, getViewTransform(start, viewport, config));
    const zoomed = zoomCameraAt(start, focal, zoom, focal, viewport, config);
    const after = worldToScreen(anchor, getViewTransform(zoomed, viewport, config));
    expect(zoomed.zoom).toBe(zoom);
    expect(after.x).toBeCloseTo(focal.x, 6);
    expect(after.y).toBeCloseTo(focal.y, 6);
  });

  it('follows a moving focal point during a pinch (two-finger pan)', () => {
    const start = clampCamera({ centerX: 52.5, centerY: 34, zoom: 2 }, viewport, config);
    const startFocal = { x: viewport.width / 2, y: viewport.height / 2 };
    const anchor = screenToWorld(startFocal, getViewTransform(start, viewport, config));
    const focal = { x: startFocal.x + 20, y: startFocal.y + 8 };
    const zoomed = zoomCameraAt(start, startFocal, 2.4, focal, viewport, config);
    const after = worldToScreen(anchor, getViewTransform(zoomed, viewport, config));
    expect(after.x).toBeCloseTo(focal.x, 6);
    expect(after.y).toBeCloseTo(focal.y, 6);
  });

  it('keeps the view inside the bounds when zooming near a corner', () => {
    const start = clampCamera(createInitialCamera(config), viewport, config);
    const corner = { x: 2, y: 2 };
    for (const zoom of [1.1, 2, 4]) {
      expectViewInsideBounds(zoomCameraAt(start, corner, zoom, corner, viewport, config), viewport);
    }
  });
});

describe('degenerate viewports', () => {
  it('does not produce NaN before layout', () => {
    const empty = { width: 0, height: 0 };
    const camera = clampCamera(createInitialCamera(config), empty, config);
    expect(Number.isFinite(camera.centerX)).toBe(true);
    expect(Number.isFinite(camera.centerY)).toBe(true);
    expect(panCamera(camera, 10, 10, empty, config)).toEqual(camera);
    expect(zoomCameraAt(camera, { x: 0, y: 0 }, 2, { x: 0, y: 0 }, empty, config)).toEqual(camera);
  });
});
