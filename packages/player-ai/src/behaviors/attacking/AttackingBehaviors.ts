import { FIELD_WIDTH, PENALTY_SPOT_DISTANCE, type Vector2 } from '@touchline/shared';

import type { Behavior } from '../../core/Behavior';
import {
  bestPoint,
  candidatesAround,
  clampToPitch,
  laneScore,
  spaceScore,
} from '../../navigation/PositionTargeting';
import { clamp01, distance, lerpPoint } from '../../navigation/vector';
import {
  ballLateral,
  ballLine,
  IN_POSSESSION,
  lineOfPoint,
  lineX,
  opponentGoal,
  ourCarrier,
  sideOf,
} from '../common';

/** Furthest forward attackers push their runs and depth, as team line. */
const RUN_LIMIT_LINE = 0.9;
/** Lateral position wide players hold in possession. */
const WIDE_LATERAL = 0.88;

/** Nearest teammates come short to the carrier, to the side and slightly behind, in a clear lane. */
export const supportCarrier: Behavior = {
  id: 'support_carrier',
  category: 'attacking',
  states: ['attacking'],
  priority: 2,
  eligible: (ctx) => ctx.me.isSupporter && ourCarrier(ctx) !== null,
  evaluate(ctx) {
    const carrier = ourCarrier(ctx)!;
    const towardsCentre = sideOf(carrier.position.y) === 1 ? -1 : 1;
    const side = sideOf(
      ctx.player.position.y - carrier.position.y + FIELD_WIDTH / 2,
      towardsCentre,
    );
    const candidates: Vector2[] = [-6, 0, 4].map((ahead) =>
      clampToPitch({
        x: carrier.position.x + ctx.direction * ahead,
        y: carrier.position.y + side * 9,
      }),
    );
    const best = bestPoint(
      candidates,
      (p) =>
        0.6 * laneScore(carrier.position, p, ctx.grid, ctx.player.teamId) +
        0.4 * spaceScore(p, ctx.grid, ctx.player.teamId),
    );
    return {
      utility: 0.55 + 0.25 * best.score,
      target: best.point,
      movementMode: 'run',
      focusPlayerId: carrier.id,
      positional: true,
      leashScale: 1.6,
    };
  },
};

/** Drift into the most open spot near the formation slot. */
export const findSpace: Behavior = {
  id: 'find_space',
  category: 'attacking',
  states: IN_POSSESSION,
  priority: 1,
  eligible: (ctx) => !ctx.me.isCarrier,
  evaluate(ctx) {
    const best = bestPoint(candidatesAround(ctx.me.anchor, 6), (p) =>
      spaceScore(p, ctx.grid, ctx.player.teamId),
    );
    return {
      utility: 0.3 + 0.35 * best.score,
      target: best.point,
      movementMode: 'jog',
      positional: true,
    };
  },
};

/** Show for a pass: a spot near the slot with a clear lane from the carrier and some space. */
export const offerPass: Behavior = {
  id: 'offer_pass',
  category: 'attacking',
  states: IN_POSSESSION,
  priority: 2,
  eligible: (ctx) => {
    const carrier = ourCarrier(ctx);
    return carrier !== null && distance(ctx.player.position, carrier.position) <= 40;
  },
  evaluate(ctx) {
    const carrier = ourCarrier(ctx)!;
    const centre = lerpPoint(ctx.me.anchor, carrier.position, 0.15);
    const best = bestPoint(candidatesAround(centre, 5), (p) => {
      const d = distance(p, carrier.position);
      const tooClose = d < 8 ? (8 - d) / 8 : 0;
      return (
        0.6 * laneScore(carrier.position, p, ctx.grid, ctx.player.teamId) +
        0.4 * spaceScore(p, ctx.grid, ctx.player.teamId) -
        0.5 * tooClose
      );
    });
    return {
      utility: 0.3 + 0.5 * clamp01(best.score),
      target: best.point,
      movementMode: 'run',
      focusPlayerId: carrier.id,
      positional: true,
    };
  },
};

/** Run in behind the opponent's last line when there is space there and the carrier is free. */
export const forwardRun: Behavior = {
  id: 'forward_run',
  category: 'attacking',
  states: ['attacking'],
  priority: 2,
  eligible: (ctx) => {
    if (!ourCarrier(ctx) || ctx.me.line < 0.45) return false;
    const lastLine = lineOfPoint(ctx, { x: ctx.team.opponentLastLineX, y: 0 });
    return ctx.me.line < lastLine + 0.01 && lastLine < RUN_LIMIT_LINE - 0.04;
  },
  evaluate(ctx) {
    const carrier = ourCarrier(ctx)!;
    const lastLine = lineOfPoint(ctx, { x: ctx.team.opponentLastLineX, y: 0 });
    const space = clamp01((RUN_LIMIT_LINE - lastLine) / 0.25);
    const pressed = ctx.grid.nearest(carrier.position, 4, (p) => p.teamId !== ctx.player.teamId);
    const runX = ctx.team.opponentLastLineX + ctx.direction * 7;
    const limitX = lineX(ctx, RUN_LIMIT_LINE);
    const x = ctx.direction === 1 ? Math.min(runX, limitX) : Math.max(runX, limitX);
    const y = ctx.me.anchor.y + (FIELD_WIDTH / 2 - ctx.me.anchor.y) * 0.2;
    return {
      utility: 0.7 * space * (pressed ? 0.5 : 1),
      target: clampToPitch({ x, y }),
      movementMode: 'sprint',
      positional: true,
      leashScale: null,
    };
  },
};

/** Wide players stretch the pitch, wider still when the ball is on the other side. */
export const holdWidth: Behavior = {
  id: 'hold_width',
  category: 'attacking',
  states: IN_POSSESSION,
  priority: 1,
  eligible: (ctx) => !ctx.me.isCarrier && Math.abs(ctx.me.anchor.y - FIELD_WIDTH / 2) > 8,
  evaluate(ctx) {
    const side = sideOf(ctx.me.anchor.y);
    const ballSide = sideOf(ctx.ballInfo.position.y) === side;
    return {
      utility: 0.5 + (ballSide ? 0 : 0.15),
      target: clampToPitch({
        x: ctx.me.anchor.x,
        y: FIELD_WIDTH / 2 + side * WIDE_LATERAL * (FIELD_WIDTH / 2),
      }),
      movementMode: 'run',
      positional: true,
    };
  },
};

/** Forwards stay level with the opponent's last line, pinning it back. */
export const holdDepth: Behavior = {
  id: 'hold_depth',
  category: 'attacking',
  states: IN_POSSESSION,
  priority: 1,
  eligible: (ctx) => !ctx.me.isCarrier,
  evaluate(ctx) {
    const onside = ctx.team.opponentLastLineX - ctx.direction * 1.5;
    const limitX = lineX(ctx, RUN_LIMIT_LINE - 0.02);
    const anchorX = ctx.me.anchor.x;
    const x =
      ctx.direction === 1
        ? Math.min(Math.max(anchorX, onside), limitX)
        : Math.max(Math.min(anchorX, onside), limitX);
    return {
      utility: 0.5,
      target: clampToPitch({ x, y: ctx.me.anchor.y }),
      movementMode: 'run',
      positional: true,
      leashScale: 1.5,
    };
  },
};

/** With the ball in the final third, attack the box: striker centrally, far winger at the far post. */
export const attackBox: Behavior = {
  id: 'attack_box',
  category: 'attacking',
  states: ['attacking'],
  priority: 2,
  eligible: (ctx) => !ctx.me.isCarrier && ballLine(ctx) >= 0.66,
  evaluate(ctx) {
    const goal = opponentGoal(ctx);
    const side = sideOf(ctx.me.anchor.y);
    const ballSide = sideOf(ctx.ballInfo.position.y);
    let target: Vector2;
    let factor = 1;
    if (ctx.role === 'ST') {
      target = { x: goal.x - ctx.direction * PENALTY_SPOT_DISTANCE, y: goal.y - ballSide * 1.5 };
    } else if (ctx.role === 'WG') {
      target = { x: goal.x - ctx.direction * 6, y: goal.y + side * 5 };
      if (side === ballSide && Math.abs(ballLateral(ctx)) > 0.3) factor = 0.5;
    } else {
      target = { x: goal.x - ctx.direction * 18, y: goal.y + side * 6 };
    }
    return {
      utility: 0.85 * factor * clamp01((ballLine(ctx) - 0.62) / 0.15),
      target: clampToPitch(target),
      movementMode: 'run',
      positional: true,
      leashScale: null,
    };
  },
};

/** Rest defence: stay well behind the ball and tuck in while the team attacks. */
export const defensiveCover: Behavior = {
  id: 'defensive_cover',
  category: 'attacking',
  states: IN_POSSESSION,
  priority: 1,
  eligible: (ctx) => !ctx.me.isCarrier,
  evaluate(ctx) {
    const anchorLine = lineOfPoint(ctx, ctx.me.anchor);
    const line = Math.max(Math.min(anchorLine, ballLine(ctx) - 0.22), ctx.teamTactics.minLine);
    return {
      utility: 0.45 + 0.25 * clamp01((ballLine(ctx) - 0.4) / 0.3),
      target: clampToPitch({
        x: lineX(ctx, line),
        y: FIELD_WIDTH / 2 + (ctx.me.anchor.y - FIELD_WIDTH / 2) * 0.7,
      }),
      movementMode: 'run',
      positional: true,
    };
  },
};

export const ATTACKING_BEHAVIORS: readonly Behavior[] = [
  supportCarrier,
  findSpace,
  offerPass,
  forwardRun,
  holdWidth,
  holdDepth,
  attackBox,
  defensiveCover,
];
