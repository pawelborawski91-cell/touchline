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

export interface CameraController {
  centerX: SharedValue<number>;
  centerY: SharedValue<number>;
  zoom: SharedValue<number>;
  viewport: SharedValue<Viewport>;
  /** World→screen transform for the current camera, recomputed on the UI thread. */
  transform: DerivedValue<ViewTransform>;
  gesture: ComposedGesture;
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

  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      stopCameraMotion();
    },
    onUpdate: (event) => {
      'worklet';
      if (isPinching.value) return;
      // The first delta after a pinch includes the jump from the two-finger centroid.
      if (skipNextPanDelta.value) {
        skipNextPanDelta.value = false;
        return;
      }
      writeCamera(panCamera(readCamera(), event.changeX, event.changeY, viewport.value, config));
    },
    onDeactivate: (event) => {
      'worklet';
      if (isPinching.value) return;
      const camera = readCamera();
      const scale = getCameraScale(camera, viewport.value, config);
      if (scale <= 0) return;
      const limits = getCenterLimits(camera.zoom, viewport.value, config);
      centerX.value = withDecay({
        velocity: -event.velocityX / scale,
        clamp: [limits.minX, limits.maxX],
      });
      centerY.value = withDecay({
        velocity: -event.velocityY / scale,
        clamp: [limits.minY, limits.maxY],
      });
    },
  });

  const pinch = usePinchGesture({
    onActivate: (event) => {
      'worklet';
      stopCameraMotion();
      isPinching.value = true;
      pinchStartCamera.value = readCamera();
      pinchStartFocal.value = { x: event.focalX, y: event.focalY };
      pinchStartScale.value = event.scale > 0 ? event.scale : 1;
    },
    onUpdate: (event) => {
      'worklet';
      if (!isPinching.value) return;
      const start = pinchStartCamera.value;
      const relativeScale = event.scale / pinchStartScale.value;
      writeCamera(
        zoomCameraAt(
          start,
          pinchStartFocal.value,
          start.zoom * relativeScale,
          { x: event.focalX, y: event.focalY },
          viewport.value,
          config,
        ),
      );
    },
    onFinalize: () => {
      'worklet';
      if (isPinching.value) skipNextPanDelta.value = true;
      isPinching.value = false;
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (event) => {
      'worklet';
      stopCameraMotion();
      const camera = readCamera();
      if (camera.zoom > config.minZoom * 1.05) {
        animateCamera(clampCamera(createInitialCamera(config), viewport.value, config));
        return;
      }
      const point = { x: event.x, y: event.y };
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
  });

  const gesture = useSimultaneousGestures(pan, pinch, doubleTap);

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

  return { centerX, centerY, zoom, viewport, transform, gesture, setViewport, reset };
}
