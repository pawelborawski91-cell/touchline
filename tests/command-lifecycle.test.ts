import {
  activateCommand,
  activateLiveCommands,
  canTransitionCommand,
  cancelCommand,
  COMMAND_TRANSITIONS,
  commandReducer,
  CommandTransitionError,
  completeCommand,
  confirmDraft,
  createCommandBook,
  createDraft,
  getActiveMovementCommand,
  getCommand,
  getLiveMovementCommands,
  getMovementCommand,
  interruptCommand,
  pauseActiveCommands,
  pauseCommand,
  pruneFinishedCommands,
  replaceMovementCommand,
  resumeCommand,
  transitionCommand,
  type CommandBook,
  type CommandStatus,
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

const statusOf = (book: CommandBook, id: string) => getCommand(book, id)?.status;

const ALL: CommandStatus[] = [
  'draft',
  'queued',
  'active',
  'paused',
  'completed',
  'cancelled',
  'interrupted',
];

describe('command transition table', () => {
  it('allows exactly the documented transitions', () => {
    const allowed = ALL.flatMap((from) =>
      ALL.filter((to) => canTransitionCommand(from, to)).map((to) => `${from}->${to}`),
    );
    expect(allowed.sort()).toEqual(
      [
        'draft->queued',
        'draft->cancelled',
        'queued->active',
        'queued->cancelled',
        'active->completed',
        'active->cancelled',
        'active->paused',
        'active->interrupted',
        'paused->active',
        'paused->cancelled',
        'paused->interrupted',
      ].sort(),
    );
  });

  it('makes completed, cancelled and interrupted terminal', () => {
    for (const status of ['completed', 'cancelled', 'interrupted'] as const) {
      expect(COMMAND_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('throws a meaningful error for illegal transitions and unknown ids', () => {
    const { book, command } = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const done = completeCommand(activateCommand(book, command.id), command.id);
    expect(() => transitionCommand(done, command.id, 'active')).toThrow(CommandTransitionError);
    expect(() => transitionCommand(done, command.id, 'active')).toThrow(
      /cannot go from completed to active/,
    );
    expect(() => transitionCommand(done, 'nope', 'active')).toThrow(/does not exist/);
    const cancelled = cancelCommand(book, command.id);
    expect(() => transitionCommand(cancelled, command.id, 'active')).toThrow(/cancelled to active/);
  });

  it('stamps the start and end turn', () => {
    const { book, command } = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const active = transitionCommand(book, command.id, 'active', { turn: 2 });
    const paused = transitionCommand(active, command.id, 'paused', { turn: 3 });
    const resumed = transitionCommand(paused, command.id, 'active', { turn: 4 });
    const done = transitionCommand(resumed, command.id, 'completed', { turn: 5 });
    expect(getCommand(done, command.id)).toMatchObject({ startedTurn: 2, endedTurn: 5 });
  });
});

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

  it('goes active → paused → active, and paused → cancelled', () => {
    const { book, command } = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const paused = pauseCommand(activateCommand(book, command.id), command.id);
    expect(statusOf(paused, command.id)).toBe('paused');
    expect(getMovementCommand(paused, 'p1')?.id).toBe(command.id);
    expect(statusOf(resumeCommand(paused, command.id), command.id)).toBe('active');
    expect(statusOf(cancelCommand(paused, command.id), command.id)).toBe('cancelled');
  });

  it('goes active → cancelled and active → interrupted', () => {
    const { book, command } = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const active = activateCommand(book, command.id);
    expect(statusOf(cancelCommand(active, command.id), command.id)).toBe('cancelled');
    expect(statusOf(interruptCommand(active, command.id), command.id)).toBe('interrupted');
  });

  it('never resumes completed or cancelled commands', () => {
    const { book, command } = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const completed = completeCommand(activateCommand(book, command.id), command.id);
    expect(activateCommand(completed, command.id)).toBe(completed);
    expect(resumeCommand(completed, command.id)).toBe(completed);
    expect(cancelCommand(completed, command.id)).toBe(completed);
    const cancelled = cancelCommand(book, command.id);
    expect(activateCommand(cancelled, command.id)).toBe(cancelled);
    expect(activateLiveCommands(cancelled)).toBe(cancelled);
  });

  it('rejects invalid transitions without changing the book', () => {
    const draft = createDraft(createCommandBook(), 'p1', PATH_A);
    expect(activateCommand(draft.book, draft.command.id)).toBe(draft.book);
    expect(completeCommand(draft.book, draft.command.id)).toBe(draft.book);
    expect(pauseCommand(draft.book, draft.command.id)).toBe(draft.book);
    const queued = confirmDraft(draft.book, draft.command.id);
    expect(completeCommand(queued, draft.command.id)).toBe(queued);
    expect(resumeCommand(queued, draft.command.id)).toBe(queued);
    expect(interruptCommand(queued, draft.command.id)).toBe(queued);
  });

  it('never lets a player have two active commands', () => {
    const first = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const active = activateCommand(first.book, first.command.id);
    // Force a second queued command for the same player, bypassing replacement.
    const second = createDraft(active, 'p1', PATH_B);
    const forced = {
      ...second.book,
      commands: second.book.commands.map((c) =>
        c.id === second.command.id ? { ...c, status: 'queued' as const } : c,
      ),
    };
    expect(() => transitionCommand(forced, second.command.id, 'active')).toThrow(/already runs/);
    const attempted = activateCommand(forced, second.command.id);
    expect(attempted).toBe(forced);
    expect(attempted.commands.filter((c) => c.status === 'active')).toHaveLength(1);
  });

  it('keeps at most one live (and so one queued) command per player', () => {
    let book = createCommandBook();
    for (let i = 0; i < 5; i += 1) book = replaceMovementCommand(book, 'p1', PATH_A).book;
    expect(getLiveMovementCommands(book)).toHaveLength(1);
    expect(book.commands.filter((c) => c.status === 'queued')).toHaveLength(1);
    expect(book.commands.filter((c) => c.status === 'cancelled')).toHaveLength(4);
  });

  it('cancels a replaced queued command and interrupts a replaced running one', () => {
    const queued = replaceMovementCommand(createCommandBook(), 'p1', PATH_A);
    const replacedQueued = replaceMovementCommand(queued.book, 'p1', PATH_B);
    expect(statusOf(replacedQueued.book, queued.command.id)).toBe('cancelled');

    const active = activateLiveCommands(replacedQueued.book);
    const replacedActive = replaceMovementCommand(active, 'p1', PATH_A, { turn: 3 });
    expect(getCommand(replacedActive.book, replacedQueued.command.id)).toMatchObject({
      status: 'interrupted',
      endedTurn: 3,
    });
    expect(getActiveMovementCommand(replacedActive.book, 'p1')).toBeUndefined();
    expect(getMovementCommand(replacedActive.book, 'p1')?.status).toBe('queued');

    const paused = pauseActiveCommands(activateLiveCommands(replacedActive.book));
    const replacedPaused = replaceMovementCommand(paused, 'p1', PATH_B, { movementMode: 'jog' });
    expect(statusOf(replacedPaused.book, replacedActive.command.id)).toBe('interrupted');
    expect(getMovementCommand(replacedPaused.book, 'p1')).toMatchObject({
      id: replacedPaused.command.id,
      status: 'queued',
      movementMode: 'jog',
    });
  });

  it('mints unique ids, even after pruning', () => {
    let book = createCommandBook();
    const ids = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      const result = replaceMovementCommand(book, `p${i % 2}`, PATH_A);
      ids.add(result.command.id);
      book = pruneFinishedCommands(result.book);
    }
    expect(ids.size).toBe(4);
  });

  it('activates and pauses in bulk and prunes finished commands by turn', () => {
    let book = replaceMovementCommand(createCommandBook(), 'p1', PATH_A).book;
    book = replaceMovementCommand(book, 'p2', PATH_B).book;
    book = activateLiveCommands(book);
    expect(book.commands.every((c) => c.status === 'active')).toBe(true);
    book = completeCommand(book, book.commands[0]!.id, { turn: 1 });
    book = pauseActiveCommands(book);
    expect(book.commands.map((c) => c.status)).toEqual(['completed', 'paused']);
    expect(pruneFinishedCommands(book, 1)).toBe(book);
    const pruned = pruneFinishedCommands(book, 2);
    expect(pruned.commands.map((c) => c.status)).toEqual(['paused']);
    expect(pruneFinishedCommands(pruned)).toBe(pruned);
  });
});
