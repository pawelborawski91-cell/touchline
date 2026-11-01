import type { RoleProfile } from './RoleProfile';

/**
 * Striker: occupies the advanced line, runs in behind, is a target in the box and presses the
 * opposing defenders. Rarely recovers deep.
 */
export const STRIKER_PROFILE: RoleProfile = {
  role: 'ST',
  weights: {
    carry_ball: 1,
    chase_loose_ball: 1,
    hold_position: 0.6,
    offer_pass: 0.8,
    find_space: 0.9,
    forward_run: 1,
    hold_depth: 1,
    attack_box: 1,
    press_carrier: 1,
    intercept_lane: 0.7,
    recover_position: 0.4,
    hold_defensive_position: 0.6,
    counter_press: 0.9,
    recover_shape: 0.4,
    counter_run: 1,
    support_forward: 0.5,
  },
  pressRange: 30,
  leash: 18,
};
