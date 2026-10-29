import {
  activateCommand,
  activateLiveCommands,
  cancelCommand,
  commandReducer,
  completeCommand,
  confirmDraft,
  createCommandBook,
  createDraft,
  getActiveMovementCommand,
  getCommand,
  getMovementCommand,
  getPlayerCommands,
  pauseActiveCommands,
  pauseCommand,
  pruneFinishedCommands,
  replaceMovementCommand,
  resumeCommand,
  type Vector2,
} from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const PATH_A: Vector2[] = [
  { x: 10, y: 10 },
  { x: 20, y: 12 },
];
const PATH_B: Vector2[] = [
  { x: 10, y: 10 },
  { x: 14, y: 30 },
];

const statusOf = (book: ReturnType<typeof createCommandBook>, id: string) =>
  getCommand(book, id)?.status;

describe('command lifecycle', () => {
  it('stores the movement mode, defaulting to run', () => {
    expect(replaceMovementCommand(createCommandBook(), 'p1', PATH_A).command.movementMode).toBe(
      'run',
    );
    const sprint = replaceMovementCommand(createCommandBook(), 'p1', PATH_A, {
      movementMode: 'sprint',
    });
    expect(sprint.command.movementMode).toBe('sprint');
    const book = commandReducer(createCommandBook(), {
      type: 'createDraft',
      playerId: 'p1',
      path: PATH_A,
      movementMode: 'walk',
    });
    expect(book.commands[0]!.movementMode).toBe('walk');
  });

  it('goes queued → active → completed', () => {
    const { book, command } = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    expect(command.status).toBe('queued');
    const active = activateCommand(book, command.id);
    expect(statusOf(active, command.id)).toBe('active');
    expect(getActiveMovementCommand(active, 'p1')?.id).toBe(command.id);
    const done = completeCommand(active, command.id);
    expect(statusOf(done, command.id)).toBe('completed');
    expect(getMovementCommand(done, 'p1')).toBeUndefined();
  });

  it('goes active → paused → active', () => {
    const { book, command } = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const paused = pauseCommand(activateCommand(book, command.id), command.id);
    expect(statusOf(paused, command.id)).toBe('paused');
    expect(getMovementCommand(paused, 'p1')?.id).toBe(command.id);
    expect(statusOf(resumeCommand(paused, command.id), command.id)).toBe('active');
  });

  it('goes active → cancelled and refuses to cancel finished commands', () => {
    const { book, command } = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const cancelled = cancelCommand(activateCommand(book, command.id), command.id);
    expect(statusOf(cancelled, command.id)).toBe('cancelled');
    const completed = completeCommand(activateCommand(book, command.id), command.id);
    expect(cancelCommand(completed, command.id)).toBe(completed);
  });

  it('rejects invalid transitions without changing the book', () => {
    const draft = createDraft(createCommandBook(), 'p1', PATH_A);
    expect(activateCommand(draft.book, draft.command.id)).toBe(draft.book);
    expect(completeCommand(draft.book, draft.command.id)).toBe(draft.book);
    expect(pauseCommand(draft.book, draft.command.id)).toBe(draft.book);
    const queued = confirmDraft(draft.book, draft.command.id);
    expect(completeCommand(queued, draft.command.id)).toBe(queued);
    expect(resumeCommand(queued, draft.command.id)).toBe(queued);
  });

  it('never lets a player have two active commands', () => {
    const first = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const active = activateCommand(first.book, first.command.id);
    // Force a second live command for the same player, bypassing replacement.
    const second = createDraft(active, 'p1', PATH_B);
    const forced = {
      ...second.book,
      commands: second.book.commands.map((c) =>
        c.id === second.command.id ? { ...c, status: 'queued' as const } : c,
      ),
    };
    const attempted = activateCommand(forced, second.command.id);
    expect(attempted).toBe(forced);
    expect(attempted.commands.filter((c) => c.status === 'active')).toHaveLength(1);
  });

  it('replaces a queued or paused command when a new one is confirmed', () => {
    const queued = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const paused = pauseActiveCommands(activateLiveCommands(queued.book));
    expect(statusOf(paused, queued.command.id)).toBe('paused');
    const replaced = replaceMovementCommand(paused, 'p1', PATH_B, { movementMode: 'jog' });
    expect(getPlayerCommands(replaced.book, 'p1')).toHaveLength(1);
    expect(getMovementCommand(replaced.book, 'p1')).toMatchObject({
      id: replaced.command.id,
      status: 'queued',
      movementMode: 'jog',
    });
  });

  it('activates and pauses in bulk and prunes finished commands', () => {
    let book = replaceMovementCommand(createCommandBook(), 'p1', PATH_A).book;
    book = replaceMovementCommand(book, 'p2', PATH_B).book;
    book = activateLiveCommands(book);
    expect(book.commands.every((c) => c.status === 'active')).toBe(true);
    book = completeCommand(book, book.commands[0]!.id);
    book = pauseActiveCommands(book);
    expect(book.commands.map((c) => c.status)).toEqual(['completed', 'paused']);
    const pruned = pruneFinishedCommands(book);
    expect(pruned.commands.map((c) => c.status)).toEqual(['paused']);
    expect(pruneFinishedCommands(pruned)).toBe(pruned);
  });
});
