import {
  completeCommand,
  getActiveMovementCommand,
  type CommandBook,
  type MatchPlayer,
  type PlayerCommand,
  type Vector2,
} from '@touchline/shared';
import {
  computeSteering,
  drainStamina,
  followPath,
  getSpeedCap,
  preparePath,
  stepMovement,
  type PathFollowerConfig,
  type PreparedPath,
} from '@touchline/physics';
import type { MovementIntent } from '@touchline/player-ai';

import type { PathExecutionState, SimulationConfig, SimulationState } from './SimulationState';

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
  pathState: PathExecutionState | null;
  completedCommandId: string | null;
}

function stepIdlePlayer(player: MatchPlayer, dt: number): PlayerStepResult {
  const speed = Math.hypot(player.velocity.x, player.velocity.y);
  if (speed === 0) return { player, pathState: null, completedCommandId: null };
  const body = stepMovement(player, { direction: null, speed: 0 }, player.movement, dt);
  return { player: { ...player, ...body }, pathState: null, completedCommandId: null };
}

/**
 * A player standing still this close to a positional target (× its arrival radius) stays put,
 * so small target refinements do not make settled players shuffle.
 */
const SETTLED_FACTOR = 2.5;
const SETTLED_SPEED = 0.3;

/**
 * Executes an AI movement intent with the same physics as commands: steer for the target at the
 * intent's pace (capped by stamina), braking to arrive. Heading and speed change only within
 * the player's turn rate, acceleration and deceleration, so there are no jumps.
 */
function stepAutonomousPlayer(
  player: MatchPlayer,
  intent: MovementIntent,
  config: SimulationConfig,
): PlayerStepResult {
  const dt = config.match.fixedDeltaTime;
  const { targetPosition: target } = intent;
  const d = Math.hypot(target.x - player.position.x, target.y - player.position.y);
  const speed = Math.hypot(player.velocity.x, player.velocity.y);
  const settled =
    d <= intent.arrivalRadius ||
    (intent.exitSpeed === 0 && speed < SETTLED_SPEED && d <= intent.arrivalRadius * SETTLED_FACTOR);
  if (settled) return stepIdlePlayer(player, dt);
  const cap = getSpeedCap(
    player.movement,
    intent.movementMode,
    player.staminaCurrent,
    config.stamina,
  );
  const steering = computeSteering({
    position: player.position,
    velocity: player.velocity,
    target,
    distanceToGoal: d,
    cruiseSpeed: cap,
    exitSpeed: Math.min(intent.exitSpeed, cap),
    attributes: player.movement,
  });
  const body = stepMovement(
    player,
    { direction: steering.desiredDirection, speed: steering.desiredSpeed },
    player.movement,
    dt,
  );
  const nextSpeed = Math.hypot(body.velocity.x, body.velocity.y);
  return {
    player: {
      ...player,
      ...body,
      staminaCurrent: drainStamina(
        player.staminaCurrent,
        player.movement,
        intent.movementMode,
        nextSpeed,
        cap,
        dt,
        config.stamina,
      ),
    },
    pathState: null,
    completedCommandId: null,
  };
}

/** Initial path state for a command that has not started following its path yet. */
export function createPathExecutionState(
  commandId: string,
  pointCount: number,
): PathExecutionState {
  return {
    commandId,
    currentWaypointIndex: 1,
    distanceAlongPath: 0,
    progress: 0,
    isFinalWaypoint: pointCount <= 2,
  };
}

function stepCommandedPlayer(
  player: MatchPlayer,
  command: PlayerCommand,
  previous: PathExecutionState | undefined,
  config: SimulationConfig,
): PlayerStepResult {
  const dt = config.match.fixedDeltaTime;
  const prepared = preparedPathFor(command.path, config.follower);
  const last = Math.max(prepared.points.length - 1, 1);
  const before = previous ?? createPathExecutionState(command.id, prepared.points.length);
  const cap = getSpeedCap(
    player.movement,
    command.movementMode,
    player.staminaCurrent,
    config.stamina,
  );
  const result = followPath(
    prepared,
    { waypointIndex: before.currentWaypointIndex },
    player,
    cap,
    player.movement,
    config.follower,
  );
  // Progress is monotonic: the follower never revisits a waypoint and distance never shrinks.
  const waypointIndex = Math.max(before.currentWaypointIndex, result.follower.waypointIndex);
  const covered = Math.min(
    prepared.total,
    Math.max(before.distanceAlongPath, prepared.total - result.remaining),
  );

  if (result.completed) {
    // Stopped within the completion radius: keep the final position, clear any residual creep.
    return {
      player: { ...player, velocity: { x: 0, y: 0 }, activeCommandId: null },
      pathState: {
        commandId: command.id,
        currentWaypointIndex: last,
        distanceAlongPath: prepared.total,
        progress: 1,
        isFinalWaypoint: true,
      },
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
    pathState: {
      commandId: command.id,
      currentWaypointIndex: waypointIndex,
      distanceAlongPath: covered,
      progress: prepared.total > 0 ? covered / prepared.total : 1,
      isFinalWaypoint: waypointIndex >= last,
    },
    completedCommandId: null,
  };
}

/**
 * Advances every player by one fixed step. Pure: the input state is never mutated, and the
 * output depends only on the input and config, so identical inputs give identical results.
 * An active command always drives its player; otherwise the player's AI intent does (when the
 * AI is enabled), and without either the player brakes. Players are processed in array order
 * and do not interact (no collisions yet).
 */
export function stepPlayers(state: SimulationState, config: SimulationConfig): SimulationState {
  const dt = config.match.fixedDeltaTime;
  let commands: CommandBook = state.commands;
  let pathStates = state.pathStates;

  const players = state.players.map((player) => {
    const command = getActiveMovementCommand(state.commands, player.id);
    const idle = player.activeCommandId ? { ...player, activeCommandId: null } : player;
    const intent = config.ai.enabled ? state.ai.players[player.id]?.intent : null;
    const result = command
      ? stepCommandedPlayer(player, command, state.pathStates[command.id], config)
      : intent
        ? stepAutonomousPlayer(idle, intent, config)
        : stepIdlePlayer(idle, dt);
    if (result.pathState) {
      if (pathStates === state.pathStates) pathStates = { ...state.pathStates };
      (pathStates as Record<string, PathExecutionState>)[result.pathState.commandId] =
        result.pathState;
    }
    if (result.completedCommandId) {
      commands = completeCommand(commands, result.completedCommandId, { turn: state.turn });
    }
    return result.player;
  });

  return { ...state, players, commands, pathStates };
}
