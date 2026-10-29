import {
  completeCommand,
  getActiveMovementCommand,
  type CommandBook,
  type MatchPlayer,
  type PlayerCommand,
  type Vector2,
} from '@touchline/shared';
import {
  createFollowerState,
  drainStamina,
  followPath,
  getSpeedCap,
  preparePath,
  stepMovement,
  type PathFollowerConfig,
  type PreparedPath,
} from '@touchline/physics';

import type { FollowerEntry, SimulationConfig, SimulationState } from './SimulationState';

/**
 * Prepared paths keyed by the command's (immutable) path array. A pure memo: the result depends
 * only on the path and follower config, so caching never changes simulation output.
 */
const preparedPaths = new WeakMap<
  readonly Vector2[],
  { config: PathFollowerConfig; path: PreparedPath }
>();

function preparedPathFor(points: readonly Vector2[], config: PathFollowerConfig): PreparedPath {
  const cached = preparedPaths.get(points);
  if (cached && cached.config === config) return cached.path;
  const path = preparePath(points, config);
  preparedPaths.set(points, { config, path });
  return path;
}

interface PlayerStepResult {
  player: MatchPlayer;
  follower: FollowerEntry | null;
  completedCommandId: string | null;
}

function stepIdlePlayer(player: MatchPlayer, dt: number): PlayerStepResult {
  const speed = Math.hypot(player.velocity.x, player.velocity.y);
  if (speed === 0) return { player, follower: null, completedCommandId: null };
  const body = stepMovement(player, { direction: null, speed: 0 }, player.movement, dt);
  return { player: { ...player, ...body }, follower: null, completedCommandId: null };
}

function stepCommandedPlayer(
  player: MatchPlayer,
  command: PlayerCommand,
  previous: FollowerEntry | undefined,
  config: SimulationConfig,
): PlayerStepResult {
  const dt = config.match.fixedDeltaTime;
  const follower =
    previous && previous.commandId === command.id
      ? { waypointIndex: previous.waypointIndex }
      : createFollowerState();
  const cap = getSpeedCap(
    player.movement,
    command.movementMode,
    player.staminaCurrent,
    config.stamina,
  );
  const result = followPath(
    preparedPathFor(command.path, config.follower),
    follower,
    player,
    cap,
    player.movement,
    config.follower,
  );

  if (result.completed) {
    // Stopped within the completion radius: keep the final position, clear any residual creep.
    return {
      player: { ...player, velocity: { x: 0, y: 0 }, activeCommandId: null },
      follower: null,
      completedCommandId: command.id,
    };
  }

  const body = stepMovement(player, result.intent, player.movement, dt);
  const speed = Math.hypot(body.velocity.x, body.velocity.y);
  return {
    player: {
      ...player,
      ...body,
      staminaCurrent: drainStamina(
        player.staminaCurrent,
        player.movement,
        command.movementMode,
        speed,
        cap,
        dt,
        config.stamina,
      ),
      activeCommandId: command.id,
    },
    follower: { commandId: command.id, waypointIndex: result.follower.waypointIndex },
    completedCommandId: null,
  };
}

/**
 * Advances every player by one fixed step. Pure: the input state is never mutated, and the
 * output depends only on the input and config, so identical inputs give identical results.
 * Players are processed in array order and do not interact (no collisions yet).
 */
export function stepPlayers(state: SimulationState, config: SimulationConfig): SimulationState {
  const dt = config.match.fixedDeltaTime;
  let commands: CommandBook = state.commands;
  const followers: Record<string, FollowerEntry> = {};

  const players = state.players.map((player) => {
    const command = getActiveMovementCommand(state.commands, player.id);
    const result = command
      ? stepCommandedPlayer(player, command, state.followers[player.id], config)
      : stepIdlePlayer({ ...player, activeCommandId: null }, dt);
    if (result.follower) followers[player.id] = result.follower;
    if (result.completedCommandId) commands = completeCommand(commands, result.completedCommandId);
    return result.player;
  });

  return { ...state, players, commands, followers };
}
