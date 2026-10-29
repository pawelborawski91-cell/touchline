import type { Vector2 } from '@touchline/shared';

import { createMoveCommand } from './CommandFactory';
import { isLiveMovementCommand, type CommandStatus, type PlayerCommand } from './PlayerCommand';

/**
 * Immutable store of planned commands. Every operation returns a new book and never mutates the
 * previous one, so it works as React state and in tests alike. Commands are stored, not executed.
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

export function getLiveMovementCommands(book: CommandBook): PlayerCommand[] {
  return book.commands.filter(isLiveMovementCommand);
}

export interface CreateDraftResult {
  book: CommandBook;
  command: PlayerCommand;
}

/** Adds a draft move command, replacing any earlier draft for the same player. */
export function createDraft(
  book: CommandBook,
  playerId: string,
  path: readonly Vector2[],
  createdAtTick = 0,
): CreateDraftResult {
  const command = createMoveCommand({
    id: `cmd-${book.nextSequence}`,
    playerId,
    path,
    createdAtTick,
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
  createdAtTick = 0,
): CreateDraftResult {
  const created = createDraft(book, playerId, path, createdAtTick);
  const confirmed = confirmDraft(created.book, created.command.id);
  const command = getCommand(confirmed, created.command.id) ?? created.command;
  return { book: confirmed, command };
}

/** Marks a draft or live command as cancelled; finished commands are left alone. */
export function cancelCommand(book: CommandBook, commandId: string): CommandBook {
  const command = getCommand(book, commandId);
  if (!command || command.status === 'completed' || command.status === 'cancelled') return book;
  return withStatus(book, commandId, 'cancelled');
}

export function removeCommand(book: CommandBook, commandId: string): CommandBook {
  if (!getCommand(book, commandId)) return book;
  return { ...book, commands: book.commands.filter((command) => command.id !== commandId) };
}

export type CommandAction =
  | { type: 'createDraft'; playerId: string; path: readonly Vector2[]; createdAtTick?: number }
  | { type: 'confirmDraft'; commandId: string }
  | { type: 'replaceMovement'; playerId: string; path: readonly Vector2[]; createdAtTick?: number }
  | { type: 'cancel'; commandId: string }
  | { type: 'remove'; commandId: string };

/** Reducer form of the manager, for `useReducer` or any other state container. */
export function commandReducer(book: CommandBook, action: CommandAction): CommandBook {
  switch (action.type) {
    case 'createDraft':
      return createDraft(book, action.playerId, action.path, action.createdAtTick).book;
    case 'confirmDraft':
      return confirmDraft(book, action.commandId);
    case 'replaceMovement':
      return replaceMovementCommand(book, action.playerId, action.path, action.createdAtTick).book;
    case 'cancel':
      return cancelCommand(book, action.commandId);
    case 'remove':
      return removeCommand(book, action.commandId);
  }
}
