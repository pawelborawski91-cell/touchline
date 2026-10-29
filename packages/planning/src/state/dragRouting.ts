/**
 * Gesture arbitration policy, expressed as pure worklet-safe functions so the same rules run on
 * the UI thread and in unit tests.
 *
 * Priority: pinch = zoom > tap player = select > drag from selected player = draw > drag = pan.
 * A one-finger drag is classified once, when the finger lands, and keeps that role until it ends.
 */
export type DragIntent = 'draw' | 'pan' | 'none';

/** Extra screen-space slack around the selected marker where a drag starts a path. */
export const DRAW_START_SLACK_PX = 12;

export interface DragStartInput {
  /** A pinch is in progress: drags must not start a path. */
  isPinching: boolean;
  /** Planning state allows drawing (a player is selected and nothing is being drawn). */
  canDraw: boolean;
  /** Screen distance from the touch to the selected marker centre, or null if none. */
  distanceToSelectedPx: number | null;
  markerRadiusPx: number;
}

export function classifyDragStart(input: DragStartInput): DragIntent {
  'worklet';
  if (input.isPinching) return 'pan';
  if (
    input.canDraw &&
    input.distanceToSelectedPx !== null &&
    input.distanceToSelectedPx <= input.markerRadiusPx + DRAW_START_SLACK_PX
  ) {
    return 'draw';
  }
  return 'pan';
}

/**
 * Resolves a pinch that starts while a drag is in flight. A pinch before the stroke has drawn
 * anything wins (the pending stroke is dropped); once drawing is live the camera stays locked
 * so zoom can never corrupt the path.
 */
export function resolvePinchStart(
  intent: DragIntent,
  strokeStarted: boolean,
): {
  intent: DragIntent;
  allowZoom: boolean;
} {
  'worklet';
  if (intent === 'draw' && strokeStarted) return { intent, allowZoom: false };
  if (intent === 'draw') return { intent: 'none', allowZoom: true };
  return { intent, allowZoom: true };
}
