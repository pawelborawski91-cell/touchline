import type { ScreenPoint, ViewTransform, WorldPoint } from '../types/renderer';

export function worldToScreen(point: WorldPoint, transform: ViewTransform): ScreenPoint {
  'worklet';
  return {
    x: point.x * transform.scale + transform.translateX,
    y: point.y * transform.scale + transform.translateY,
  };
}

/** Converts a world distance in metres to screen pixels. */
export function worldLengthToScreen(metres: number, transform: ViewTransform): number {
  'worklet';
  return metres * transform.scale;
}
