import { useCallback, useMemo } from 'react';
import {
  useSimultaneousGestures,
  usePanGesture,
  usePinchGesture,
  useTapGesture,
  type ComposedGesture,
} from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type {
  CameraConfig,
  CameraState,
  ScreenPoint,
  ViewTransform,
  Viewport,
} from '../types/renderer';
import {
  clampCamera,
  createInitialCamera,
  DEFAULT_CAMERA_CONFIG,
  getCameraScale,
  getCenterLimits,
  getViewTransform,
  panCamera,
  zoomCameraAt,
} from './cameraTransforms';

const DOUBLE_TAP_ZOOM_FACTOR = 2.5;
const CAMERA_ANIMATION = { duration: 280, easing: Easing.out(Easing.cubic) } as const;

/** Worklets that move the camera; gesture callbacks call these on the UI thread. */
export interface CameraGestureHandlers {
  stopMotion: () => void;
  panUpdate: (changeX: number, changeY: number) => void;
  panEnd: (velocityX: number, velocityY: number) => void;
  pinchStart: (scale: number, focalX: number, focalY: number) => void;
  pinchUpdate: (scale: number, focalX: number, focalY: number) => void;
  pinchEnd: () => void;
  doubleTapZoom: (x: number, y: number) => void;
}

export interface CameraController {
  config: CameraConfig;
  centerX: SharedValue<number>;
  centerY: SharedValue<number>;
  zoom: SharedValue<number>;
  viewport: SharedValue<Viewport>;
  /** World→screen transform for the current camera, recomputed on the UI thread. */
  transform: DerivedValue<ViewTransform>;
  /** True while a two-finger pinch is zooming the camera. */
  isPinching: SharedValue<boolean>;
  /** UI-thread camera operations, composable into any gesture setup. */
  handlers: CameraGestureHandlers;
  setViewport: (viewport: Viewport) => void;
  reset: () => void;
}

/**
 * Owns camera state as Reanimated shared values so gestures update the view on the UI thread
 * without React re-renders. Holds no match state.
 */
export function useCameraController(
  config: CameraConfig = DEFAULT_CAMERA_CONFIG,
): CameraController {
  const initial = useMemo(() => createInitialCamera(config), [config]);
  const centerX = useSharedValue(initial.centerX);
  const centerY = useSharedValue(initial.centerY);
  const zoom = useSharedValue(initial.zoom);
  const viewport = useSharedValue<Viewport>({ width: 0, height: 0 });

  const isPinching = useSharedValue(false);
  const skipNextPanDelta = useSharedValue(false);
  const pinchStartCamera = useSharedValue<CameraState>(initial);
  const pinchStartFocal = useSharedValue<ScreenPoint>({ x: 0, y: 0 });
  const pinchStartScale = useSharedValue(1);

  const readCamera = useCallback((): CameraState => {
    'worklet';
    return { centerX: centerX.value, centerY: centerY.value, zoom: zoom.value };
  }, [centerX, centerY, zoom]);

  const writeCamera = useCallback(
    (camera: CameraState) => {
      'worklet';
      centerX.value = camera.centerX;
      centerY.value = camera.centerY;
      zoom.value = camera.zoom;
    },
    [centerX, centerY, zoom],
  );

  const animateCamera = useCallback(
    (camera: CameraState) => {
      'worklet';
      centerX.value = withTiming(camera.centerX, CAMERA_ANIMATION);
      centerY.value = withTiming(camera.centerY, CAMERA_ANIMATION);
      zoom.value = withTiming(camera.zoom, CAMERA_ANIMATION);
    },
    [centerX, centerY, zoom],
  );

  const stopCameraMotion = useCallback(() => {
    'worklet';
    cancelAnimation(centerX);
    cancelAnimation(centerY);
    cancelAnimation(zoom);
  }, [centerX, centerY, zoom]);

  const panUpdate = useCallback(
    (changeX: number, changeY: number) => {
      'worklet';
      if (isPinching.value) return;
      // The first delta after a pinch includes the jump from the two-finger centroid.
      if (skipNextPanDelta.value) {
        skipNextPanDelta.value = false;
        return;
      }
      writeCamera(panCamera(readCamera(), changeX, changeY, viewport.value, config));
    },
    [config, isPinching, readCamera, skipNextPanDelta, viewport, writeCamera],
  );

  const panEnd = useCallback(
    (velocityX: number, velocityY: number) => {
      'worklet';
      if (isPinching.value) return;
      const camera = readCamera();
      const scale = getCameraScale(camera, viewport.value, config);
      if (scale <= 0) return;
      const limits = getCenterLimits(camera.zoom, viewport.value, config);
      centerX.value = withDecay({
        velocity: -velocityX / scale,
        clamp: [limits.minX, limits.maxX],
      });
      centerY.value = withDecay({
        velocity: -velocityY / scale,
        clamp: [limits.minY, limits.maxY],
      });
    },
    [centerX, centerY, config, isPinching, readCamera, viewport],
  );

  const pinchStart = useCallback(
    (scale: number, focalX: number, focalY: number) => {
      'worklet';
      stopCameraMotion();
      isPinching.value = true;
      pinchStartCamera.value = readCamera();
      pinchStartFocal.value = { x: focalX, y: focalY };
      pinchStartScale.value = scale > 0 ? scale : 1;
    },
    [isPinching, pinchStartCamera, pinchStartFocal, pinchStartScale, readCamera, stopCameraMotion],
  );

  const pinchUpdate = useCallback(
    (scale: number, focalX: number, focalY: number) => {
      'worklet';
      if (!isPinching.value) return;
      const start = pinchStartCamera.value;
      const relativeScale = scale / pinchStartScale.value;
      writeCamera(
        zoomCameraAt(
          start,
          pinchStartFocal.value,
          start.zoom * relativeScale,
          { x: focalX, y: focalY },
          viewport.value,
          config,
        ),
      );
    },
    [config, isPinching, pinchStartCamera, pinchStartFocal, pinchStartScale, viewport, writeCamera],
  );

  const pinchEnd = useCallback(() => {
    'worklet';
    if (isPinching.value) skipNextPanDelta.value = true;
    isPinching.value = false;
  }, [isPinching, skipNextPanDelta]);

  const doubleTapZoom = useCallback(
    (x: number, y: number) => {
      'worklet';
      stopCameraMotion();
      const camera = readCamera();
      if (camera.zoom > config.minZoom * 1.05) {
        animateCamera(clampCamera(createInitialCamera(config), viewport.value, config));
        return;
      }
      const point = { x, y };
      animateCamera(
        zoomCameraAt(
          camera,
          point,
          camera.zoom * DOUBLE_TAP_ZOOM_FACTOR,
          point,
          viewport.value,
          config,
        ),
      );
    },
    [animateCamera, config, readCamera, stopCameraMotion, viewport],
  );

  const handlers = useMemo<CameraGestureHandlers>(
    () => ({
      stopMotion: stopCameraMotion,
      panUpdate,
      panEnd,
      pinchStart,
      pinchUpdate,
      pinchEnd,
      doubleTapZoom,
    }),
    [doubleTapZoom, panEnd, panUpdate, pinchEnd, pinchStart, pinchUpdate, stopCameraMotion],
  );

  // Read the shared values directly (not via readCamera) so Reanimated can see the dependencies.
  const transform = useDerivedValue(() =>
    getViewTransform(
      { centerX: centerX.value, centerY: centerY.value, zoom: zoom.value },
      viewport.value,
      config,
    ),
  );

  const setViewport = useCallback(
    (next: Viewport) => {
      viewport.value = next;
      writeCamera(clampCamera(readCamera(), next, config));
    },
    [config, readCamera, viewport, writeCamera],
  );

  const reset = useCallback(() => {
    writeCamera(clampCamera(createInitialCamera(config), viewport.value, config));
  }, [config, viewport, writeCamera]);

  return {
    config,
    centerX,
    centerY,
    zoom,
    viewport,
    isPinching,
    transform,
    handlers,
    setViewport,
    reset,
  };
}

/** Camera-only gestures: one-finger pan with momentum, pinch zoom, double-tap zoom/reset. */
export function useCameraGestures(camera: CameraController): ComposedGesture {
  const { handlers } = camera;
  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      handlers.stopMotion();
    },
    onUpdate: (event) => {
      'worklet';
      handlers.panUpdate(event.changeX, event.changeY);
    },
    onDeactivate: (event) => {
      'worklet';
      handlers.panEnd(event.velocityX, event.velocityY);
    },
  });
  const pinch = usePinchGesture({
    onActivate: (event) => {
      'worklet';
      handlers.pinchStart(event.scale, event.focalX, event.focalY);
    },
    onUpdate: (event) => {
      'worklet';
      handlers.pinchUpdate(event.scale, event.focalX, event.focalY);
    },
    onFinalize: () => {
      'worklet';
      handlers.pinchEnd();
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (event) => {
      'worklet';
      handlers.doubleTapZoom(event.x, event.y);
    },
  });
  return useSimultaneousGestures(pan, pinch, doubleTap);
}
