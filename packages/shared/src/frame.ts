/**
 * Layout of the per-frame player buffer the engine writes and the renderer reads: for player `i`
 * (snapshot order) the values at `i * PLAYER_FRAME_STRIDE` are
 * `[x, y, facing, waypointIndex]`. `waypointIndex` is the path-follower's current target in the
 * player's active or paused command, or -1 when the player has none.
 */
export const PLAYER_FRAME_STRIDE = 4;

/**
 * The ball follows the players in the same buffer: at `ballFrameOffset(playerCount)` the values
 * are `[x, y, z, vx, vy, vz]` (centre position in metres, velocity in m/s).
 */
export const BALL_FRAME_SIZE = 6;

export function ballFrameOffset(playerCount: number): number {
  'worklet';
  return playerCount * PLAYER_FRAME_STRIDE;
}
