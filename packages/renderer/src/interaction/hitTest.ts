import { worldToScreen } from '../coordinates/worldToScreen';
import type { ScreenPoint, ViewTransform, WorldPoint } from '../types/renderer';

/** Marker radius in screen pixels; constant at every zoom level. */
export const PLAYER_MARKER_RADIUS = 13;
/** Extra screen-space slack so small markers stay easy to tap. */
export const MARKER_HIT_SLACK_PX = 8;

export interface HitTarget {
  id: string;
  position: WorldPoint;
}

/**
 * Finds the marker under a screen point. Markers keep a fixed screen size, so the test runs in
 * screen space and is equally accurate at every zoom. Overlapping hit areas resolve to the
 * closest marker centre.
 */
export function findMarkerAt(
  targets: readonly HitTarget[],
  point: ScreenPoint,
  transform: ViewTransform,
  hitRadiusPx: number = PLAYER_MARKER_RADIUS + MARKER_HIT_SLACK_PX,
): string | null {
  'worklet';
  let bestId: string | null = null;
  let bestDistance = hitRadiusPx;
  for (const target of targets) {
    const screen = worldToScreen(target.position, transform);
    const d = Math.hypot(screen.x - point.x, screen.y - point.y);
    if (d <= bestDistance) {
      bestDistance = d;
      bestId = target.id;
    }
  }
  return bestId;
}

/** Screen-space distance between a screen point and a world point. */
export function screenDistanceTo(
  point: ScreenPoint,
  world: WorldPoint,
  transform: ViewTransform,
): number {
  'worklet';
  const screen = worldToScreen(world, transform);
  return Math.hypot(screen.x - point.x, screen.y - point.y);
}
