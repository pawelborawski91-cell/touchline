import {
  canConfirmDraft,
  canStartDrawing,
  classifyDragStart,
  commandReducer,
  createCommandBook,
  DRAW_START_SLACK_PX,
  getMovementCommand,
  INITIAL_PLANNING_STATE,
  reducePlanning,
  resolvePinchStart,
  type PlanningEvent,
  type PlanningUiState,
} from '@touchline/planning';
import type { Vector2 } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const START: Vector2 = { x: 30, y: 34 };
const STROKE: Vector2[] = [
  { x: 34, y: 34 },
  { x: 38, y: 36 },
  { x: 42, y: 40 },
];

function run(events: PlanningEvent[], state: PlanningUiState = INITIAL_PLANNING_STATE) {
  return events.reduce(reducePlanning, state);
}

const drawn = (playerId = 'home-9') =>
  run([
    { type: 'tapPlayer', playerId },
    { type: 'drawStart' },
    { type: 'drawEnd', start: START, points: STROKE },
  ]);

describe('planning modes', () => {
  it('starts idle', () => {
    expect(INITIAL_PLANNING_STATE.planningMode).toBe('idle');
    expect(canStartDrawing(INITIAL_PLANNING_STATE)).toBe(false);
  });

  it('selects, switches and deselects players', () => {
    const selected = run([{ type: 'tapPlayer', playerId: 'home-9' }]);
    expect(selected).toMatchObject({ planningMode: 'player_selected', selectedPlayerId: 'home-9' });
    const switched = reducePlanning(selected, { type: 'tapPlayer', playerId: 'away-4' });
    expect(switched.selectedPlayerId).toBe('away-4');
    expect(reducePlanning(switched, { type: 'tapEmpty' })).toEqual(INITIAL_PLANNING_STATE);
  });

  it('enters drawing and then previewing with the sampled path', () => {
    const drawing = run([{ type: 'tapPlayer', playerId: 'home-9' }, { type: 'drawStart' }]);
    expect(drawing).toMatchObject({ planningMode: 'drawing_path', isDrawing: true });
    const preview = drawn();
    expect(preview.planningMode).toBe('previewing_path');
    expect(preview.isDrawing).toBe(false);
    expect(preview.currentDraftPath[0]).toEqual(START);
    expect(preview.activeCommandPreview).toMatchObject({
      playerId: 'home-9',
      status: 'draft',
      type: 'move',
    });
    expect(canConfirmDraft(preview)).toBe(true);
  });

  it('never selects while drawing', () => {
    const drawing = run([{ type: 'tapPlayer', playerId: 'home-9' }, { type: 'drawStart' }]);
    expect(reducePlanning(drawing, { type: 'tapPlayer', playerId: 'away-1' })).toBe(drawing);
    expect(reducePlanning(drawing, { type: 'tapEmpty' })).toBe(drawing);
  });

  it('cannot draw without a selection', () => {
    expect(reducePlanning(INITIAL_PLANNING_STATE, { type: 'drawStart' })).toBe(
      INITIAL_PLANNING_STATE,
    );
  });

  it('keeps the preview when tapping the pitch, so a stray tap cannot discard it', () => {
    const preview = drawn();
    expect(reducePlanning(preview, { type: 'tapEmpty' })).toBe(preview);
    expect(reducePlanning(preview, { type: 'tapPlayer', playerId: 'away-1' })).toBe(preview);
  });

  it('rejects too-short strokes with feedback and no preview', () => {
    const state = run([
      { type: 'tapPlayer', playerId: 'home-9' },
      { type: 'drawStart' },
      { type: 'drawEnd', start: START, points: [{ x: 30.6, y: 34.2 }] },
    ]);
    expect(state.planningMode).toBe('player_selected');
    expect(state.activeCommandPreview).toBeNull();
    expect(state.notice).toMatch(/drag further|too short/i);
  });

  it('keeps the previous preview when a redraw is rejected', () => {
    const preview = drawn();
    const redraw = run(
      [{ type: 'drawStart' }, { type: 'drawEnd', start: START, points: [] }],
      preview,
    );
    expect(redraw.planningMode).toBe('previewing_path');
    expect(redraw.activeCommandPreview?.path).toEqual(preview.activeCommandPreview?.path);
  });

  it('undoes points, clears and cancels drafts', () => {
    const preview = drawn();
    const pointCount = preview.currentDraftPath.length;
    const undone = reducePlanning(preview, { type: 'undoPoint' });
    expect(undone.currentDraftPath).toHaveLength(pointCount - 1);
    expect(undone.activeCommandPreview?.path).toEqual(undone.currentDraftPath);

    const cleared = reducePlanning(preview, { type: 'clearPath' });
    expect(cleared).toMatchObject({
      planningMode: 'player_selected',
      selectedPlayerId: 'home-9',
      currentDraftPath: [],
      activeCommandPreview: null,
    });

    expect(reducePlanning(preview, { type: 'cancelDraft' })).toEqual(INITIAL_PLANNING_STATE);
  });

  it('falls back to player_selected when undo leaves fewer than two points', () => {
    let state = drawn();
    while (state.planningMode === 'previewing_path')
      state = reducePlanning(state, { type: 'undoPoint' });
    expect(state).toMatchObject({ planningMode: 'player_selected', activeCommandPreview: null });
  });

  it('aborted strokes return to the previous mode', () => {
    const drawing = run([{ type: 'tapPlayer', playerId: 'home-9' }, { type: 'drawStart' }]);
    expect(reducePlanning(drawing, { type: 'drawAbort' }).planningMode).toBe('player_selected');
  });
});

describe('select → draw → confirm → edit flow', () => {
  it('stores confirmed paths in the command book and edits replace them', () => {
    let ui = drawn();
    let book = createCommandBook();

    book = commandReducer(book, {
      type: 'replaceMovement',
      playerId: ui.selectedPlayerId!,
      path: ui.activeCommandPreview!.path,
    });
    ui = reducePlanning(ui, { type: 'confirmed' });
    expect(ui).toMatchObject({ planningMode: 'player_selected', activeCommandPreview: null });
    const queued = getMovementCommand(book, 'home-9')!;
    expect(queued.status).toBe('queued');
    expect(queued.path[0]).toEqual(START);

    // Second player.
    ui = reducePlanning(ui, { type: 'tapEmpty' });
    ui = run(
      [
        { type: 'tapPlayer', playerId: 'away-7' },
        { type: 'drawStart' },
        { type: 'drawEnd', start: { x: 70, y: 20 }, points: [{ x: 60, y: 22 }] },
      ],
      ui,
    );
    book = commandReducer(book, {
      type: 'replaceMovement',
      playerId: 'away-7',
      path: ui.activeCommandPreview!.path,
    });
    ui = reducePlanning(ui, { type: 'confirmed' });

    // Edit the first player's command: the queued one survives until the edit is confirmed.
    ui = run([{ type: 'tapEmpty' }, { type: 'tapPlayer', playerId: 'home-9' }], ui);
    ui = reducePlanning(ui, { type: 'editCommand', command: queued });
    expect(ui).toMatchObject({ planningMode: 'previewing_path', editingCommandId: queued.id });
    expect(ui.currentDraftPath).toEqual(queued.path);
    ui = reducePlanning(ui, { type: 'undoPoint' });
    expect(getMovementCommand(book, 'home-9')?.id).toBe(queued.id);

    book = commandReducer(book, {
      type: 'replaceMovement',
      playerId: 'home-9',
      path: ui.activeCommandPreview!.path,
    });
    const edited = getMovementCommand(book, 'home-9')!;
    expect(edited.id).not.toBe(queued.id);
    expect(edited.path).toHaveLength(queued.path.length - 1);
    expect(getMovementCommand(book, 'away-7')).toBeDefined();
    expect(book.commands.filter((c) => c.status === 'queued')).toHaveLength(2);
  });

  it('ignores edits of another player’s command', () => {
    const ui = run([{ type: 'tapPlayer', playerId: 'home-9' }]);
    const command = {
      id: 'cmd-1',
      playerId: 'away-7',
      type: 'move' as const,
      status: 'queued' as const,
      path: STROKE,
      movementMode: 'run' as const,
      createdAtTick: 0,
      priority: 50,
      interruptible: true,
      startedTurn: null,
      endedTurn: null,
    };
    expect(reducePlanning(ui, { type: 'editCommand', command })).toBe(ui);
  });
});

describe('gesture arbitration', () => {
  const base = { isPinching: false, canDraw: true, distanceToSelectedPx: 4, markerRadiusPx: 13 };

  it('draws when a drag starts on the selected player', () => {
    expect(classifyDragStart(base)).toBe('draw');
    expect(classifyDragStart({ ...base, distanceToSelectedPx: 13 + DRAW_START_SLACK_PX })).toBe(
      'draw',
    );
  });

  it('pans when the drag starts away from the selected player', () => {
    expect(classifyDragStart({ ...base, distanceToSelectedPx: 13 + DRAW_START_SLACK_PX + 1 })).toBe(
      'pan',
    );
    expect(classifyDragStart({ ...base, distanceToSelectedPx: null })).toBe('pan');
  });

  it('pans when drawing is not allowed (nothing selected, or mid-draw)', () => {
    expect(classifyDragStart({ ...base, canDraw: false })).toBe('pan');
  });

  it('never starts a path while pinching', () => {
    expect(classifyDragStart({ ...base, isPinching: true })).toBe('pan');
  });

  it('a pinch before the stroke starts wins and drops the pending stroke', () => {
    expect(resolvePinchStart('draw', false)).toEqual({ intent: 'none', allowZoom: true });
  });

  it('a pinch during a live stroke is ignored so the camera stays locked', () => {
    expect(resolvePinchStart('draw', true)).toEqual({ intent: 'draw', allowZoom: false });
  });

  it('a pinch during a pan zooms', () => {
    expect(resolvePinchStart('pan', false)).toEqual({ intent: 'pan', allowZoom: true });
  });
});

describe('movement mode', () => {
  it('defaults the preview to run and changes it only while previewing', () => {
    const previewing = drawn();
    expect(previewing.activeCommandPreview?.movementMode).toBe('run');
    const sprint = reducePlanning(previewing, { type: 'setMovementMode', mode: 'sprint' });
    expect(sprint.activeCommandPreview?.movementMode).toBe('sprint');
    expect(sprint.currentDraftPath).toEqual(previewing.currentDraftPath);
    const selected = run([{ type: 'tapPlayer', playerId: 'home-9' }]);
    expect(reducePlanning(selected, { type: 'setMovementMode', mode: 'walk' })).toBe(selected);
  });

  it('keeps the chosen mode when the path is redrawn', () => {
    const sprint = reducePlanning(drawn(), { type: 'setMovementMode', mode: 'sprint' });
    const redrawn = run(
      [{ type: 'drawStart' }, { type: 'drawEnd', start: START, points: STROKE }],
      sprint,
    );
    expect(redrawn.activeCommandPreview?.movementMode).toBe('sprint');
  });

  it('loads the command’s mode when editing a queued command', () => {
    const book = commandReducer(createCommandBook(), {
      type: 'replaceMovement',
      playerId: 'home-9',
      path: [START, ...STROKE],
      movementMode: 'jog',
    });
    const command = getMovementCommand(book, 'home-9')!;
    const editing = run([
      { type: 'tapPlayer', playerId: 'home-9' },
      { type: 'editCommand', command },
    ]);
    expect(editing.activeCommandPreview?.movementMode).toBe('jog');
  });
});
