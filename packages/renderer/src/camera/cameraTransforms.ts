import { FIELD_LENGTH, FIELD_WIDTH, GOAL_DEPTH } from '@touchline/shared';

import { screenToWorld } from '../coordinates/screenToWorld';
import type {
  CameraConfig,
  CameraState,
  CenterLimits,
  ScreenPoint,
  ViewTransform,
  Viewport,
  WorldBounds,
} from '../types/renderer';

/** Run-off shown around the touchlines and goal lines; leaves room for the goals and markers. */
export const PITCH_SURROUND_METRES = GOAL_DEPTH + 2;

export const PITCH_BOUNDS: Readonly<WorldBounds> = Object.freeze({
  minX: -PITCH_SURROUND_METRES,
  minY: -PITCH_SURROUND_METRES,
  maxX: FIELD_LENGTH + PITCH_SURROUND_METRES,
  maxY: FIELD_WIDTH + PITCH_SURROUND_METRES,
});

export const DEFAULT_CAMERA_CONFIG: Readonly<CameraConfig> = Object.freeze({
  bounds: PITCH_BOUNDS,
  minZoom: 1,
  maxZoom: 4,
});

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

export function createInitialCamera(config: CameraConfig): CameraState {
  'worklet';
  return {
    centerX: (config.bounds.minX + config.bounds.maxX) / 2,
    centerY: (config.bounds.minY + config.bounds.maxY) / 2,
    zoom: config.minZoom,
  };
}

/** Scale (pixels per metre) at which `bounds` exactly fits inside `viewport`. */
export function getFitScale(viewport: Viewport, bounds: WorldBounds): number {
  'worklet';
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (viewport.width <= 0 || viewport.height <= 0 || width <= 0 || height <= 0) return 0;
  return Math.min(viewport.width / width, viewport.height / height);
}

export function getCameraScale(
  camera: CameraState,
  viewport: Viewport,
  config: CameraConfig,
): number {
  'worklet';
  return getFitScale(viewport, config.bounds) * camera.zoom;
}

export function getViewTransform(
  camera: CameraState,
  viewport: Viewport,
  config: CameraConfig,
): ViewTransform {
  'worklet';
  const scale = getCameraScale(camera, viewport, config);
  return {
    scale,
    translateX: viewport.width / 2 - camera.centerX * scale,
    translateY: viewport.height / 2 - camera.centerY * scale,
  };
}

export function clampZoom(zoom: number, config: CameraConfig): number {
  'worklet';
  return clamp(zoom, config.minZoom, config.maxZoom);
}

/**
 * Range the camera centre may take at `zoom` so the view never leaves `bounds`. On an axis where
 * the view is larger than the bounds, the centre is pinned to the middle of the bounds.
 */
export function getCenterLimits(
  zoom: number,
  viewport: Viewport,
  config: CameraConfig,
): CenterLimits {
  'worklet';
  const { bounds } = config;
  const scale = getFitScale(viewport, bounds) * zoom;
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  if (scale <= 0) return { minX: midX, maxX: midX, minY: midY, maxY: midY };

  const halfViewX = viewport.width / scale / 2;
  const halfViewY = viewport.height / scale / 2;
  const limitX =
    halfViewX * 2 >= bounds.maxX - bounds.minX
      ? { min: midX, max: midX }
      : { min: bounds.minX + halfViewX, max: bounds.maxX - halfViewX };
  const limitY =
    halfViewY * 2 >= bounds.maxY - bounds.minY
      ? { min: midY, max: midY }
      : { min: bounds.minY + halfViewY, max: bounds.maxY - halfViewY };
  return { minX: limitX.min, maxX: limitX.max, minY: limitY.min, maxY: limitY.max };
}

/** Returns a camera with zoom clamped to its limits and the centre kept inside the bounds. */
export function clampCamera(
  camera: CameraState,
  viewport: Viewport,
  config: CameraConfig,
): CameraState {
  'worklet';
  const zoom = clampZoom(camera.zoom, config);
  const limits = getCenterLimits(zoom, viewport, config);
  return {
    zoom,
    centerX: clamp(camera.centerX, limits.minX, limits.maxX),
    centerY: clamp(camera.centerY, limits.minY, limits.maxY),
  };
}

/** Moves the camera so the content follows a screen-space drag of (`dx`, `dy`) pixels. */
export function panCamera(
  camera: CameraState,
  dx: number,
  dy: number,
  viewport: Viewport,
  config: CameraConfig,
): CameraState {
  'worklet';
  const scale = getCameraScale(camera, viewport, config);
  if (scale <= 0) return camera;
  return clampCamera(
    { ...camera, centerX: camera.centerX - dx / scale, centerY: camera.centerY - dy / scale },
    viewport,
    config,
  );
}

/**
 * Zooms relative to `start` so the world point under `startFocal` ends up under `focal`.
 * Passing the same point for both gives a pure zoom about that point; letting them differ
 * supports panning with two fingers during a pinch.
 */
export function zoomCameraAt(
  start: CameraState,
  startFocal: ScreenPoint,
  zoom: number,
  focal: ScreenPoint,
  viewport: Viewport,
  config: CameraConfig,
): CameraState {
  'worklet';
  const startTransform = getViewTransform(start, viewport, config);
  if (startTransform.scale <= 0) return start;
  const anchor = screenToWorld(startFocal, startTransform);
  const nextZoom = clampZoom(zoom, config);
  const nextScale = getFitScale(viewport, config.bounds) * nextZoom;
  return clampCamera(
    {
      zoom: nextZoom,
      centerX: anchor.x - (focal.x - viewport.width / 2) / nextScale,
      centerY: anchor.y - (focal.y - viewport.height / 2) / nextScale,
    },
    viewport,
    config,
  );
}
