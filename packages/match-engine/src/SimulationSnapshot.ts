import { PLAYER_FRAME_STRIDE, type MatchSnapshot } from '@touchline/shared';
import { lerp, lerpAngle } from '@touchline/physics';

import type { SimulationConfig, SimulationState } from './SimulationState';

/** Read-only snapshot of one simulation state, in the shape the renderer consumes. */
export function toMatchSnapshot(state: SimulationState, config: SimulationConfig): MatchSnapshot {
  return {
    tick: state.tick,
    phase: state.phase,
    clockSeconds: state.tick * config.match.fixedDeltaTime,
    ...state.context,
    players: state.players,
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
    players,
  };
}

/**
 * Writes the interpolated per-player frame (`PLAYER_FRAME_STRIDE` values each, snapshot order:
 * x, y, facing, current waypoint index or -1) into `out` without allocating a snapshot. This is
 * what the render loop uses every frame.
 */
export function writeInterpolatedFrame(
  previous: SimulationState,
  current: SimulationState,
  alpha: number,
  out: number[],
): number[] {
  const t = Math.min(Math.max(alpha, 0), 1);
  out.length = current.players.length * PLAYER_FRAME_STRIDE;
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
  return out;
}
