import {
  createBallState,
  type BallState,
  type KickRequest,
  type PlayerState,
} from '@touchline/shared';

import { DEFAULT_BALL_CONFIG, secondsToTicks, type BallConfig } from './BallConfig';
import { applyDribbleTouch, applyKick, type KickResult } from './BallController';
import {
  deflectOffPlayer,
  findPlayerContacts,
  placeAtContact,
  stopAtBody,
  type PlayerContact,
} from './BallCollision';
import { integrateBall, isOutOfBounds } from './BallPhysics';
import {
  createBallSimulationState,
  toBody,
  withBody,
  type BallBody,
  type BallEvent,
  type BallSimulationState,
  type PossessionSnapshot,
} from './BallState';
import {
  canControl,
  contestScore,
  cushionBall,
  getPossessionSnapshot,
  possessionStateFor,
  strongestContender,
  type Contender,
} from './PossessionManager';

export interface BallStepResult {
  state: BallSimulationState;
  events: BallEvent[];
}

type ContactAction = 'control' | 'deflect' | 'dribble';

const contactScratch: PlayerContact[] = [];
const ACTION_ORDER: Record<ContactAction, number> = { dribble: 0, control: 1, deflect: 2 };

function previousOf(
  player: PlayerState,
  players: readonly PlayerState[],
  previous: readonly PlayerState[],
): PlayerState | undefined {
  const index = players.indexOf(player);
  const before = previous[index];
  return before?.id === player.id ? before : undefined;
}

function horizontalDistance(body: BallBody, player: PlayerState): number {
  return Math.hypot(body.px - player.position.x, body.py - player.position.y);
}

/**
 * Advances the ball by one fixed step against the players' movement over the same step.
 * `previous` and `players` are the players at the start and end of the step, in the same order.
 * Pure and deterministic: players are visited in array order and every tie is broken by time,
 * then action, then array order (or player id for contests).
 *
 * Order within the step:
 * 1. Dribble: the controller's routine touch, every `touchInterval`, if the ball is within reach.
 * 2. Free motion: flight (gravity, drag, Magnus, bounces) or ground (skid, rolling resistance).
 * 3. Contacts: swept tests against every nearby player; the earliest contact is resolved —
 *    the controller touches it on, a player who can control it takes control (first touch),
 *    anyone else deflects it. The rest of that step's motion is dropped.
 * 4. Control is lost when the ball runs too far from the controller or flies over them.
 * 5. Contests: opponents within `contestRadius` challenge; the strongest contender within reach
 *    takes control.
 * 6. Out of play once the ball has wholly crossed a boundary line.
 */
export function stepBall(
  state: BallSimulationState,
  previous: readonly PlayerState[],
  players: readonly PlayerState[],
  config: BallConfig,
  fixedDeltaTime: number,
): BallStepResult {
  const events: BallEvent[] = [];
  const { ball, tick } = state;
  const body = toBody(ball);

  if (ball.isOutOfPlay) {
    integrateBall(body, config, fixedDeltaTime);
    return { state: { ...state, tick: tick + 1, ball: withBody(ball, body) }, events };
  }

  const touchTicks = secondsToTicks(config.touchInterval, fixedDeltaTime);
  let { nextTouchTick, lastTouchTick } = state;
  let lastTouchPlayerId = ball.lastTouchPlayerId;
  let lastTouchTeamId = ball.lastTouchTeamId;
  const releasedPlayerId =
    state.releasedPlayerId !== null && tick < state.releaseUntilTick
      ? state.releasedPlayerId
      : null;
  let controller = ball.controllerPlayerId
    ? players.find((p) => p.id === ball.controllerPlayerId)
    : undefined;

  const touch = (player: PlayerState, kind: 'deflection' | 'control' | 'dribble') => {
    lastTouchPlayerId = player.id;
    lastTouchTeamId = player.teamId;
    lastTouchTick = tick;
    events.push({ type: 'touch', tick, playerId: player.id, teamId: player.teamId, kind });
  };
  const gainControl = (player: PlayerState) => {
    controller = player;
    events.push({ type: 'control_gained', tick, playerId: player.id, teamId: player.teamId });
  };

  // 1. Routine dribble touch.
  if (
    controller &&
    tick >= nextTouchTick &&
    horizontalDistance(body, controller) <= config.controlReach &&
    body.pz - body.radius <= config.controlHeight
  ) {
    const touched = applyDribbleTouch(
      body,
      controller,
      config,
      previousOf(controller, players, previous),
      fixedDeltaTime,
    );
    if (touched) touch(controller, 'dribble');
    nextTouchTick = tick + touchTicks;
  }

  // 2. Free motion.
  const start: BallBody = { ...body };
  const bounce = integrateBall(body, config, fixedDeltaTime);
  if (bounce > 0) events.push({ type: 'bounce', tick, impactSpeed: bounce });
  const end: BallBody = { ...body };

  // 3. Earliest player contact.
  let chosen: { contact: PlayerContact; action: ContactAction; time: number } | null = null;
  for (const contact of findPlayerContacts(start, end, previous, players, config, contactScratch)) {
    const player = players[contact.playerIndex]!;
    let action: ContactAction | null = null;
    let time = -1;
    if (player.id === controller?.id) {
      if (contact.bodyTime >= 0 && contact.bodyHeight <= config.controlHeight) {
        action = 'dribble';
        time = contact.bodyTime;
      }
    } else if (
      !controller &&
      player.id !== releasedPlayerId &&
      canControl(end, contact.reachHeight, player, config)
    ) {
      action = 'control';
      time = contact.reachTime;
    } else if (contact.bodyTime >= 0 && contact.bodyHeight <= config.bodyContactHeight) {
      action = 'deflect';
      time = contact.bodyTime;
    }
    if (
      action &&
      (!chosen ||
        time < chosen.time ||
        (time === chosen.time && ACTION_ORDER[action] < ACTION_ORDER[chosen.action]))
    ) {
      chosen = { contact, action, time };
    }
  }
  if (chosen) {
    const player = players[chosen.contact.playerIndex]!;
    placeAtContact(body, start, end, chosen.contact, player, chosen.time);
    if (chosen.action === 'control') {
      cushionBall(body, player, config);
      touch(player, 'control');
      gainControl(player);
      nextTouchTick = tick + touchTicks;
    } else if (chosen.action === 'dribble') {
      applyDribbleTouch(
        body,
        player,
        config,
        previousOf(player, players, previous),
        fixedDeltaTime,
      );
      stopAtBody(body, player);
      touch(player, 'dribble');
      nextTouchTick = tick + touchTicks;
    } else {
      deflectOffPlayer(body, player, config);
      touch(player, 'deflection');
    }
  }

  const height = Math.max(0, body.pz - body.radius);

  // 4. Losing control.
  if (controller) {
    const distance = horizontalDistance(body, controller);
    const reason =
      distance > config.loseDistance
        ? 'loose'
        : height > config.controlHeight && distance > config.controlReach
          ? 'airborne'
          : null;
    if (reason) {
      events.push({ type: 'control_lost', tick, playerId: controller.id, reason });
      controller = undefined;
    }
  }

  // 5. Contests between opposing players around a low ball.
  const contenders: Contender[] = [];
  if (height <= config.controlHeight) {
    const radiusSq = config.contestRadius * config.contestRadius;
    for (const player of players) {
      if (player.id === releasedPlayerId) continue;
      const dx = body.px - player.position.x;
      const dy = body.py - player.position.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) continue;
      const distance = Math.sqrt(distSq);
      contenders.push({
        player,
        distance,
        score: contestScore(player, distance, body, player.id === controller?.id, config),
      });
    }
  }
  const contested =
    contenders.length >= 2 &&
    contenders.some((c) => c.player.teamId !== contenders[0]!.player.teamId);
  let contenderIds: readonly string[] = [];
  if (contested) {
    contenderIds = contenders.map((c) => c.player.id).sort();
    if (state.contenderIds.length === 0)
      events.push({ type: 'contest', tick, playerIds: contenderIds });
    const best = strongestContender(contenders)!;
    const stealsFromTeammate = controller !== undefined && best.player.teamId === controller.teamId;
    if (
      best.player.id !== controller?.id &&
      !stealsFromTeammate &&
      best.distance <= config.controlReach
    ) {
      if (controller) {
        events.push({ type: 'control_lost', tick, playerId: controller.id, reason: 'tackled' });
      }
      touch(best.player, 'control');
      gainControl(best.player);
      nextTouchTick = tick;
    }
  }

  // 6. Out of play.
  const isOutOfPlay = isOutOfBounds({ x: body.px, y: body.py }, body.radius, config);
  if (isOutOfPlay) {
    if (controller) {
      events.push({ type: 'control_lost', tick, playerId: controller.id, reason: 'out_of_play' });
      controller = undefined;
    }
    events.push({
      type: 'out_of_play',
      tick,
      position: { x: body.px, y: body.py },
      lastTouchTeamId,
    });
    contenderIds = [];
  }

  const controllerPlayerId = controller?.id ?? null;
  return {
    state: {
      ball: {
        ...withBody(ball, body),
        lastTouchPlayerId,
        lastTouchTeamId,
        controllerPlayerId,
        possessionState: possessionStateFor(
          controllerPlayerId,
          contested && !isOutOfPlay,
          isOutOfPlay,
        ),
        isOutOfPlay,
      },
      tick: tick + 1,
      nextTouchTick,
      lastTouchTick,
      releasedPlayerId,
      releaseUntilTick: releasedPlayerId ? state.releaseUntilTick : 0,
      contenderIds,
    },
    events,
  };
}

/**
 * Convenience wrapper holding one ball's state, for headless tools and tests. The match engine
 * uses the pure functions directly and stores the state in its own immutable simulation state.
 * `update` runs whole fixed steps from accumulated time, so results never depend on how the
 * time is split between calls.
 */
export class BallEngine {
  private state: BallSimulationState;
  private players: readonly PlayerState[] = [];
  private accumulator = 0;

  constructor(
    ball: BallState = createBallState(),
    readonly config: BallConfig = DEFAULT_BALL_CONFIG,
    readonly fixedDeltaTime = 0.05,
  ) {
    this.state = createBallSimulationState(ball);
  }

  getState(): BallState {
    return this.state.ball;
  }

  getSimulationState(): BallSimulationState {
    return this.state;
  }

  /** Feeds elapsed time with the players' current state; returns the events of the steps run. */
  update(players: readonly PlayerState[], deltaTime: number): BallEvent[] {
    const events: BallEvent[] = [];
    this.accumulator += deltaTime;
    const previous = this.players.length === players.length ? this.players : players;
    let first = true;
    while (this.accumulator >= this.fixedDeltaTime - 1e-9) {
      this.accumulator -= this.fixedDeltaTime;
      const result = stepBall(
        this.state,
        first ? previous : players,
        players,
        this.config,
        this.fixedDeltaTime,
      );
      first = false;
      this.state = result.state;
      events.push(...result.events);
    }
    this.players = players;
    return events;
  }

  kick(request: KickRequest, players: readonly PlayerState[] = this.players): KickResult {
    const outcome = applyKick(this.state, players, request, this.config, this.fixedDeltaTime);
    this.state = outcome.state;
    return outcome.result;
  }

  getPossession(players: readonly PlayerState[] = this.players): PossessionSnapshot {
    return getPossessionSnapshot(this.state, players);
  }
}
