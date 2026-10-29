import { resolvePinchStart } from '@touchline/planning';
import type { CameraController } from '@touchline/renderer';
import type { MatchSnapshot, Vector2 } from '@touchline/shared';
import {
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';

import { usePathDrawing } from './usePathDrawing';
import { usePlayerSelection } from './usePlayerSelection';

/**
 * Single gesture tree for the match view. All recognisers run simultaneously and arbitrate
 * through shared state instead of gesture-handler relations:
 *
 * 1. Pinch zooms, unless a stroke is already being drawn (then the camera stays locked).
 * 2. Single tap selects the closest marker or deselects (JS thread, never during a stroke).
 * 3. A one-finger drag that lands on the selected player draws a path.
 * 4. Any other one-finger drag pans the camera.
 *
 * Double tap keeps its Sprint 1 role (zoom in / reset). Outside planning only the camera
 * gestures act: there is no draw anchor and taps do not select.
 */
export function usePlanningGestures(
  snapshot: MatchSnapshot,
  camera: CameraController,
  drawAnchor: Vector2 | null,
  selectionEnabled: boolean,
) {
  const { handlers } = camera;
  const drawing = usePathDrawing(camera, drawAnchor);
  const { dragIntent, strokeStarted } = drawing;
  const handleTap = usePlayerSelection(snapshot, camera, selectionEnabled);

  const pan = usePanGesture({
    onBegin: (event) => {
      'worklet';
      handlers.stopMotion();
      drawing.beginDrag(event.x, event.y);
    },
    onActivate: (event) => {
      'worklet';
      if (dragIntent.value === 'draw') drawing.startStroke(event.x, event.y);
    },
    onUpdate: (event) => {
      'worklet';
      if (dragIntent.value === 'draw') drawing.extendStroke(event.x, event.y);
      else if (dragIntent.value === 'pan') handlers.panUpdate(event.changeX, event.changeY);
    },
    onDeactivate: (event) => {
      'worklet';
      if (dragIntent.value === 'draw') drawing.endStroke(event.x, event.y);
      else if (dragIntent.value === 'pan') handlers.panEnd(event.velocityX, event.velocityY);
    },
    onFinalize: () => {
      'worklet';
      drawing.finalizeDrag();
    },
  });

  const pinch = usePinchGesture({
    onActivate: (event) => {
      'worklet';
      const resolved = resolvePinchStart(dragIntent.value, strokeStarted.value);
      dragIntent.value = resolved.intent;
      if (resolved.allowZoom) handlers.pinchStart(event.scale, event.focalX, event.focalY);
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

  const tap = useTapGesture({
    runOnJS: true,
    onActivate: (event) => {
      handleTap(event.x, event.y);
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (event) => {
      'worklet';
      if (!strokeStarted.value) handlers.doubleTapZoom(event.x, event.y);
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, tap, doubleTap);
  return { gesture, livePoints: drawing.livePoints };
}
