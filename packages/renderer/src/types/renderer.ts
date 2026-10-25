import type { Vector2 } from '@touchline/shared';

/** A point in world space, in metres (x along the pitch length, y across the width). */
export type WorldPoint = Vector2;

/** A point in screen space, in device-independent pixels relative to the canvas origin. */
export type ScreenPoint = Vector2;

export interface Viewport {
  width: number;
  height: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Camera framing, independent of any match state. `centerX`/`centerY` is the world point shown at
 * the centre of the viewport; `zoom` multiplies the scale that fits `bounds` into the viewport.
 */
export interface CameraState {
  centerX: number;
  centerY: number;
  zoom: number;
}

export interface CameraConfig {
  /** World region the camera may show; at minimum zoom all of it is visible. */
  bounds: WorldBounds;
  minZoom: number;
  maxZoom: number;
}

/** Affine world→screen mapping: `screen = world * scale + translate`. */
export interface ViewTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface CenterLimits {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
