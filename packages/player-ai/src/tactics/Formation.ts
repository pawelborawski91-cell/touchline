import { FIELD_LENGTH, FIELD_WIDTH, type Vector2 } from '@touchline/shared';

import type { PlayerRole } from '../core/AIDecision';

/**
 * One position of a formation, in normalised team coordinates:
 * - `line`: 0 at the team's own goal line, 1 at the opponent's.
 * - `horizontalPosition`: −1 at the team's left touchline, +1 at its right (facing the
 *   opponent's goal), 0 in the centre.
 * `slot` is the lineup slot (`MatchPlayer.role`, e.g. `RCB`) that fills the position.
 */
export interface FormationPosition {
  slot: string;
  role: PlayerRole;
  line: number;
  horizontalPosition: number;
}

export interface FormationDefinition {
  id: string;
  name: string;
  positions: FormationPosition[];
}

export type FormationId = '4-3-3' | '4-4-2' | '4-2-3-1';

/** Medium-block reference shape; `TeamShape` stretches, compresses and shifts it per play state. */
export const FORMATION_433: FormationDefinition = {
  id: '4-3-3',
  name: '4-3-3',
  positions: [
    { slot: 'GK', role: 'GK', line: 0.04, horizontalPosition: 0 },
    { slot: 'RB', role: 'FB', line: 0.2, horizontalPosition: 0.72 },
    { slot: 'RCB', role: 'CB', line: 0.16, horizontalPosition: 0.25 },
    { slot: 'LCB', role: 'CB', line: 0.16, horizontalPosition: -0.25 },
    { slot: 'LB', role: 'FB', line: 0.2, horizontalPosition: -0.72 },
    { slot: 'CM', role: 'DM', line: 0.3, horizontalPosition: 0 },
    { slot: 'RCM', role: 'CM', line: 0.4, horizontalPosition: 0.35 },
    { slot: 'LCM', role: 'CM', line: 0.4, horizontalPosition: -0.35 },
    { slot: 'RW', role: 'WG', line: 0.58, horizontalPosition: 0.8 },
    { slot: 'ST', role: 'ST', line: 0.64, horizontalPosition: 0 },
    { slot: 'LW', role: 'WG', line: 0.58, horizontalPosition: -0.8 },
  ],
};

/** Flat midfield four: the wingers drop into wide midfield and #10 joins #9 up front. */
export const FORMATION_442: FormationDefinition = {
  id: '4-4-2',
  name: '4-4-2',
  positions: [
    { slot: 'GK', role: 'GK', line: 0.04, horizontalPosition: 0 },
    { slot: 'RB', role: 'FB', line: 0.2, horizontalPosition: 0.72 },
    { slot: 'RCB', role: 'CB', line: 0.16, horizontalPosition: 0.25 },
    { slot: 'LCB', role: 'CB', line: 0.16, horizontalPosition: -0.25 },
    { slot: 'LB', role: 'FB', line: 0.2, horizontalPosition: -0.72 },
    { slot: 'RCM', role: 'CM', line: 0.36, horizontalPosition: 0.2 },
    { slot: 'CM', role: 'CM', line: 0.36, horizontalPosition: -0.2 },
    { slot: 'RW', role: 'WG', line: 0.42, horizontalPosition: 0.78 },
    { slot: 'LW', role: 'WG', line: 0.42, horizontalPosition: -0.78 },
    { slot: 'ST', role: 'ST', line: 0.62, horizontalPosition: 0.15 },
    { slot: 'LCM', role: 'ST', line: 0.62, horizontalPosition: -0.15 },
  ],
};

/** Double pivot behind a #10, wingers and a lone striker. */
export const FORMATION_4231: FormationDefinition = {
  id: '4-2-3-1',
  name: '4-2-3-1',
  positions: [
    { slot: 'GK', role: 'GK', line: 0.04, horizontalPosition: 0 },
    { slot: 'RB', role: 'FB', line: 0.2, horizontalPosition: 0.72 },
    { slot: 'RCB', role: 'CB', line: 0.16, horizontalPosition: 0.25 },
    { slot: 'LCB', role: 'CB', line: 0.16, horizontalPosition: -0.25 },
    { slot: 'LB', role: 'FB', line: 0.2, horizontalPosition: -0.72 },
    { slot: 'RCM', role: 'DM', line: 0.3, horizontalPosition: 0.18 },
    { slot: 'CM', role: 'DM', line: 0.3, horizontalPosition: -0.18 },
    { slot: 'LCM', role: 'AM', line: 0.5, horizontalPosition: 0 },
    { slot: 'RW', role: 'WG', line: 0.55, horizontalPosition: 0.75 },
    { slot: 'LW', role: 'WG', line: 0.55, horizontalPosition: -0.75 },
    { slot: 'ST', role: 'ST', line: 0.66, horizontalPosition: 0 },
  ],
};

export const FORMATIONS: Readonly<Record<FormationId, FormationDefinition>> = {
  '4-3-3': FORMATION_433,
  '4-4-2': FORMATION_442,
  '4-2-3-1': FORMATION_4231,
};

export const DEFAULT_FORMATION_ID: FormationId = '4-3-3';

/** +1 for a team attacking towards x = FIELD_LENGTH, −1 for one attacking towards x = 0. */
export type AttackDirection = 1 | -1;

/** Normalised team coordinates → pitch metres. Facing +x, a team's right is +y. */
export function formationToPitch(
  line: number,
  horizontalPosition: number,
  direction: AttackDirection,
): Vector2 {
  return {
    x: direction === 1 ? line * FIELD_LENGTH : (1 - line) * FIELD_LENGTH,
    y: FIELD_WIDTH / 2 + horizontalPosition * (FIELD_WIDTH / 2) * direction,
  };
}

/** Pitch metres → normalised `line` (0 own goal, 1 opponent goal). */
export function lineOf(x: number, direction: AttackDirection): number {
  return direction === 1 ? x / FIELD_LENGTH : 1 - x / FIELD_LENGTH;
}

/** Pitch metres → normalised horizontal position (−1 team's left, +1 team's right). */
export function lateralOf(y: number, direction: AttackDirection): number {
  return ((y - FIELD_WIDTH / 2) / (FIELD_WIDTH / 2)) * direction;
}

export function ownGoalCentre(direction: AttackDirection): Vector2 {
  return { x: direction === 1 ? 0 : FIELD_LENGTH, y: FIELD_WIDTH / 2 };
}

export function opponentGoalCentre(direction: AttackDirection): Vector2 {
  return { x: direction === 1 ? FIELD_LENGTH : 0, y: FIELD_WIDTH / 2 };
}

/** Formation position for a lineup slot; falls back to the slot at the same index. */
export function positionForSlot(
  formation: FormationDefinition,
  slot: string,
  fallbackIndex: number,
): FormationPosition | null {
  return (
    formation.positions.find((position) => position.slot === slot) ??
    formation.positions[fallbackIndex] ??
    null
  );
}
