import type { MovementMode, PlayerMovementAttributes } from '@touchline/shared';

import { staminaSpeedCeiling, type StaminaConfig, DEFAULT_STAMINA_CONFIG } from './Stamina';

export type { MovementMode } from '@touchline/shared';

/** Fraction of a player's max speed permitted in each mode. */
export const MOVEMENT_MODE_SPEED: Readonly<Record<MovementMode, number>> = Object.freeze({
  walk: 0.35,
  jog: 0.55,
  run: 0.8,
  sprint: 1,
});

/**
 * Top speed allowed for a command: the mode's share of max speed, lowered when stamina is very
 * low (an exhausted player cannot sprint flat out).
 */
export function getSpeedCap(
  attributes: PlayerMovementAttributes,
  mode: MovementMode,
  staminaCurrent: number,
  stamina: StaminaConfig = DEFAULT_STAMINA_CONFIG,
): number {
  const fraction = Math.min(
    MOVEMENT_MODE_SPEED[mode],
    staminaSpeedCeiling(staminaCurrent, stamina),
  );
  return attributes.maxSpeed * fraction;
}
