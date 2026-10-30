import type { KickRequest, KickType, PlayerState, Vector3 } from '@touchline/shared';

import { secondsToTicks, type BallConfig, type KickPreset } from './BallConfig';
import { integrateBall, isAtRest } from './BallPhysics';
import {
  ballHeight,
  createBallSimulationState,
  setRollingSpin,
  toBody,
  withBody,
  type BallBody,
  type BallEvent,
  type BallSimulationState,
} from './BallState';

// ── Dribbling ───────────────────────────────────────────────────────────────────────────────

/** Largest velocity change one dribble touch by this player can give the ball, m/s. */
export function maxTouchDelta(player: PlayerState, config: BallConfig): number {
  return config.maxTouchDeltaBase + config.maxTouchDeltaPerSkill * player.technical.technique;
}

/** Acceleration magnitude a dribbler's motion is extrapolated with, m/s². */
const MAX_DRIBBLE_ACCELERATION = 8;
/** A touch needing a smaller velocity change than this is skipped (the ball is already on line). */
const MIN_TOUCH_DELTA = 0.05;

/**
 * One dribble touch: an impulse that sends the ball to where the player will be at the next
 * touch, `preferredControlDistance` ahead along their direction of travel. The player's motion is
 * extrapolated with their current acceleration (from `previous`, the player one step earlier),
 * stopping where they would come to a halt, so the ball is held back when they brake. The ball
 * then rolls freely (with friction) until the next touch, so it runs slightly ahead and the
 * player catches it up. The impulse is capped by technique: when a sharp turn or burst of
 * acceleration needs more, the ball does not follow fully and can run loose.
 * Returns false (and leaves the ball alone) when no touch is needed.
 */
export function applyDribbleTouch(
  body: BallBody,
  player: PlayerState,
  config: BallConfig,
  previous?: PlayerState,
  fixedDeltaTime = 0.05,
): boolean {
  const interval = config.touchInterval;
  const vx = player.velocity.x;
  const vy = player.velocity.y;
  let ax = previous ? (vx - previous.velocity.x) / fixedDeltaTime : 0;
  let ay = previous ? (vy - previous.velocity.y) / fixedDeltaTime : 0;
  const accel = Math.hypot(ax, ay);
  if (accel > MAX_DRIBBLE_ACCELERATION) {
    ax *= MAX_DRIBBLE_ACCELERATION / accel;
    ay *= MAX_DRIBBLE_ACCELERATION / accel;
  }
  const speed = Math.hypot(vx, vy);
  const along = speed > 1e-6 ? (ax * vx + ay * vy) / speed : 0;
  const horizon = along < 0 ? Math.min(interval, speed / -along) : interval;
  const pvx = vx + ax * horizon;
  const pvy = vy + ay * horizon;
  const endSpeed = Math.hypot(pvx, pvy);
  const dirX = endSpeed > 0.5 ? pvx / endSpeed : speed > 0.5 ? vx / speed : Math.cos(player.facing);
  const dirY = endSpeed > 0.5 ? pvy / endSpeed : speed > 0.5 ? vy / speed : Math.sin(player.facing);
  const lead = config.preferredControlDistance;
  const baseX = player.position.x + vx * horizon + 0.5 * ax * horizon * horizon;
  const baseY = player.position.y + vy * horizon + 0.5 * ay * horizon * horizon;
  let targetX = baseX + dirX * lead;
  let targetY = baseY + dirY * lead;
  const rx = body.px - player.position.x;
  const ry = body.py - player.position.y;
  const r = Math.hypot(rx, ry);
  if (r > 1e-6 && rx * (targetX - player.position.x) + ry * (targetY - player.position.y) < 0) {
    // The ball is behind the player: work it round to their side rather than through them.
    const side = rx * dirY - ry * dirX >= 0 ? 1 : -1;
    targetX = baseX + ((-ry * side) / r) * lead;
    targetY = baseY + ((rx * side) / r) * lead;
  }

  let wantX = (targetX - body.px) / interval;
  let wantY = (targetY - body.py) / interval;
  const want = Math.hypot(wantX, wantY);
  if (want > 1e-6) {
    // Launch a little faster than the average so grass friction brings it in on time.
    const decel = config.rollingResistance * config.gravity + config.groundFriction * want;
    const boost = 1 + (decel * interval) / (2 * want);
    wantX *= boost;
    wantY *= boost;
  }
  let dvx = wantX - body.vx;
  let dvy = wantY - body.vy;
  const dv = Math.hypot(dvx, dvy);
  if (dv < MIN_TOUCH_DELTA && body.vz === 0) return false;
  const cap = maxTouchDelta(player, config);
  if (dv > cap) {
    dvx *= cap / dv;
    dvy *= cap / dv;
  }
  body.vx += dvx;
  body.vy += dvy;
  body.vz = Math.min(body.vz, 0);
  setRollingSpin(body);
  body.wz = 0;
  return true;
}

// ── Kicking ─────────────────────────────────────────────────────────────────────────────────

export type KickFailureReason =
  | 'invalid_request'
  | 'unknown_player'
  | 'out_of_play'
  | 'too_far'
  | 'too_high'
  | 'controlled_by_other'
  | 'ball_too_fast';

export type KickResult =
  | { ok: true; velocity: Vector3; speed: number; launchAngle: number }
  | { ok: false; reason: KickFailureReason; message: string };

export interface KickLaunch {
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  launchAngle: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Launch velocity of a kick along a unit horizontal direction. */
export function launchVelocity(
  preset: KickPreset,
  dirX: number,
  dirY: number,
  power: number,
  lift: number,
): KickLaunch {
  const speed = preset.minSpeed + clamp01(power) * (preset.maxSpeed - preset.minSpeed);
  const launchAngle =
    preset.minLaunchAngle + clamp01(lift) * (preset.maxLaunchAngle - preset.minLaunchAngle);
  const horizontal = speed * Math.cos(launchAngle);
  return {
    vx: dirX * horizontal,
    vy: dirY * horizontal,
    vz: speed * Math.sin(launchAngle),
    speed,
    launchAngle,
  };
}

function setKickSpin(body: BallBody, preset: KickPreset, dirX: number, dirY: number): void {
  if (preset.spin === 'roll') {
    setRollingSpin(body);
  } else {
    // Axis across the direction of travel, (−dy, dx): positive is topspin.
    body.wx = -dirY * preset.spin;
    body.wy = dirX * preset.spin;
  }
  body.wz = 0;
}

type KickCheck =
  | { ok: true; player: PlayerState; dirX: number; dirY: number }
  | { ok: false; reason: KickFailureReason; message: string };

/**
 * Checks that the player has a fair chance to strike the ball: a well-formed request, the ball in
 * play, within reach and low enough, not under another player's control (a contested ball may be
 * kicked), and not flying past too fast to strike.
 */
export function validateKick(
  state: BallSimulationState,
  players: readonly PlayerState[],
  request: KickRequest,
  config: BallConfig,
): KickCheck {
  const fail = (reason: KickFailureReason, message: string): KickCheck => ({
    ok: false,
    reason,
    message: `Cannot kick for ${request.playerId}: ${message}.`,
  });
  const { ball } = state;
  const { direction, power, lift } = request;
  const length = Math.hypot(direction.x, direction.y);
  if (
    !Number.isFinite(length) ||
    length < 1e-9 ||
    !(power >= 0 && power <= 1) ||
    !(lift >= 0 && lift <= 1) ||
    !config.kickPresets[request.type]
  ) {
    return fail('invalid_request', 'direction must be non-zero and power and lift within 0–1');
  }
  const player = players.find((p) => p.id === request.playerId);
  if (!player) return fail('unknown_player', 'unknown player');
  if (ball.isOutOfPlay) return fail('out_of_play', 'the ball is out of play');
  const distance = Math.hypot(
    ball.position.x - player.position.x,
    ball.position.y - player.position.y,
  );
  if (distance > config.kickReach) {
    return fail(
      'too_far',
      `the ball is ${distance.toFixed(2)} m away (reach ${config.kickReach} m)`,
    );
  }
  if (ballHeight(ball) > config.kickMaxHeight) return fail('too_high', 'the ball is too high');
  if (
    ball.possessionState === 'controlled' &&
    ball.controllerPlayerId !== null &&
    ball.controllerPlayerId !== player.id
  ) {
    return fail('controlled_by_other', `${ball.controllerPlayerId} controls the ball`);
  }
  const relative = Math.hypot(
    ball.velocity.x - player.velocity.x,
    ball.velocity.y - player.velocity.y,
    ball.velocity.z,
  );
  if (relative > config.kickMaxRelativeSpeed) {
    return fail('ball_too_fast', 'the ball is moving too fast to strike');
  }
  return { ok: true, player, dirX: direction.x / length, dirY: direction.y / length };
}

export interface KickOutcome {
  state: BallSimulationState;
  result: KickResult;
  events: BallEvent[];
}

/**
 * Strikes the ball: an impulse that sets its velocity to the kick's launch velocity, with the
 * kick type's spin. The kicker becomes the last toucher, any control is released (the kicker
 * cannot re-control it for `kickReleaseTime`), and the ball flies on independently.
 * A rejected kick leaves the state unchanged.
 */
export function applyKick(
  state: BallSimulationState,
  players: readonly PlayerState[],
  request: KickRequest,
  config: BallConfig,
  fixedDeltaTime: number,
): KickOutcome {
  const check = validateKick(state, players, request, config);
  if (!check.ok) return { state, result: check, events: [] };
  const { player, dirX, dirY } = check;
  const preset = config.kickPresets[request.type];
  const launch = launchVelocity(preset, dirX, dirY, request.power, request.lift);

  const body = toBody(state.ball);
  body.vx = launch.vx;
  body.vy = launch.vy;
  body.vz = launch.vz;
  if (launch.vz > 0) body.pz = Math.max(body.pz, body.radius + 1e-6);
  setKickSpin(body, preset, dirX, dirY);

  const events: BallEvent[] = [];
  const previousController = state.ball.controllerPlayerId;
  if (previousController) {
    events.push({
      type: 'control_lost',
      tick: state.tick,
      playerId: previousController,
      reason: 'kicked',
    });
  }
  events.push({
    type: 'kick',
    tick: state.tick,
    playerId: player.id,
    teamId: player.teamId,
    kickType: request.type,
    speed: launch.speed,
  });
  return {
    state: {
      ...state,
      ball: {
        ...withBody(state.ball, body),
        lastTouchPlayerId: player.id,
        lastTouchTeamId: player.teamId,
        controllerPlayerId: null,
        possessionState: 'free',
      },
      lastTouchTick: state.tick,
      releasedPlayerId: player.id,
      releaseUntilTick: state.tick + secondsToTicks(config.kickReleaseTime, fixedDeltaTime),
      contenderIds: [],
    },
    result: {
      ok: true,
      velocity: { x: launch.vx, y: launch.vy, z: launch.vz },
      speed: launch.speed,
      launchAngle: launch.launchAngle,
    },
    events,
  };
}

/** Speed at which a ground pass counts as having arrived (still playable), m/s. */
export const PASS_ARRIVAL_SPEED = 3;

/**
 * How far a free kick of this type travels on an empty pitch: to its first landing when lifted,
 * otherwise until it slows to `PASS_ARRIVAL_SPEED`. Uses the same integrator as the match.
 */
export function kickTravelDistance(
  type: KickType,
  power: number,
  lift: number,
  config: BallConfig,
  fixedDeltaTime: number,
): number {
  const preset = config.kickPresets[type];
  const launch = launchVelocity(preset, 1, 0, power, lift);
  const ball = createBallSimulationState().ball;
  const body = toBody({ ...ball, position: { x: 0, y: 0, z: ball.radius } });
  body.vx = launch.vx;
  body.vz = launch.vz;
  if (launch.vz > 0) body.pz += 1e-6;
  setKickSpin(body, preset, 1, 0);
  const aerial = launch.vz > 0;
  for (let i = 0; i < 400 && !isAtRest(body); i += 1) {
    const bounce = integrateBall(body, config, fixedDeltaTime);
    if (aerial && (bounce > 0 || body.vz === 0)) return body.px;
    if (!aerial && Math.hypot(body.vx, body.vy) < PASS_ARRIVAL_SPEED) return body.px;
  }
  return body.px;
}

/**
 * Power (0–1) for which a kick of this type covers `distance` (see `kickTravelDistance`),
 * by bisection. 1 when even full power falls short. This only turns a distance the user chose
 * into a power; it does not pick targets.
 */
export function suggestKickPower(
  type: KickType,
  distance: number,
  lift: number,
  config: BallConfig,
  fixedDeltaTime: number,
): number {
  if (kickTravelDistance(type, 1, lift, config, fixedDeltaTime) <= distance) return 1;
  if (kickTravelDistance(type, 0, lift, config, fixedDeltaTime) >= distance) return 0;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 18; i += 1) {
    const mid = (low + high) / 2;
    if (kickTravelDistance(type, mid, lift, config, fixedDeltaTime) < distance) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
