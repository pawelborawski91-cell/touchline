import type { RoleProfile } from './RoleProfile';

/**
 * Defensive midfielder: screens the space in front of the defence, offers the safe pass, covers
 * forward-moving teammates and cuts central passing lanes. No box runs.
 */
export const DEFENSIVE_MIDFIELDER_PROFILE: RoleProfile = {
  role: 'DM',
  weights: {
    carry_ball: 1,
    chase_loose_ball: 0.9,
    hold_position: 0.9,
    support_carrier: 0.9,
    offer_pass: 1,
    find_space: 0.5,
    defensive_cover: 0.95,
    press_carrier: 0.85,
    mark_opponent: 0.75,
    protect_centre: 1,
    track_runner: 0.8,
    recover_position: 0.9,
    cover_teammate: 1,
    intercept_lane: 1,
    hold_defensive_position: 0.9,
    counter_press: 0.9,
    recover_shape: 0.9,
    support_forward: 0.8,
  },
  pressRange: 25,
  leash: 12,
};

/**
 * Central midfielder: supports the carrier, offers passes, keeps the central structure, runs
 * forward when there is space and recovers when the ball is lost.
 */
export const CENTRAL_MIDFIELDER_PROFILE: RoleProfile = {
  role: 'CM',
  weights: {
    carry_ball: 1,
    chase_loose_ball: 1,
    hold_position: 0.8,
    support_carrier: 1,
    offer_pass: 1,
    find_space: 0.85,
    forward_run: 0.6,
    attack_box: 0.6,
    defensive_cover: 0.4,
    press_carrier: 0.9,
    mark_opponent: 0.8,
    protect_centre: 0.7,
    track_runner: 0.8,
    recover_position: 0.9,
    intercept_lane: 0.9,
    hold_defensive_position: 0.8,
    counter_press: 1,
    recover_shape: 0.85,
    counter_run: 0.55,
    support_forward: 1,
  },
  pressRange: 28,
  leash: 16,
};

/** Attacking midfielder (the 4-2-3-1 #10): finds pockets of space and arrives in the box. */
export const ATTACKING_MIDFIELDER_PROFILE: RoleProfile = {
  role: 'AM',
  weights: {
    carry_ball: 1,
    chase_loose_ball: 1,
    hold_position: 0.75,
    support_carrier: 0.9,
    offer_pass: 1,
    find_space: 1,
    forward_run: 0.8,
    attack_box: 0.8,
    press_carrier: 0.9,
    mark_opponent: 0.6,
    protect_centre: 0.4,
    recover_position: 0.7,
    intercept_lane: 0.8,
    hold_defensive_position: 0.75,
    counter_press: 1,
    recover_shape: 0.7,
    counter_run: 0.8,
    support_forward: 0.9,
  },
  pressRange: 28,
  leash: 18,
};
