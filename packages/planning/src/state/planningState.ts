import {
  createMoveCommand,
  DEFAULT_MOVEMENT_MODE,
  type MovementMode,
  type PlayerCommand,
  type Vector2,
} from '@touchline/shared';
import { removeLastPoint, samplePath } from '../path/PathSampler';
import { describeRejection, validatePath } from '../path/PathValidator';

export type PlanningMode = 'idle' | 'player_selected' | 'drawing_path' | 'previewing_path';

/** Interaction state of the planning UI. Holds no simulation state and no command book. */
export interface PlanningUiState {
  selectedPlayerId: string | null;
  planningMode: PlanningMode;
  /** World-space path of the draft being previewed; the first point is the player's position. */
  currentDraftPath: Vector2[];
  isDrawing: boolean;
  /** Draft command shown in preview. Not part of the command book until confirmed. */
  activeCommandPreview: PlayerCommand | null;
  /** Queued command being edited; it stays queued until the edit is confirmed. */
  editingCommandId: string | null;
  /** Feedback for the last rejected path, cleared by the next interaction. */
  notice: string | null;
}

export const PREVIEW_COMMAND_ID = 'preview';

export const INITIAL_PLANNING_STATE: PlanningUiState = {
  selectedPlayerId: null,
  planningMode: 'idle',
  currentDraftPath: [],
  isDrawing: false,
  activeCommandPreview: null,
  editingCommandId: null,
  notice: null,
};

export type PlanningEvent =
  | { type: 'tapPlayer'; playerId: string }
  | { type: 'tapEmpty' }
  | { type: 'drawStart' }
  | { type: 'drawEnd'; start: Vector2; points: readonly Vector2[] }
  | { type: 'drawAbort' }
  | { type: 'undoPoint' }
  | { type: 'clearPath' }
  | { type: 'cancelDraft' }
  | { type: 'confirmed' }
  | { type: 'editCommand'; command: PlayerCommand }
  | { type: 'setMovementMode'; mode: MovementMode }
  | { type: 'deselect' };

function previewFor(playerId: string, path: Vector2[], movementMode: MovementMode): PlayerCommand {
  return createMoveCommand({ id: PREVIEW_COMMAND_ID, playerId, path, movementMode });
}

function selectState(playerId: string): PlanningUiState {
  return { ...INITIAL_PLANNING_STATE, selectedPlayerId: playerId, planningMode: 'player_selected' };
}

function withDraftPath(
  state: PlanningUiState,
  path: Vector2[],
  movementMode: MovementMode = state.activeCommandPreview?.movementMode ?? DEFAULT_MOVEMENT_MODE,
): PlanningUiState {
  if (!state.selectedPlayerId) return state;
  return {
    ...state,
    currentDraftPath: path,
    activeCommandPreview: previewFor(state.selectedPlayerId, path, movementMode),
    notice: null,
  };
}

/** True when a drag that starts on the selected player may begin drawing. */
export function canStartDrawing(state: PlanningUiState): boolean {
  return (
    state.selectedPlayerId !== null &&
    (state.planningMode === 'player_selected' || state.planningMode === 'previewing_path')
  );
}

/** True when the draft can be confirmed (it passes validation). */
export function canConfirmDraft(state: PlanningUiState): boolean {
  return (
    state.planningMode === 'previewing_path' && validatePath(state.currentDraftPath).ok === true
  );
}

/**
 * Pure transition function for planning interactions. Taps are ignored while drawing (never
 * select mid-stroke) and while previewing (the draft is resolved with Confirm or Cancel).
 */
export function reducePlanning(state: PlanningUiState, event: PlanningEvent): PlanningUiState {
  switch (event.type) {
    case 'tapPlayer':
      if (state.planningMode === 'drawing_path' || state.planningMode === 'previewing_path') {
        return state;
      }
      if (state.selectedPlayerId === event.playerId) return state;
      return selectState(event.playerId);

    case 'tapEmpty':
    case 'deselect':
      if (state.planningMode === 'drawing_path') return state;
      if (event.type === 'tapEmpty' && state.planningMode === 'previewing_path') return state;
      return INITIAL_PLANNING_STATE;

    case 'drawStart':
      if (!canStartDrawing(state)) return state;
      return { ...state, planningMode: 'drawing_path', isDrawing: true, notice: null };

    case 'drawEnd': {
      if (state.planningMode !== 'drawing_path' || !state.selectedPlayerId) return state;
      const sampled = samplePath(event.start, event.points);
      const result = validatePath(sampled);
      if (!result.ok) {
        const fallback: PlanningMode = state.activeCommandPreview
          ? 'previewing_path'
          : 'player_selected';
        return {
          ...state,
          planningMode: fallback,
          isDrawing: false,
          notice: describeRejection(result.reason),
        };
      }
      return {
        ...withDraftPath(state, result.path),
        planningMode: 'previewing_path',
        isDrawing: false,
      };
    }

    case 'drawAbort':
      if (state.planningMode !== 'drawing_path') return state;
      return {
        ...state,
        planningMode: state.activeCommandPreview ? 'previewing_path' : 'player_selected',
        isDrawing: false,
      };

    case 'undoPoint': {
      if (state.planningMode !== 'previewing_path' || !state.selectedPlayerId) return state;
      const path = removeLastPoint(state.currentDraftPath);
      if (path.length < 2) return selectState(state.selectedPlayerId);
      return withDraftPath(state, path);
    }

    case 'clearPath':
      if (state.planningMode !== 'previewing_path' || !state.selectedPlayerId) return state;
      return selectState(state.selectedPlayerId);

    case 'cancelDraft':
      if (state.planningMode === 'drawing_path') return state;
      return INITIAL_PLANNING_STATE;

    case 'confirmed':
      if (state.planningMode !== 'previewing_path' || !state.selectedPlayerId) return state;
      return selectState(state.selectedPlayerId);

    case 'setMovementMode':
      if (state.planningMode !== 'previewing_path') return state;
      return withDraftPath(state, state.currentDraftPath, event.mode);

    case 'editCommand': {
      const { command } = event;
      if (state.planningMode !== 'player_selected' || command.playerId !== state.selectedPlayerId) {
        return state;
      }
      return {
        ...withDraftPath(
          state,
          command.path.map((point) => ({ ...point })),
        ),
        planningMode: 'previewing_path',
        editingCommandId: command.id,
      };
    }
  }
}
