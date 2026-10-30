import {
  createBallState,
  type BallState,
  type KickType,
  type PossessionState,
  type Vector2,
} from '@touchline/shared';

/**
 * Everything the ball engine carries from one tick to the next. Immutable: every step returns a
 * new object. `ball` is the public, renderer-facing state; the rest is interaction bookkeeping.
 */
export interface BallSimulationState {
  readonly ball: BallState;
  /** Fixed steps simulated by the ball engine. */
  readonly tick: number;
  /** Earliest tick for the controller's next routine dribble touch. */
  readonly nextTouchTick: number;
  readonly lastTouchTick: number | null;
  /** The last kicker, who cannot control the ball again until `releaseUntilTick`. */
  readonly releasedPlayerId: string | null;
  readonly releaseUntilTick: number;
  /** Players currently challenging for the ball (empty unless contested). */
  readonly contenderIds: readonly string[];
}

export function createBallSimulationState(
  ball: BallState = createBallState(),
): BallSimulationState {
  return {
    ball,
    tick: 0,
    nextTouchTick: 0,
    lastTouchTick: null,
    releasedPlayerId: null,
    releaseUntilTick: 0,
    contenderIds: [],
  };
}

export type TouchKind = 'deflection' | 'control' | 'dribble';

export type ControlLossReason = 'kicked' | 'loose' | 'tackled' | 'airborne' | 'out_of_play';

/** Something that happened to the ball during a step, for the match engine and debug UI. */
export type BallEvent =
  | { type: 'touch'; tick: number; playerId: string; teamId: string; kind: TouchKind }
  | { type: 'control_gained'; tick: number; playerId: string; teamId: string }
  | { type: 'control_lost'; tick: number; playerId: string; reason: ControlLossReason }
  | { type: 'contest'; tick: number; playerIds: readonly string[] }
  | {
      type: 'kick';
      tick: number;
      playerId: string;
      teamId: string;
      kickType: KickType;
      speed: number;
    }
  | { type: 'bounce'; tick: number; impactSpeed: number }
  | { type: 'out_of_play'; tick: number; position: Vector2; lastTouchTeamId: string | null };

/** Read-only possession summary. */
export interface PossessionSnapshot {
  state: PossessionState;
  controllerPlayerId: string | null;
  controllerTeamId: string | null;
  contenderIds: readonly string[];
  lastTouchPlayerId: string | null;
  lastTouchTeamId: string | null;
}

/** Height of the ball's underside above the grass, m. */
export function ballHeight(ball: Pick<BallState, 'position' | 'radius'>): number {
  return Math.max(0, ball.position.z - ball.radius);
}

export function horizontalSpeed(ball: Pick<BallState, 'velocity'>): number {
  return Math.hypot(ball.velocity.x, ball.velocity.y);
}

/** True when the ball is off the grass or still moving vertically. */
export function isAirborne(ball: Pick<BallState, 'position' | 'velocity' | 'radius'>): boolean {
  return ball.position.z > ball.radius + 1e-6 || ball.velocity.z !== 0;
}

/**
 * Mutable scratch copy of the ball's kinematics used inside one step, so the integrators work on
 * plain numbers without allocating vectors.
 */
export interface BallBody {
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  radius: number;
}

export function toBody(ball: BallState): BallBody {
  return {
    px: ball.position.x,
    py: ball.position.y,
    pz: ball.position.z,
    vx: ball.velocity.x,
    vy: ball.velocity.y,
    vz: ball.velocity.z,
    wx: ball.spin.x,
    wy: ball.spin.y,
    wz: ball.spin.z,
    radius: ball.radius,
  };
}

export function withBody(ball: BallState, body: BallBody): BallState {
  return {
    ...ball,
    position: { x: body.px, y: body.py, z: body.pz },
    velocity: { x: body.vx, y: body.vy, z: body.vz },
    spin: { x: body.wx, y: body.wy, z: body.wz },
  };
}

/** Sets the horizontal spin to that of a ball rolling without slip at its current velocity. */
export function setRollingSpin(body: BallBody): void {
  body.wx = -body.vy / body.radius;
  body.wy = body.vx / body.radius;
}
