import {
  cancelCommand,
  commandReducer,
  confirmDraft,
  createCommandBook,
  createDraft,
  createMoveCommand,
  DEFAULT_COMMAND_PRIORITY,
  getCommand,
  getLiveMovementCommands,
  getMovementCommand,
  getPlayerCommands,
  removeCommand,
  replaceMovementCommand,
} from '@touchline/planning';
import type { Vector2 } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const PATH_A: Vector2[] = [
  { x: 10, y: 10 },
  { x: 20, y: 12 },
];
const PATH_B: Vector2[] = [
  { x: 10, y: 10 },
  { x: 14, y: 30 },
];

describe('createMoveCommand', () => {
  it('applies the documented defaults and starts as a draft', () => {
    const command = createMoveCommand({ id: 'c1', playerId: 'p1', path: PATH_A });
    expect(command).toEqual({
      id: 'c1',
      playerId: 'p1',
      type: 'move',
      status: 'draft',
      path: PATH_A,
      createdAtTick: 0,
      priority: DEFAULT_COMMAND_PRIORITY,
      interruptible: true,
      movementMode: 'run',
    });
    expect(DEFAULT_COMMAND_PRIORITY).toBe(50);
  });

  it('copies the path so the command never aliases caller data', () => {
    const path = PATH_A.map((p) => ({ ...p }));
    const command = createMoveCommand({ id: 'c1', playerId: 'p1', path });
    path[1]!.x = 99;
    expect(command.path[1]!.x).toBe(20);
  });
});

describe('CommandManager', () => {
  it('creates drafts with unique ids', () => {
    const first = createDraft(createCommandBook(), 'p1', PATH_A);
    const second = createDraft(first.book, 'p2', PATH_B);
    expect(first.command.id).not.toBe(second.command.id);
    expect(second.book.commands).toHaveLength(2);
    expect(second.book.commands.every((c) => c.status === 'draft')).toBe(true);
  });

  it('keeps one draft per player', () => {
    const first = createDraft(createCommandBook(), 'p1', PATH_A);
    const second = createDraft(first.book, 'p1', PATH_B);
    expect(getPlayerCommands(second.book, 'p1')).toEqual([second.command]);
  });

  it('confirms a draft into a queued command', () => {
    const { book, command } = createDraft(createCommandBook(), 'p1', PATH_A);
    const confirmed = confirmDraft(book, command.id);
    expect(getCommand(confirmed, command.id)?.status).toBe('queued');
    expect(getMovementCommand(confirmed, 'p1')?.id).toBe(command.id);
  });

  it('ignores confirming unknown or non-draft commands', () => {
    const { book, command } = createDraft(createCommandBook(), 'p1', PATH_A);
    const confirmed = confirmDraft(book, command.id);
    expect(confirmDraft(confirmed, command.id)).toBe(confirmed);
    expect(confirmDraft(confirmed, 'missing')).toBe(confirmed);
  });

  it('replaces the existing queued movement command on confirm', () => {
    const first = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const second = replaceMovementCommand(first.book, 'p1', PATH_B);
    const commands = getPlayerCommands(second.book, 'p1');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ id: second.command.id, status: 'queued', path: PATH_B });
    expect(getCommand(second.book, first.command.id)).toBeUndefined();
  });

  it('only replaces the confirming player’s command', () => {
    let book = replaceMovementCommand(createCommandBook(), 'p1', PATH_A).book;
    book = replaceMovementCommand(book, 'p2', PATH_A).book;
    book = replaceMovementCommand(book, 'p1', PATH_B).book;
    expect(
      getLiveMovementCommands(book)
        .map((c) => c.playerId)
        .sort(),
    ).toEqual(['p1', 'p2']);
    expect(getMovementCommand(book, 'p2')?.path).toEqual(PATH_A);
  });

  it('keeps the queued command while an edit draft exists, then swaps on confirm', () => {
    const queued = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const draft = createDraft(queued.book, 'p1', PATH_B);
    expect(getMovementCommand(draft.book, 'p1')?.id).toBe(queued.command.id);
    const confirmed = confirmDraft(draft.book, draft.command.id);
    expect(getMovementCommand(confirmed, 'p1')?.id).toBe(draft.command.id);
    expect(getPlayerCommands(confirmed, 'p1')).toHaveLength(1);
  });

  it('cancels a command, freeing the player’s movement slot', () => {
    const { book, command } = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const cancelled = cancelCommand(book, command.id);
    expect(getCommand(cancelled, command.id)?.status).toBe('cancelled');
    expect(getMovementCommand(cancelled, 'p1')).toBeUndefined();
    expect(getLiveMovementCommands(cancelled)).toEqual([]);
    expect(cancelCommand(cancelled, command.id)).toBe(cancelled);
  });

  it('removes commands', () => {
    const { book, command } = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const removed = removeCommand(book, command.id);
    expect(removed.commands).toEqual([]);
    expect(removeCommand(removed, command.id)).toBe(removed);
  });

  it('never mutates the previous book', () => {
    const empty = createCommandBook();
    const snapshot = JSON.stringify(empty);
    const { book, command } = createDraft(empty, 'p1', PATH_A);
    const before = JSON.stringify(book);
    confirmDraft(book, command.id);
    cancelCommand(book, command.id);
    removeCommand(book, command.id);
    expect(JSON.stringify(empty)).toBe(snapshot);
    expect(JSON.stringify(book)).toBe(before);
  });

  it('exposes the same operations as a reducer', () => {
    let book = commandReducer(createCommandBook(), {
      type: 'createDraft',
      playerId: 'p1',
      path: PATH_A,
    });
    const draftId = book.commands[0]!.id;
    book = commandReducer(book, { type: 'confirmDraft', commandId: draftId });
    expect(getMovementCommand(book, 'p1')?.status).toBe('queued');
    book = commandReducer(book, { type: 'replaceMovement', playerId: 'p1', path: PATH_B });
    const replacement = getMovementCommand(book, 'p1')!;
    expect(replacement.path).toEqual(PATH_B);
    book = commandReducer(book, { type: 'cancel', commandId: replacement.id });
    expect(getMovementCommand(book, 'p1')).toBeUndefined();
    book = commandReducer(book, { type: 'remove', commandId: replacement.id });
    expect(book.commands).toEqual([]);
  });
});
