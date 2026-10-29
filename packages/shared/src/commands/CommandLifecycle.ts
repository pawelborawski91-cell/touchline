import type { CommandStatus } from './PlayerCommand';

/**
 * Every legal command status change. Terminal statuses (completed, cancelled, interrupted) have
 * no way out, so a finished command can never run again.
 *
 * ```
 * draft ──► queued ──► active ──► completed
 *   │         │        │  ▲ │
 *   │         │  pause ▼  │ └──► interrupted   (superseded while running)
 *   │         │      paused ──► interrupted
 *   └─────────┴──────┴──────► cancelled       (user cancel, or replaced before it ran)
 * ```
 */
export const COMMAND_TRANSITIONS: Readonly<Record<CommandStatus, readonly CommandStatus[]>> =
  Object.freeze({
    draft: ['queued', 'cancelled'],
    queued: ['active', 'cancelled'],
    active: ['completed', 'cancelled', 'paused', 'interrupted'],
    paused: ['active', 'cancelled', 'interrupted'],
    completed: [],
    cancelled: [],
    interrupted: [],
  });

export function canTransitionCommand(from: CommandStatus, to: CommandStatus): boolean {
  return COMMAND_TRANSITIONS[from].includes(to);
}

/** Thrown when a command transition is not allowed (or the command does not exist). */
export class CommandTransitionError extends Error {
  constructor(
    readonly commandId: string,
    readonly from: CommandStatus | null,
    readonly to: CommandStatus,
    detail?: string,
  ) {
    super(
      from === null
        ? `Command ${commandId} does not exist (cannot make it ${to}).`
        : `Command ${commandId} cannot go from ${from} to ${to}${detail ? `: ${detail}` : ''}.`,
    );
    this.name = 'CommandTransitionError';
  }
}
