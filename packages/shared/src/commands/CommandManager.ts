import type { Vector2 } from '../math';
import type { MovementMode } from '../player';
import { createMoveCommand } from './CommandFactory';
import {
  isFinishedCommand,
  isLiveMovementCommand,
  type CommandStatus,
  type PlayerCommand,
} from './PlayerCommand';

/**
 * Immutable store of planned commands. Every operation returns a new book and never mutates the
 * previous one, so it works as React state, inside the simulation and in tests alike.
 */
export interface CommandBook {
  readonly commands: readonly PlayerCommand[];
  /** Monotonic counter used to mint command ids. */
  readonly nextSequence: number;
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

export function getActiveMovementCommand(
  book: CommandBook,
  playerId: string,
): PlayerCommand | undefined {
  return book.commands.find(
    (command) =>
      command.playerId === playerId && command.type === 'move' && command.status === 'active',
  );
}

export function getLiveMovementCommands(book: CommandBook): PlayerCommand[] {
  return book.commands.filter(isLiveMovementCommand);
}

export interface CreateDraftResult {
  book: CommandBook;
  command: PlayerCommand;
}

export interface DraftOptions {
  createdAtTick?: number;
  movementMode?: MovementMode;
}

/** Adds a draft move command, replacing any earlier draft for the same player. */
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

function withStatus(book: CommandBook, commandId: string, status: CommandStatus): CommandBook {
  return {
    ...book,
    commands: book.commands.map((command) =>
      command.id === commandId ? { ...command, status } : command,
    ),
  };
}

/**
 * Queues a draft. The player's previous live movement command is replaced (removed), keeping
 * one movement command per player. Unknown ids or non-drafts leave the book unchanged.
 */
export function confirmDraft(book: CommandBook, commandId: string): CommandBook {
  const draft = getCommand(book, commandId);
  if (!draft || draft.status !== 'draft') return book;
  const commands = book.commands
    .filter(
      (command) =>
        command.id === commandId ||
        !(command.playerId === draft.playerId && isLiveMovementCommand(command)),
    )
    .map((command) =>
      command.id === commandId ? { ...command, status: 'queued' as const } : command,
    );
  return { ...book, commands };
}

/** Creates and confirms a movement command in one step, replacing the player's existing one. */
export function replaceMovementCommand(
  book: CommandBook,
  playerId: string,
  path: readonly Vector2[],
  options: DraftOptions = {},
): CreateDraftResult {
  const created = createDraft(book, playerId, path, options);
  const confirmed = confirmDraft(created.book, created.command.id);
  const command = getCommand(confirmed, created.command.id) ?? created.command;
  return { book: confirmed, command };
}

/** Marks a draft or live command as cancelled; finished commands are left alone. */
export function cancelCommand(book: CommandBook, commandId: string): CommandBook {
  const command = getCommand(book, commandId);
  if (!command || isFinishedCommand(command)) return book;
  return withStatus(book, commandId, 'cancelled');
}

export function removeCommand(book: CommandBook, commandId: string): CommandBook {
  if (!getCommand(book, commandId)) return book;
  return { ...book, commands: book.commands.filter((command) => command.id !== commandId) };
}

/**
 * `queued → active` or `paused → active`. Refused (book unchanged) when the player already has
 * a different active movement command, so a player never runs two at once.
 */
export function activateCommand(book: CommandBook, commandId: string): CommandBook {
  const command = getCommand(book, commandId);
  if (!command || (command.status !== 'queued' && command.status !== 'paused')) return book;
  const active = getActiveMovementCommand(book, command.playerId);
  if (active && active.id !== commandId) return book;
  return withStatus(book, commandId, 'active');
}

/** `paused → active`. */
export function resumeCommand(book: CommandBook, commandId: string): CommandBook {
  return getCommand(book, commandId)?.status === 'paused' ? activateCommand(book, commandId) : book;
}

/** `active → paused`. */
export function pauseCommand(book: CommandBook, commandId: string): CommandBook {
  return getCommand(book, commandId)?.status === 'active'
    ? withStatus(book, commandId, 'paused')
    : book;
}

/** `active → completed`. */
export function completeCommand(book: CommandBook, commandId: string): CommandBook {
  return getCommand(book, commandId)?.status === 'active'
    ? withStatus(book, commandId, 'completed')
    : book;
}

/** Activates every queued or paused command; used when execution starts. */
export function activateLiveCommands(book: CommandBook): CommandBook {
  return book.commands
    .filter((command) => command.status === 'queued' || command.status === 'paused')
    .reduce((next, command) => activateCommand(next, command.id), book);
}

/** Pauses every active command; used when execution stops mid-command. */
export function pauseActiveCommands(book: CommandBook): CommandBook {
  return book.commands
    .filter((command) => command.status === 'active')
    .reduce((next, command) => pauseCommand(next, command.id), book);
}

/** Drops completed, cancelled and interrupted commands. */
export function pruneFinishedCommands(book: CommandBook): CommandBook {
  if (!book.commands.some(isFinishedCommand)) return book;
  return { ...book, commands: book.commands.filter((command) => !isFinishedCommand(command)) };
}

export type CommandAction =
  | ({ type: 'createDraft'; playerId: string; path: readonly Vector2[] } & DraftOptions)
  | { type: 'confirmDraft'; commandId: string }
  | ({ type: 'replaceMovement'; playerId: string; path: readonly Vector2[] } & DraftOptions)
  | { type: 'cancel'; commandId: string }
  | { type: 'remove'; commandId: string }
  | { type: 'activate'; commandId: string }
  | { type: 'pause'; commandId: string }
  | { type: 'resume'; commandId: string }
  | { type: 'complete'; commandId: string };

/** Reducer form of the manager, for `useReducer` or any other state container. */
export function commandReducer(book: CommandBook, action: CommandAction): CommandBook {
  switch (action.type) {
    case 'createDraft':
      return createDraft(book, action.playerId, action.path, action).book;
    case 'confirmDraft':
      return confirmDraft(book, action.commandId);
    case 'replaceMovement':
      return replaceMovementCommand(book, action.playerId, action.path, action).book;
    case 'cancel':
      return cancelCommand(book, action.commandId);
    case 'remove':
      return removeCommand(book, action.commandId);
    case 'activate':
      return activateCommand(book, action.commandId);
    case 'pause':
      return pauseCommand(book, action.commandId);
    case 'resume':
      return resumeCommand(book, action.commandId);
    case 'complete':
      return completeCommand(book, action.commandId);
  }
}
