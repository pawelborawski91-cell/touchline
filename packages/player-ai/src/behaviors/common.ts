import { FIELD_WIDTH, type PlayerState, type Vector2 } from '@touchline/shared';

import type { AIContext } from '../core/AIContext';
import type { TeamPlayState } from '../core/AIDecision';
import { clamp } from '../navigation/vector';
import {
  formationToPitch,
  lateralOf,
  lineOf,
  opponentGoalCentre,
  ownGoalCentre,
} from '../tactics/Formation';

export const IN_POSSESSION: readonly TeamPlayState[] = ['attacking', 'transition_attack'];
export const OUT_OF_POSSESSION: readonly TeamPlayState[] = ['defending', 'transition_defense'];
export const ALL_STATES: readonly TeamPlayState[] = [
  'attacking',
  'transition_attack',
  'neutral',
  'defending',
  'transition_defense',
];

export const ownGoal = (ctx: AIContext): Vector2 => ownGoalCentre(ctx.direction);
export const opponentGoal = (ctx: AIContext): Vector2 => opponentGoalCentre(ctx.direction);

/** Ball progress for the player's team, 0 (own goal) – 1 (opponent goal). */
export const ballLine = (ctx: AIContext): number =>
  clamp(lineOf(ctx.ballInfo.position.x, ctx.direction), 0, 1);

export const ballLateral = (ctx: AIContext): number =>
  clamp(lateralOf(ctx.ballInfo.position.y, ctx.direction), -1, 1);

export const lineX = (ctx: AIContext, line: number): number =>
  formationToPitch(clamp(line, 0, 1), 0, ctx.direction).x;

export const lineOfPoint = (ctx: AIContext, point: Vector2): number =>
  lineOf(point.x, ctx.direction);

/** Our ball carrier (never the player himself). */
export function ourCarrier(ctx: AIContext): PlayerState | null {
  return ctx.team.carrierId !== null && ctx.team.carrierId !== ctx.player.id ? ctx.carrier : null;
}

export function theirCarrier(ctx: AIContext): PlayerState | null {
  return ctx.carrier && ctx.carrier.teamId !== ctx.player.teamId ? ctx.carrier : null;
}

/** −1/+1 pitch-y side of `value` relative to the centre line of the pitch (0 → `fallback`). */
export function sideOf(y: number, fallback: 1 | -1 = 1): 1 | -1 {
  if (y > FIELD_WIDTH / 2 + 1e-6) return 1;
  if (y < FIELD_WIDTH / 2 - 1e-6) return -1;
  return fallback;
}

/** Where `subject` will be after `seconds` at its current velocity. */
export const projected = (subject: PlayerState, seconds: number): Vector2 => ({
  x: subject.position.x + subject.velocity.x * seconds,
  y: subject.position.y + subject.velocity.y * seconds,
});
