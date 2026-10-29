/**
 * Layout of the per-frame player buffer the engine writes and the renderer reads: for player `i`
 * (snapshot order) the values at `i * PLAYER_FRAME_STRIDE` are
 * `[x, y, facing, waypointIndex]`. `waypointIndex` is the path-follower's current target in the
 * player's active or paused command, or -1 when the player has none.
 */
export const PLAYER_FRAME_STRIDE = 4;
