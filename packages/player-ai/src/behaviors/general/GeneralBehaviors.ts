import { FIELD_WIDTH } from '@touchline/shared';

import type { Behavior } from '../../core/Behavior';
import { interceptPoint } from '../../perception/BallPerception';
import { clampToPitch, paceForDistance } from '../../navigation/PositionTargeting';
import { clamp, distance } from '../../navigation/vector';
import { goalkeeperTarget } from '../../roles/GoalkeeperAI';
import { ALL_STATES, lineOfPoint, lineX, sideOf } from '../common';

/** The carrier stops advancing here (edge of the opponent's box) and shields the ball. */
const CARRY_STOP_LINE = 0.83;
/** Carriers keep this far from the touchlines, m. */
const CARRY_TOUCHLINE_MARGIN = 8;
/** An opponent this close makes a shielding carrier keep the ball moving, m. */
const SHIELD_PRESS_DISTANCE = 3;

/**
 * Autonomous ball carrier: dribbles towards the opponent's goal through repeated touches (the
 * ball engine does the touching), veering away from the nearest opponent and the touchlines, and
 * shields at the edge of the box. Passing and shooting stay user decisions.
 */
export const carryBall: Behavior = {
  id: 'carry_ball',
  category: 'general',
  // Every state: a player who has just won the ball carries it while the turnover is confirmed.
  states: ALL_STATES,
  priority: 3,
  eligible: (ctx) => ctx.me.isCarrier,
  evaluate(ctx) {
    const { player, direction, me } = ctx;
    let dy = 0;
    if (me.nearestOpponent && me.nearestOpponentDistance < 8) {
      dy = sideOf(player.position.y - me.nearestOpponent.position.y + FIELD_WIDTH / 2) * 6;
    }
    const stopX = lineX(ctx, CARRY_STOP_LINE);
    const aheadX = player.position.x + direction * 10;
    const x = direction === 1 ? Math.min(aheadX, stopX) : Math.max(aheadX, stopX);
    const atStop = lineOfPoint(ctx, player.position) >= CARRY_STOP_LINE - 0.01;
    const pressed =
      me.nearestOpponent !== null && me.nearestOpponentDistance < SHIELD_PRESS_DISTANCE;
    const target = atStop
      ? pressed
        ? {
            // Standing still under pressure would lock the contest; dribble across the box edge
            // away from the presser instead.
            x: stopX - direction * 1.5,
            y: clamp(
              player.position.y +
                sideOf(player.position.y - me.nearestOpponent!.position.y + FIELD_WIDTH / 2) * 8,
              CARRY_TOUCHLINE_MARGIN,
              FIELD_WIDTH - CARRY_TOUCHLINE_MARGIN,
            ),
          }
        : { x: player.position.x, y: player.position.y }
      : {
          x,
          y: clamp(
            player.position.y + dy,
            CARRY_TOUCHLINE_MARGIN,
            FIELD_WIDTH - CARRY_TOUCHLINE_MARGIN,
          ),
        };
    return { utility: 1, target, movementMode: 'jog', tracking: true };
  },
};

/** The team's designated chaser runs onto a loose or travelling ball at its intercept point. */
export const chaseLooseBall: Behavior = {
  id: 'chase_loose_ball',
  category: 'general',
  states: ALL_STATES,
  priority: 3,
  eligible: (ctx) => ctx.me.isChaser && ctx.ballInfo.isFree && !ctx.ballInfo.isOutOfPlay,
  evaluate(ctx) {
    const { player, ballInfo } = ctx;
    const intercept = interceptPoint(ballInfo, player, player.movement.maxSpeed * 0.9);
    const d = distance(player.position, intercept.point);
    return {
      utility: 0.95,
      target: clampToPitch(intercept.point, 0.3),
      movementMode: d > 6 ? 'sprint' : 'run',
      tracking: true,
      exitSpeed: 1.5,
    };
  },
};

/** Goalkeeper: on the goal–ball line, deeper as the ball approaches, never outside the box. */
export const protectGoal: Behavior = {
  id: 'protect_goal',
  category: 'general',
  states: ALL_STATES,
  priority: 2,
  eligible: (ctx) => ctx.role === 'GK',
  evaluate(ctx) {
    const target = goalkeeperTarget(
      ctx.ballInfo.position,
      ctx.direction,
      ctx.team.shape.defensiveLineX,
      ctx.config.goalkeeper,
    );
    return {
      utility: 0.9,
      target,
      movementMode: paceForDistance(distance(ctx.player.position, target), 'run'),
      tracking: true,
    };
  },
};

/** Default positional behavior: stand in the formation slot. */
export const holdPosition: Behavior = {
  id: 'hold_position',
  category: 'general',
  states: ['attacking', 'transition_attack', 'neutral'],
  priority: 1,
  eligible: (ctx) => !ctx.me.isCarrier,
  evaluate: (ctx) => ({
    utility: 0.4,
    target: ctx.me.anchor,
    movementMode: 'run',
    positional: true,
  }),
};

export const GENERAL_BEHAVIORS: readonly Behavior[] = [
  carryBall,
  chaseLooseBall,
  protectGoal,
  holdPosition,
];
