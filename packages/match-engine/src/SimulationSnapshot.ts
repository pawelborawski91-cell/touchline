import {
  ballFrameOffset,
  BALL_FRAME_SIZE,
  PLAYER_FRAME_STRIDE,
  type BallState,
  type MatchSnapshot,
} from '@touchline/shared';
import { lerp, lerpAngle } from '@touchline/physics';

import type { SimulationConfig, SimulationState } from './SimulationState';

/** Read-only snapshot of one simulation state, in the shape the renderer consumes. */
export function toMatchSnapshot(state: SimulationState, config: SimulationConfig): MatchSnapshot {
  return {
    tick: state.tick,
    phase: state.phase,
    clockSeconds: state.tick * config.match.fixedDeltaTime,
    ...state.context,
    ball: state.ball.ball,
    players: state.players,
  };
}

function lerp3(
  a: BallState['position'],
  b: BallState['position'],
  t: number,
): BallState['position'] {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/** The ball between two states (position and velocity lerped; everything else from `current`). */
export function interpolateBall(previous: BallState, current: BallState, alpha: number): BallState {
  const t = Math.min(Math.max(alpha, 0), 1);
  if (t === 1 || previous === current) return current;
  return {
    ...current,
    position: lerp3(previous.position, current.position, t),
    velocity: lerp3(previous.velocity, current.velocity, t),
  };
}

/**
 * Snapshot between two consecutive simulation states. Positions are lerped and headings take the
 * shortest arc, so rendering at 60 FPS does not show the 20 Hz steps.
 */
export function interpolateSnapshot(
  previous: SimulationState,
  current: SimulationState,
  alpha: number,
  config: SimulationConfig,
): MatchSnapshot {
  const t = Math.min(Math.max(alpha, 0), 1);
  const players = current.players.map((player, i) => {
    const before = previous.players[i];
    if (!before || before.id !== player.id || t === 1) return player;
    return {
      ...player,
      position: lerp(before.position, player.position, t),
      velocity: lerp(before.velocity, player.velocity, t),
      facing: lerpAngle(before.facing, player.facing, t),
    };
  });
  const tick = previous.tick + (current.tick - previous.tick) * t;
  return {
    ...toMatchSnapshot(current, config),
    clockSeconds: tick * config.match.fixedDeltaTime,
    ball: interpolateBall(previous.ball.ball, current.ball.ball, t),
    players,
  };
}

/**
 * Writes the interpolated frame into `out` without allocating a snapshot. This is what the render
 * loop uses every frame. Per player (`PLAYER_FRAME_STRIDE` values each, snapshot order): x, y,
 * facing, current waypoint index or -1. Then, at `ballFrameOffset(playerCount)`, the ball's
 * `BALL_FRAME_SIZE` values: x, y, z, vx, vy, vz.
 */
export function writeInterpolatedFrame(
  previous: SimulationState,
  current: SimulationState,
  alpha: number,
  out: number[],
): number[] {
  const t = Math.min(Math.max(alpha, 0), 1);
  const count = current.players.length;
  out.length = count * PLAYER_FRAME_STRIDE + BALL_FRAME_SIZE;
  current.players.forEach((player, i) => {
    const before = previous.players[i] ?? player;
    const base = i * PLAYER_FRAME_STRIDE;
    const pathState = player.activeCommandId
      ? current.pathStates[player.activeCommandId]
      : undefined;
    out[base] = before.position.x + (player.position.x - before.position.x) * t;
    out[base + 1] = before.position.y + (player.position.y - before.position.y) * t;
    out[base + 2] = lerpAngle(before.facing, player.facing, t);
    out[base + 3] = player.activeCommandId ? (pathState?.currentWaypointIndex ?? 1) : -1;
  });
  const a = previous.ball.ball;
  const b = current.ball.ball;
  const base = ballFrameOffset(count);
  out[base] = a.position.x + (b.position.x - a.position.x) * t;
  out[base + 1] = a.position.y + (b.position.y - a.position.y) * t;
  out[base + 2] = a.position.z + (b.position.z - a.position.z) * t;
  out[base + 3] = a.velocity.x + (b.velocity.x - a.velocity.x) * t;
  out[base + 4] = a.velocity.y + (b.velocity.y - a.velocity.y) * t;
  out[base + 5] = a.velocity.z + (b.velocity.z - a.velocity.z) * t;
  return out;
}
