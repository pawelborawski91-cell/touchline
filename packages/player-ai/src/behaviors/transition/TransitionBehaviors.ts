import { FIELD_WIDTH } from '@touchline/shared';

import type { Behavior } from '../../core/Behavior';
import { clampToPitch, spaceScore } from '../../navigation/PositionTargeting';
import { clamp01, distance, towards } from '../../navigation/vector';
import { ballLine, lineX, ourCarrier, ownGoal, projected, sideOf, theirCarrier } from '../common';

/** Counter-attacking runs stop at this team line. */
const COUNTER_RUN_LIMIT = 0.88;

/** Right after losing the ball, the nearest one or two players win it back immediately. */
export const counterPress: Behavior = {
  id: 'counter_press',
  category: 'transition',
  states: ['transition_defense'],
  priority: 3,
  eligible: (ctx) =>
    (ctx.me.isPresser || ctx.me.isSupportPresser) &&
    theirCarrier(ctx) !== null &&
    ctx.me.distanceToBall <= ctx.config.counterPressRadius,
  evaluate(ctx) {
    const carrier = theirCarrier(ctx)!;
    const target = towards(projected(carrier, 0.3), ownGoal(ctx), 0.5);
    return {
      utility: ctx.me.isPresser ? 0.95 : 0.8,
      target: clampToPitch(target, 0.3),
      movementMode: 'sprint',
      focusPlayerId: carrier.id,
      tracking: true,
      exitSpeed: 1.5,
    };
  },
};

/** Everyone else races back into the defensive shape, flat out when caught upfield. */
export const recoverShape: Behavior = {
  id: 'recover_shape',
  category: 'transition',
  states: ['transition_defense'],
  priority: 2,
  eligible: (ctx) => !ctx.me.isPresser && !ctx.me.isSupportPresser,
  evaluate(ctx) {
    const d = ctx.me.distanceToAnchor;
    const caughtUpfield = ctx.me.line > ballLine(ctx);
    return {
      utility: 0.5 + 0.4 * clamp01(d / 25),
      target: ctx.me.anchor,
      movementMode: d > 15 && caughtUpfield ? 'sprint' : 'run',
      positional: true,
    };
  },
};

/** After winning the ball, forwards sprint into the space ahead of them. */
export const counterRun: Behavior = {
  id: 'counter_run',
  category: 'transition',
  states: ['transition_attack'],
  priority: 2,
  eligible: (ctx) => !ctx.me.isCarrier && ctx.me.line < COUNTER_RUN_LIMIT - 0.03,
  evaluate(ctx) {
    const limitX = lineX(ctx, COUNTER_RUN_LIMIT);
    const aheadX = ctx.player.position.x + ctx.direction * 15;
    const x = ctx.direction === 1 ? Math.min(aheadX, limitX) : Math.max(aheadX, limitX);
    const laneY =
      ctx.me.anchor.y + (FIELD_WIDTH / 2 - ctx.me.anchor.y) * (ctx.role === 'ST' ? 0.3 : 0.1);
    const target = clampToPitch({ x, y: laneY });
    return {
      utility: 0.55 + 0.35 * spaceScore(target, ctx.grid, ctx.player.teamId),
      target,
      movementMode: 'sprint',
      positional: true,
      leashScale: null,
    };
  },
};

/** The carrier's nearest teammates move up alongside and ahead of him. */
export const supportForward: Behavior = {
  id: 'support_forward',
  category: 'transition',
  states: ['transition_attack'],
  priority: 2,
  eligible: (ctx) => ctx.me.isSupporter && ourCarrier(ctx) !== null,
  evaluate(ctx) {
    const carrier = ourCarrier(ctx)!;
    const towardsCentre = sideOf(carrier.position.y) === 1 ? -1 : 1;
    const side = sideOf(
      ctx.player.position.y - carrier.position.y + FIELD_WIDTH / 2,
      towardsCentre,
    );
    const target = clampToPitch({
      x: carrier.position.x + ctx.direction * 6,
      y: carrier.position.y + side * 8,
    });
    return {
      utility: 0.75,
      target,
      movementMode: distance(ctx.player.position, target) > 10 ? 'sprint' : 'run',
      focusPlayerId: carrier.id,
      positional: true,
      leashScale: 2,
    };
  },
};

export const TRANSITION_BEHAVIORS: readonly Behavior[] = [
  counterPress,
  recoverShape,
  counterRun,
  supportForward,
];
