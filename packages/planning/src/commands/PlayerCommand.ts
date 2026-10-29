import type { Vector2 } from '@touchline/shared';

export type CommandStatus =
  'draft' | 'queued' | 'active' | 'paused' | 'completed' | 'cancelled' | 'interrupted';

export type CommandType = 'move';

/** A planned instruction for one player. Paths are world positions in metres, never screen space. */
export interface PlayerCommand {
  id: string;
  playerId: string;
  type: CommandType;
  status: CommandStatus;
  path: Vector2[];
  createdAtTick: number;
  priority: number;
  interruptible: boolean;
}

export const DEFAULT_COMMAND_PRIORITY = 50;

/** Statuses that occupy a player's single movement slot. */
export const LIVE_MOVEMENT_STATUSES: readonly CommandStatus[] = ['queued', 'active', 'paused'];

export function isLiveMovementCommand(command: PlayerCommand): boolean {
  return command.type === 'move' && LIVE_MOVEMENT_STATUSES.includes(command.status);
}
