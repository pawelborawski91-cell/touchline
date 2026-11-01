import type { RoleProfile } from './RoleProfile';

/**
 * Winger: holds the width, runs in behind, attacks the far post and tracks the opposing fullback
 * when defending.
 */
export const WINGER_PROFILE: RoleProfile = {
  role: 'WG',
  weights: {
    carry_ball: 1,
    chase_loose_ball: 0.9,
    hold_position: 0.7,
    support_carrier: 0.6,
    offer_pass: 0.8,
    find_space: 0.8,
    forward_run: 0.9,
    hold_width: 1,
    hold_depth: 0.7,
    attack_box: 0.85,
    press_carrier: 0.75,
    mark_opponent: 0.7,
    track_runner: 0.85,
    recover_position: 0.75,
    intercept_lane: 0.6,
    hold_defensive_position: 0.7,
    counter_press: 0.8,
    recover_shape: 0.7,
    counter_run: 1,
    support_forward: 0.6,
  },
  pressRange: 26,
  leash: 18,
};
