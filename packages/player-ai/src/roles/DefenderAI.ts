import type { RoleProfile } from './RoleProfile';

/**
 * Centre-back: holds the line, protects the centre and tracks forwards; covers the fullbacks;
 * no forward runs, width or box runs.
 */
export const CENTRE_BACK_PROFILE: RoleProfile = {
  role: 'CB',
  weights: {
    carry_ball: 1,
    chase_loose_ball: 0.85,
    hold_position: 0.9,
    support_carrier: 0.4,
    offer_pass: 0.55,
    defensive_cover: 1,
    press_carrier: 0.7,
    mark_opponent: 0.95,
    protect_centre: 1,
    track_runner: 0.95,
    recover_position: 1,
    hold_line: 1,
    cover_teammate: 1,
    hold_defensive_position: 0.9,
    counter_press: 0.55,
    recover_shape: 1,
    support_forward: 0.3,
  },
  pressRange: 18,
  leash: 10,
};

/**
 * Fullback: defends first, supports and overlaps on the flank in possession, provides width and
 * recovers quickly after a turnover.
 */
export const FULLBACK_PROFILE: RoleProfile = {
  role: 'FB',
  weights: {
    carry_ball: 1,
    chase_loose_ball: 0.9,
    hold_position: 0.85,
    support_carrier: 0.8,
    offer_pass: 0.7,
    find_space: 0.5,
    forward_run: 0.55,
    hold_width: 0.9,
    defensive_cover: 0.6,
    press_carrier: 0.8,
    mark_opponent: 0.9,
    track_runner: 1,
    recover_position: 1,
    hold_line: 0.9,
    cover_teammate: 0.8,
    hold_defensive_position: 0.85,
    counter_press: 0.7,
    recover_shape: 1,
    support_forward: 0.7,
  },
  pressRange: 22,
  leash: 18,
};
