import { appendSample, samplePath } from '@touchline/planning';
import {
  DEFAULT_CAMERA_CONFIG,
  findMarkerAt,
  getPathEnd,
  getViewTransform,
  MARKER_HIT_SLACK_PX,
  PLAYER_MARKER_RADIUS,
  pointsAlongPath,
  screenDistanceTo,
  screenToWorld,
  worldToScreen,
  zoomCameraAt,
  type CameraState,
  type HitTarget,
  type Viewport,
} from '@touchline/renderer/core';
import { createInitialMatch, type Vector2 } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const VIEWPORT: Viewport = { width: 932, height: 380 };
const config = DEFAULT_CAMERA_CONFIG;
const HIT_RADIUS = PLAYER_MARKER_RADIUS + MARKER_HIT_SLACK_PX;

const CAMERAS: Array<[string, CameraState]> = [
  ['fit', { centerX: 52.5, centerY: 34, zoom: 1 }],
  ['zoom 1.7 left', { centerX: 30, centerY: 30, zoom: 1.7 }],
  ['zoom 2.5 right wing', { centerX: 80, centerY: 12, zoom: 2.5 }],
  ['zoom 4 box', { centerX: 95, centerY: 40, zoom: 4 }],
];

const snapshot = createInitialMatch();
const targets: HitTarget[] = snapshot.players.map((p) => ({ id: p.id, position: p.position }));

describe('player hit testing', () => {
  it.each(CAMERAS)('selects every player tapped on its centre (%s)', (_, camera) => {
    const transform = getViewTransform(camera, VIEWPORT, config);
    for (const target of targets) {
      const screen = worldToScreen(target.position, transform);
      expect(findMarkerAt(targets, screen, transform)).toBe(target.id);
    }
  });

  it.each(CAMERAS)('uses a constant screen-space radius at every zoom (%s)', (_, camera) => {
    const transform = getViewTransform(camera, VIEWPORT, config);
    const target = targets.find((t) => t.id.endsWith('-9'))!;
    const centre = worldToScreen(target.position, transform);
    const inside = { x: centre.x + HIT_RADIUS - 0.5, y: centre.y };
    const outside = { x: centre.x + HIT_RADIUS + 0.5, y: centre.y };
    expect(findMarkerAt([target], inside, transform)).toBe(target.id);
    expect(findMarkerAt([target], outside, transform)).toBeNull();
  });

  it('resolves overlapping hit areas to the closest marker', () => {
    const transform = getViewTransform(CAMERAS[0]![1], VIEWPORT, config);
    const overlap: HitTarget[] = [
      { id: 'a', position: { x: 50, y: 34 } },
      { id: 'b', position: { x: 51, y: 34 } },
    ];
    const a = worldToScreen(overlap[0]!.position, transform);
    const b = worldToScreen(overlap[1]!.position, transform);
    expect(findMarkerAt(overlap, { x: a.x + (b.x - a.x) * 0.3, y: a.y }, transform)).toBe('a');
    expect(findMarkerAt(overlap, { x: a.x + (b.x - a.x) * 0.7, y: a.y }, transform)).toBe('b');
  });

  it('returns null on empty pitch', () => {
    const transform = getViewTransform(CAMERAS[0]![1], VIEWPORT, config);
    const emptyCorner = worldToScreen({ x: 52.5, y: 2 }, transform);
    expect(findMarkerAt(targets, emptyCorner, transform)).toBeNull();
  });

  it('measures screen distance to a world point', () => {
    const transform = getViewTransform(CAMERAS[2]![1], VIEWPORT, config);
    const world = { x: 80, y: 12 };
    const screen = worldToScreen(world, transform);
    expect(screenDistanceTo({ x: screen.x + 3, y: screen.y + 4 }, world, transform)).toBeCloseTo(
      5,
      9,
    );
  });
});

/** Simulates a finger stroke: world path → screen touches under `camera` → world samples. */
function drawUnderCamera(worldStroke: Vector2[], camera: CameraState): Vector2[] {
  const transform = getViewTransform(camera, VIEWPORT, config);
  const touches = worldStroke.map((p) => worldToScreen(p, transform));
  const live: Vector2[] = [worldStroke[0]!];
  for (const touch of touches.slice(1)) appendSample(live, screenToWorld(touch, transform));
  return live;
}

describe('screen → world conversion while drawing', () => {
  const stroke: Vector2[] = Array.from({ length: 120 }, (_, i) => ({
    x: 40 + i * 0.25,
    y: 30 + 8 * Math.sin(i / 20),
  }));

  it.each(CAMERAS)('reproduces the same world path under any camera (%s)', (_, camera) => {
    const reference = drawUnderCamera(stroke, CAMERAS[0]![1]);
    const drawn = drawUnderCamera(stroke, camera);
    expect(drawn).toHaveLength(reference.length);
    drawn.forEach((point, i) => {
      expect(point.x).toBeCloseTo(reference[i]!.x, 9);
      expect(point.y).toBeCloseTo(reference[i]!.y, 9);
    });
  });

  it('keeps stored paths fixed in world space when the camera moves afterwards', () => {
    const path = samplePath(stroke[0]!, drawUnderCamera(stroke, CAMERAS[1]![1]).slice(1));
    const copy = path.map((p) => ({ ...p }));
    let camera = CAMERAS[1]![1];
    for (let i = 0; i < 5; i += 1) {
      camera = zoomCameraAt(
        camera,
        { x: 400, y: 200 },
        camera.zoom * 1.3,
        { x: 380 - i * 20, y: 190 },
        VIEWPORT,
        config,
      );
      const transform = getViewTransform(camera, VIEWPORT, config);
      // Screen positions follow the transform exactly; the world path itself is untouched.
      for (const point of path) {
        const back = screenToWorld(worldToScreen(point, transform), transform);
        expect(back.x).toBeCloseTo(point.x, 9);
        expect(back.y).toBeCloseTo(point.y, 9);
      }
    }
    expect(path).toEqual(copy);
  });

  it('spaces samples in metres, so point count is zoom-independent and below the raw event count', () => {
    const fit = drawUnderCamera(stroke, CAMERAS[0]![1]);
    const zoomed = drawUnderCamera(stroke, CAMERAS[3]![1]);
    // Spacing is defined in metres, so point count is independent of zoom.
    expect(zoomed.length).toBe(fit.length);
    expect(fit.length).toBeLessThan(stroke.length);
  });
});

describe('path geometry', () => {
  it('reports the end point and heading, skipping duplicate end points', () => {
    const end = getPathEnd([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(end?.point).toEqual({ x: 10, y: 0 });
    expect(end?.angle).toBeCloseTo(0, 9);
    expect(getPathEnd([{ x: 1, y: 1 }])).toBeNull();
    expect(
      getPathEnd([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toBeNull();
  });

  it('places direction marks at even spacing along the path', () => {
    const marks = pointsAlongPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      4,
    );
    expect(marks.map((m) => m.point)).toEqual([
      { x: 4, y: 0 },
      { x: 8, y: 0 },
      { x: 10, y: 2 },
      { x: 10, y: 6 },
      { x: 10, y: 10 },
    ]);
    expect(marks[0]!.angle).toBeCloseTo(0, 9);
    expect(marks[3]!.angle).toBeCloseTo(Math.PI / 2, 9);
    expect(
      pointsAlongPath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        4,
        4,
        3,
      ),
    ).toHaveLength(1);
  });
});
