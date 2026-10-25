import type { ScreenPoint, ViewTransform, WorldPoint } from '../types/renderer';

export function screenToWorld(point: ScreenPoint, transform: ViewTransform): WorldPoint {
  'worklet';
  return {
    x: (point.x - transform.translateX) / transform.scale,
    y: (point.y - transform.translateY) / transform.scale,
  };
}

/** Converts a screen distance in pixels to world metres. */
export function screenLengthToWorld(pixels: number, transform: ViewTransform): number {
  'worklet';
  return pixels / transform.scale;
}
