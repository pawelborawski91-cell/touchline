import { FIELD_WIDTH } from '@touchline/shared';

import type { Behavior } from '../../core/Behavior';
import { clampToPitch, goalSidePoint, paceForDistance } from '../../navigation/PositionTargeting';
import { clamp, clamp01, distance, lerpPoint, towards } from '../../navigation/vector';
import { lineOf } from '../../tactics/Formation';
import {
  ballLateral,
  ballLine,
  OUT_OF_POSSESSION,
  ownGoal,
  projected,
  theirCarrier,
} from '../common';

/** A marked opponent running at our goal faster than this is tracked, m/s. */
const RUNNER_SPEED = 3.5;
/** Within this distance of the ball the presser stops jockeying and tackles, m. */
const TACKLE_DISTANCE = 2.5;

/** The designated presser closes down the opposing carrier, arriving goal-side of the ball. */
export const pressCarrier: Behavior = {
  id: 'press_carrier',
  category: 'defending',
  states: OUT_OF_POSSESSION,
  priority: 3,
  eligible: (ctx) => ctx.me.isPresser && theirCarrier(ctx) !== null,
  evaluate(ctx) {
    const carrier = theirCarrier(ctx)!;
    const ball = ctx.ballInfo.position;
    // Close in goal-side, then go through the ball itself: a presser parked beside a shielding
    // carrier never out-scores him in the ball engine's contest.
    // While tackling he arrives faster than the carrier moves, or he would brake short of him.
    const tackling = distance(ctx.player.position, ball) < TACKLE_DISTANCE;
    const carrierSpeed = Math.hypot(carrier.velocity.x, carrier.velocity.y);
    const target = tackling
      ? { x: ball.x + ctx.ballInfo.velocity.x * 0.2, y: ball.y + ctx.ballInfo.velocity.y * 0.2 }
      : towards(projected(carrier, 0.3), ownGoal(ctx), 0.5);
    const d = distance(ctx.player.position, target);
    return {
      utility: 0.9,
      target: clampToPitch(target, 0.3),
      movementMode: d > 6 || tackling ? 'sprint' : 'run',
      focusPlayerId: carrier.id,
      tracking: true,
      exitSpeed: tackling ? carrierSpeed + 1.5 : 1.5,
    };
  },
};

/** Stay goal-side of the assigned opponent; tighter the closer he is to our goal. */
export const markOpponent: Behavior = {
  id: 'mark_opponent',
  category: 'defending',
  states: OUT_OF_POSSESSION,
  priority: 2,
  eligible: (ctx) => ctx.me.markTarget !== null,
  evaluate(ctx) {
    const mark = ctx.me.markTarget!;
    const danger = clamp01(1 - lineOf(mark.position.x, ctx.direction) / 0.6);
    const target = goalSidePoint(mark.position, ownGoal(ctx), 2.5 - danger);
    const d = distance(ctx.player.position, target);
    return {
      utility: 0.55 + 0.3 * danger,
      target: clampToPitch(target),
      movementMode: d > 12 ? 'sprint' : paceForDistance(d, 'run'),
      focusPlayerId: mark.id,
      tracking: true,
    };
  },
};

/** Centre-backs and midfielders close the central channel between the ball and our goal. */
export const protectCentre: Behavior = {
  id: 'protect_centre',
  category: 'defending',
  states: [...OUT_OF_POSSESSION, 'neutral'],
  priority: 1,
  eligible: (ctx) => !ctx.me.isCarrier,
  evaluate(ctx) {
    const goal = ownGoal(ctx);
    const anchor = ctx.me.anchor;
    const ball = ctx.ballInfo.position;
    const t =
      Math.abs(ball.x - goal.x) > 1e-6 ? clamp((anchor.x - goal.x) / (ball.x - goal.x), 0, 1) : 0;
    const onBallLine = goal.y + (ball.y - goal.y) * t;
    const tucked = FIELD_WIDTH / 2 + (anchor.y - FIELD_WIDTH / 2) * 0.6;
    return {
      utility: 0.45 + 0.25 * (1 - Math.abs(ballLateral(ctx))),
      target: clampToPitch({ x: anchor.x, y: tucked + (onBallLine - tucked) * 0.3 }),
      movementMode: 'run',
      positional: true,
    };
  },
};

/** Follow a marked opponent who is running at our goal, staying goal-side of his run. */
export const trackRunner: Behavior = {
  id: 'track_runner',
  category: 'defending',
  states: OUT_OF_POSSESSION,
  priority: 2,
  eligible: (ctx) => {
    const mark = ctx.me.markTarget;
    return mark !== null && -ctx.direction * mark.velocity.x >= RUNNER_SPEED;
  },
  evaluate(ctx) {
    const mark = ctx.me.markTarget!;
    const target = goalSidePoint(projected(mark, 0.8), ownGoal(ctx), 1);
    return {
      utility: 0.8,
      target: clampToPitch(target),
      movementMode: 'sprint',
      focusPlayerId: mark.id,
      tracking: true,
    };
  },
};

/** Players caught ahead of the ball and away from their slot get back into the shape. */
export const recoverPosition: Behavior = {
  id: 'recover_position',
  category: 'defending',
  states: [...OUT_OF_POSSESSION, 'neutral'],
  priority: 2,
  eligible: (ctx) => ctx.me.distanceToAnchor > 6 && ctx.me.line > ballLine(ctx),
  evaluate(ctx) {
    const d = ctx.me.distanceToAnchor;
    return {
      utility: 0.45 + 0.45 * clamp01((d - 6) / 25),
      target: ctx.me.anchor,
      movementMode: d > 20 ? 'sprint' : 'run',
      positional: true,
    };
  },
};

/** Defenders keep one flat line at the shape's defensive line. */
export const holdLine: Behavior = {
  id: 'hold_line',
  category: 'defending',
  states: [...OUT_OF_POSSESSION, 'neutral'],
  priority: 1,
  eligible: (ctx) => !ctx.me.isCarrier,
  evaluate: (ctx) => ({
    utility: 0.6,
    target: clampToPitch({ x: ctx.team.shape.defensiveLineX, y: ctx.me.anchor.y }),
    movementMode: 'run',
    positional: true,
  }),
};

/** Drop in behind the teammate who is pressing, in case he is beaten. */
export const coverTeammate: Behavior = {
  id: 'cover_teammate',
  category: 'defending',
  states: OUT_OF_POSSESSION,
  priority: 2,
  eligible: (ctx) => ctx.me.isCover && ctx.team.presserId !== null,
  evaluate(ctx) {
    const presser = ctx.teammates.find((p) => p.id === ctx.team.presserId);
    if (!presser) return null;
    const target = towards(presser.position, ownGoal(ctx), 7);
    return {
      utility: 0.7,
      target: clampToPitch(target),
      movementMode: paceForDistance(distance(ctx.player.position, target), 'run'),
      focusPlayerId: presser.id,
      tracking: true,
    };
  },
};

/** Step into the lane between the carrier and the nearest opponent who could receive. */
export const interceptLane: Behavior = {
  id: 'intercept_lane',
  category: 'defending',
  states: OUT_OF_POSSESSION,
  priority: 1,
  eligible: (ctx) => theirCarrier(ctx) !== null && !ctx.me.isPresser,
  evaluate(ctx) {
    const carrier = theirCarrier(ctx)!;
    const receiver = ctx.grid.nearest(
      ctx.player.position,
      15,
      (p) => p.teamId !== ctx.player.teamId && p.id !== carrier.id && p.role !== 'GK',
    );
    if (!receiver) return null;
    const lanePoint = lerpPoint(carrier.position, receiver.player.position, 0.6);
    const d = distance(ctx.player.position, lanePoint);
    return {
      utility: 0.6 * clamp01(1 - d / 15),
      target: clampToPitch(lanePoint),
      movementMode: paceForDistance(d, 'run'),
      focusPlayerId: receiver.player.id,
      positional: true,
    };
  },
};

/** Default out of possession: stand in the (compact) defensive slot. */
export const holdDefensivePosition: Behavior = {
  id: 'hold_defensive_position',
  category: 'defending',
  states: OUT_OF_POSSESSION,
  priority: 1,
  eligible: () => true,
  evaluate: (ctx) => ({
    utility: 0.42,
    target: ctx.me.anchor,
    movementMode: 'run',
    positional: true,
  }),
};

export const DEFENDING_BEHAVIORS: readonly Behavior[] = [
  pressCarrier,
  markOpponent,
  protectCentre,
  trackRunner,
  recoverPosition,
  holdLine,
  coverTeammate,
  interceptLane,
  holdDefensivePosition,
];
