import { appendSample, classifyDragStart, type DragIntent } from '@touchline/planning';
import {
  PLAYER_MARKER_RADIUS,
  screenDistanceTo,
  screenToWorld,
  type CameraController,
} from '@touchline/renderer';
import type { Vector2 } from '@touchline/shared';
import { useCallback, useEffect } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { usePlanningStore } from '../stores/planningStore';

export interface PathDrawing {
  /** World-space points of the stroke in progress; read by the live Skia path. */
  livePoints: SharedValue<Vector2[]>;
  /** Role of the current one-finger drag, decided when the finger lands. */
  dragIntent: SharedValue<DragIntent>;
  /** True once the drag has activated as a drawing stroke. */
  strokeStarted: SharedValue<boolean>;
  beginDrag: (x: number, y: number) => DragIntent;
  startStroke: (x: number, y: number) => void;
  extendStroke: (x: number, y: number) => void;
  endStroke: (x: number, y: number) => void;
  finalizeDrag: () => void;
}

/**
 * Captures movement strokes on the UI thread. Each touch is converted screen→world with the
 * camera transform at that moment and appended through the spacing sampler, so React never
 * re-renders per touch event. The camera is locked while a stroke is live, so the transform
 * is stable for the whole stroke.
 *
 * `anchor` is the selected player's world position when drawing is allowed, otherwise null.
 */
export function usePathDrawing(camera: CameraController, anchor: Vector2 | null): PathDrawing {
  const dispatch = usePlanningStore((state) => state.dispatch);
  const planningMode = usePlanningStore((state) => state.planningMode);

  const livePoints = useSharedValue<Vector2[]>([]);
  const drawAnchor = useSharedValue<Vector2 | null>(anchor);
  const strokeAnchor = useSharedValue<Vector2>({ x: 0, y: 0 });
  const dragIntent = useSharedValue<DragIntent>('none');
  const strokeStarted = useSharedValue(false);

  useEffect(() => {
    drawAnchor.value = anchor;
  }, [anchor, drawAnchor]);

  // Keep the live stroke on screen until the preview has rendered, then drop it.
  useEffect(() => {
    if (planningMode !== 'drawing_path') livePoints.value = [];
  }, [livePoints, planningMode]);

  const onStrokeStart = useCallback(() => dispatch({ type: 'drawStart' }), [dispatch]);
  const onStrokeEnd = useCallback(
    (points: Vector2[]) => {
      const [start, ...rest] = points;
      if (!start) return;
      dispatch({ type: 'drawEnd', start, points: rest });
    },
    [dispatch],
  );
  const onStrokeAbort = useCallback(() => dispatch({ type: 'drawAbort' }), [dispatch]);

  const beginDrag = useCallback(
    (x: number, y: number): DragIntent => {
      'worklet';
      const target = drawAnchor.value;
      const intent = classifyDragStart({
        isPinching: camera.isPinching.value,
        canDraw: target !== null,
        distanceToSelectedPx: target
          ? screenDistanceTo({ x, y }, target, camera.transform.value)
          : null,
        markerRadiusPx: PLAYER_MARKER_RADIUS,
      });
      if (target && intent === 'draw') strokeAnchor.value = target;
      dragIntent.value = intent;
      strokeStarted.value = false;
      return intent;
    },
    [camera.isPinching, camera.transform, dragIntent, drawAnchor, strokeAnchor, strokeStarted],
  );

  const extendStroke = useCallback(
    (x: number, y: number) => {
      'worklet';
      if (!strokeStarted.value) return;
      const points = livePoints.value.slice();
      if (appendSample(points, screenToWorld({ x, y }, camera.transform.value))) {
        livePoints.value = points;
      }
    },
    [camera.transform, livePoints, strokeStarted],
  );

  const startStroke = useCallback(
    (x: number, y: number) => {
      'worklet';
      if (dragIntent.value !== 'draw') return;
      camera.handlers.stopMotion();
      strokeStarted.value = true;
      livePoints.value = [strokeAnchor.value];
      extendStroke(x, y);
      scheduleOnRN(onStrokeStart);
    },
    [
      camera.handlers,
      dragIntent,
      extendStroke,
      livePoints,
      onStrokeStart,
      strokeAnchor,
      strokeStarted,
    ],
  );

  const endStroke = useCallback(
    (x: number, y: number) => {
      'worklet';
      if (!strokeStarted.value) return;
      strokeStarted.value = false;
      const release = screenToWorld({ x, y }, camera.transform.value);
      scheduleOnRN(onStrokeEnd, [...livePoints.value, release]);
    },
    [camera.transform, livePoints, onStrokeEnd, strokeStarted],
  );

  const finalizeDrag = useCallback(() => {
    'worklet';
    if (strokeStarted.value) {
      strokeStarted.value = false;
      livePoints.value = [];
      scheduleOnRN(onStrokeAbort);
    }
    dragIntent.value = 'none';
  }, [dragIntent, livePoints, onStrokeAbort, strokeStarted]);

  return {
    livePoints,
    dragIntent,
    strokeStarted,
    beginDrag,
    startStroke,
    extendStroke,
    endStroke,
    finalizeDrag,
  };
}
