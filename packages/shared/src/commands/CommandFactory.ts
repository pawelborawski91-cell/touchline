import type { Vector2 } from '../math';
import { DEFAULT_MOVEMENT_MODE, type MovementMode } from '../player';

import { DEFAULT_COMMAND_PRIORITY, type PlayerCommand } from './PlayerCommand';

export interface MoveCommandInput {
  id: string;
  playerId: string;
  path: readonly Vector2[];
  movementMode?: MovementMode;
  createdAtTick?: number;
  priority?: number;
  interruptible?: boolean;
}

/** Builds a draft move command. The path is copied so later edits never alias caller data. */
export function createMoveCommand(input: MoveCommandInput): PlayerCommand {
  return {
    id: input.id,
    playerId: input.playerId,
    type: 'move',
    status: 'draft',
    path: input.path.map((point) => ({ x: point.x, y: point.y })),
    movementMode: input.movementMode ?? DEFAULT_MOVEMENT_MODE,
    createdAtTick: input.createdAtTick ?? 0,
    priority: input.priority ?? DEFAULT_COMMAND_PRIORITY,
    interruptible: input.interruptible ?? true,
    startedTurn: null,
    endedTurn: null,
  };
}
