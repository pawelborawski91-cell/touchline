import type { Vector2 } from '../math';
import type { MovementMode } from '../player';
import { createMoveCommand } from './CommandFactory';
import { canTransitionCommand, CommandTransitionError } from './CommandLifecycle';
import {
  isFinishedCommand,
  isLiveMovementCommand,
  type CommandStatus,
  type PlayerCommand,
} from './PlayerCommand';

/**
 * Immutable store of commands. Every operation returns a new book and never mutates the previous
 * one, so it works as React state, inside the simulation and in tests alike.
 *
 * Invariant: a player has at most one live (queued, active or paused) movement command.
 */
export interface CommandBook {
  readonly commands: readonly PlayerCommand[];
  /** Monotonic counter used to mint command ids; never reused, even after pruning. */
  readonly nextSequence: number;
}

/** Extra data recorded with a transition. */
export interface TransitionContext {
  /** Current turn number, stamped into `startedTurn` / `endedTurn`. */
  turn?: number;
}

export function createCommandBook(): CommandBook {
  return { commands: [], nextSequence: 1 };
}

export function getCommand(book: CommandBook, commandId: string): PlayerCommand | undefined {
  return book.commands.find((command) => command.id === commandId);
}

export function getPlayerCommands(book: CommandBook, playerId: string): PlayerCommand[] {
  return book.commands.filter((command) => command.playerId === playerId);
}

/** The queued/active/paused move command for a player, if any (there is at most one). */
export function getMovementCommand(book: CommandBook, playerId: string): PlayerCommand | undefined {
  return book.commands.find(
    (command) => command.playerId === playerId && isLiveMovementCommand(command),
  );
}

function findByStatus(book: CommandBook, playerId: string, status: CommandStatus) {
  return book.commands.find(
    (command) =>
      command.playerId === playerId && command.type === 'move' && command.status === status,
  );
}

export function getActiveMovementCommand(
  book: CommandBook,
  playerId: string,
): PlayerCommand | undefined {
  return findByStatus(book, playerId, 'active');
}

export function getLiveMovementCommands(book: CommandBook): PlayerCommand[] {
  return book.commands.filter(isLiveMovementCommand);
}

export function countCommandsByStatus(book: CommandBook): Record<CommandStatus, number> {
  const counts: Record<CommandStatus, number> = {
    draft: 0,
    queued: 0,
    active: 0,
    paused: 0,
    completed: 0,
    cancelled: 0,
    interrupted: 0,
  };
  for (const command of book.commands) counts[command.status] += 1;
  return counts;
}

/**
 * Applies one status change, validated against `COMMAND_TRANSITIONS`. Throws
 * `CommandTransitionError` for unknown ids, illegal transitions, or activating a command while
 * the player already has a different active one.
 */
export function transitionCommand(
  book: CommandBook,
  commandId: string,
  to: CommandStatus,
  context: TransitionContext = {},
): CommandBook {
  const command = getCommand(book, commandId);
  if (!command) throw new CommandTransitionError(commandId, null, to);
  if (!canTransitionCommand(command.status, to)) {
    throw new CommandTransitionError(commandId, command.status, to);
  }
  if (to === 'active') {
    const active = getActiveMovementCommand(book, command.playerId);
    if (active && active.id !== commandId) {
      throw new CommandTransitionError(
        commandId,
        command.status,
        to,
        `player ${command.playerId} already runs ${active.id}`,
      );
    }
  }
  const turn = context.turn ?? null;
  const next: PlayerCommand = {
    ...command,
    status: to,
    startedTurn: to === 'active' && command.startedTurn === null ? turn : command.startedTurn,
    endedTurn:
      to === 'completed' || to === 'cancelled' || to === 'interrupted' ? turn : command.endedTurn,
  };
  return { ...book, commands: book.commands.map((c) => (c.id === commandId ? next : c)) };
}

/** `transitionCommand` that leaves the book unchanged instead of throwing. */
export function tryTransitionCommand(
  book: CommandBook,
  commandId: string,
  to: CommandStatus,
  context: TransitionContext = {},
): CommandBook {
  try {
    return transitionCommand(book, commandId, to, context);
  } catch (error) {
    if (error instanceof CommandTransitionError) return book;
    throw error;
  }
}

export interface CreateDraftResult {
  book: CommandBook;
  command: PlayerCommand;
}

export interface DraftOptions extends TransitionContext {
  createdAtTick?: number;
  movementMode?: MovementMode;
}

/** Adds a draft move command, discarding any earlier draft for the same player. */
export function createDraft(
  book: CommandBook,
  playerId: string,
  path: readonly Vector2[],
  options: DraftOptions = {},
): CreateDraftResult {
  const command = createMoveCommand({
    id: `cmd-${book.nextSequence}`,
    playerId,
    path,
    createdAtTick: options.createdAtTick,
    movementMode: options.movementMode,
  });
  const commands = book.commands.filter(
    (existing) => !(existing.playerId === playerId && existing.status === 'draft'),
  );
  return {
    book: { commands: [...commands, command], nextSequence: book.nextSequence + 1 },
    command,
  };
}

/**
 * Ends a player's live movement command because a new one replaces it. Documented rule:
 * a command that never ran (queued) becomes `cancelled`; one that had started (active or
 * paused) becomes `interrupted`. Either way it can never run again, so nothing is orphaned.
 */
export function supersedeMovementCommand(
  book: CommandBook,
  playerId: string,
  context: TransitionContext = {},
  exceptCommandId?: string,
): CommandBook {
  const live = book.commands.find(
    (command) =>
      command.playerId === playerId &&
      command.id !== exceptCommandId &&
      isLiveMovementCommand(command),
  );
  if (!live) return book;
  return transitionCommand(
    book,
    live.id,
    live.status === 'queued' ? 'cancelled' : 'interrupted',
    context,
  );
}

/**
 * Queues a draft, superseding the player's previous live movement command (see
 * `supersedeMovementCommand`). Unknown ids or non-drafts leave the book unchanged.
 */
export function confirmDraft(
  book: CommandBook,
  commandId: string,
  context: TransitionContext = {},
): CommandBook {
  const draft = getCommand(book, commandId);
  if (!draft || draft.status !== 'draft') return book;
  const superseded = supersedeMovementCommand(book, draft.playerId, context, commandId);
  return transitionCommand(superseded, commandId, 'queued', context);
}

/** Creates and confirms a movement command in one step, superseding the player's current one. */
export function replaceMovementCommand(
  book: CommandBook,
  playerId: string,
  path: readonly Vector2[],
  options: DraftOptions = {},
): CreateDraftResult {
  const created = createDraft(book, playerId, path, options);
  const confirmed = confirmDraft(created.book, created.command.id, options);
  const command = getCommand(confirmed, created.command.id) ?? created.command;
  return { book: confirmed, command };
}

/** Cancels a draft or live command; finished or unknown commands are left alone. */
export function cancelCommand(
  book: CommandBook,
  commandId: string,
  context: TransitionContext = {},
): CommandBook {
  return tryTransitionCommand(book, commandId, 'cancelled', context);
}

export function removeCommand(book: CommandBook, commandId: string): CommandBook {
  if (!getCommand(book, commandId)) return book;
  return { ...book, commands: book.commands.filter((command) => command.id !== commandId) };
}

/** `queued → active` or `paused → active`; no-op when not allowed. */
export function activateCommand(
  book: CommandBook,
  commandId: string,
  context: TransitionContext = {},
): CommandBook {
  return tryTransitionCommand(book, commandId, 'active', context);
}

/** `paused → active` only. */
export function resumeCommand(
  book: CommandBook,
  commandId: string,
  context: TransitionContext = {},
): CommandBook {
  return getCommand(book, commandId)?.status === 'paused'
    ? activateCommand(book, commandId, context)
    : book;
}

/** `active → paused`. */
export function pauseCommand(
  book: CommandBook,
  commandId: string,
  context: TransitionContext = {},
): CommandBook {
  return tryTransitionCommand(book, commandId, 'paused', context);
}

/** `active → completed`. */
export function completeCommand(
  book: CommandBook,
  commandId: string,
  context: TransitionContext = {},
): CommandBook {
  return tryTransitionCommand(book, commandId, 'completed', context);
}

/** `active → interrupted` or `paused → interrupted`. */
export function interruptCommand(
  book: CommandBook,
  commandId: string,
  context: TransitionContext = {},
): CommandBook {
  return tryTransitionCommand(book, commandId, 'interrupted', context);
}

/** Activates every queued or paused command; used when execution starts. */
export function activateLiveCommands(
  book: CommandBook,
  context: TransitionContext = {},
): CommandBook {
  return book.commands
    .filter((command) => command.status === 'queued' || command.status === 'paused')
    .reduce((next, command) => activateCommand(next, command.id, context), book);
}

/** Pauses every active command (used by stoppages, not by normal turn ends). */
export function pauseActiveCommands(
  book: CommandBook,
  context: TransitionContext = {},
): CommandBook {
  return book.commands
    .filter((command) => command.status === 'active')
    .reduce((next, command) => pauseCommand(next, command.id, context), book);
}

/**
 * Drops finished commands. With `beforeTurn`, only those that ended before that turn are
 * dropped, so the previous turn's results stay inspectable.
 */
export function pruneFinishedCommands(book: CommandBook, beforeTurn?: number): CommandBook {
  const drop = (command: PlayerCommand) =>
    isFinishedCommand(command) &&
    (beforeTurn === undefined || command.endedTurn === null || command.endedTurn < beforeTurn);
  if (!book.commands.some(drop)) return book;
  return { ...book, commands: book.commands.filter((command) => !drop(command)) };
}

export type CommandAction =
  | ({ type: 'createDraft'; playerId: string; path: readonly Vector2[] } & DraftOptions)
  | ({ type: 'confirmDraft'; commandId: string } & TransitionContext)
  | ({ type: 'replaceMovement'; playerId: string; path: readonly Vector2[] } & DraftOptions)
  | ({ type: 'cancel'; commandId: string } & TransitionContext)
  | { type: 'remove'; commandId: string }
  | ({ type: 'activate'; commandId: string } & TransitionContext)
  | ({ type: 'pause'; commandId: string } & TransitionContext)
  | ({ type: 'resume'; commandId: string } & TransitionContext)
  | ({ type: 'complete'; commandId: string } & TransitionContext)
  | ({ type: 'interrupt'; commandId: string } & TransitionContext);

/** Reducer form of the manager, for `useReducer` or any other state container. */
export function commandReducer(book: CommandBook, action: CommandAction): CommandBook {
  switch (action.type) {
    case 'createDraft':
      return createDraft(book, action.playerId, action.path, action).book;
    case 'confirmDraft':
      return confirmDraft(book, action.commandId, action);
    case 'replaceMovement':
      return replaceMovementCommand(book, action.playerId, action.path, action).book;
    case 'cancel':
      return cancelCommand(book, action.commandId, action);
    case 'remove':
      return removeCommand(book, action.commandId);
    case 'activate':
      return activateCommand(book, action.commandId, action);
    case 'pause':
      return pauseCommand(book, action.commandId, action);
    case 'resume':
      return resumeCommand(book, action.commandId, action);
    case 'complete':
      return completeCommand(book, action.commandId, action);
    case 'interrupt':
      return interruptCommand(book, action.commandId, action);
  }
}
