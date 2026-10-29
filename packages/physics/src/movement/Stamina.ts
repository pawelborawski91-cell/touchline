import type { MovementMode, PlayerMovementAttributes } from '@touchline/shared';

import { clamp } from '../math/angles';

/** Simple stamina foundation: drain while moving, faster in quicker modes. No recovery yet. */
export interface StaminaConfig {
  /** Stamina (0–1 scale) drained per second at the mode's full pace, for average endurance. */
  drainPerSecond: Readonly<Record<MovementMode, number>>;
  /** Below this stamina the available top speed starts to drop. */
  lowThreshold: number;
  /** Fraction of max speed still available at zero stamina. */
  exhaustedSpeedFraction: number;
}

export const DEFAULT_STAMINA_CONFIG: Readonly<StaminaConfig> = Object.freeze({
  drainPerSecond: Object.freeze({ walk: 0.0004, jog: 0.0012, run: 0.003, sprint: 0.009 }),
  lowThreshold: 0.3,
  exhaustedSpeedFraction: 0.7,
});

/** Highest fraction of max speed the current stamina allows. */
export function staminaSpeedCeiling(
  staminaCurrent: number,
  config: StaminaConfig = DEFAULT_STAMINA_CONFIG,
): number {
  if (staminaCurrent >= config.lowThreshold) return 1;
  const t = clamp(staminaCurrent / config.lowThreshold, 0, 1);
  return config.exhaustedSpeedFraction + (1 - config.exhaustedSpeedFraction) * t;
}

/**
 * Stamina after one step. Drain scales with how hard the player is moving relative to the mode's
 * pace, and with endurance (attribute 1 drains 40 % slower than 0.5). Never below zero.
 */
export function drainStamina(
  staminaCurrent: number,
  attributes: PlayerMovementAttributes,
  mode: MovementMode,
  speed: number,
  speedCap: number,
  dt: number,
  config: StaminaConfig = DEFAULT_STAMINA_CONFIG,
): number {
  if (speed <= 0 || speedCap <= 0) return staminaCurrent;
  const effort = clamp(speed / speedCap, 0, 1);
  const endurance = 1.4 - 0.8 * clamp(attributes.stamina, 0, 1);
  return Math.max(0, staminaCurrent - config.drainPerSecond[mode] * effort * endurance * dt);
}
