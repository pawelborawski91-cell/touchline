import { FIELD_LENGTH, FIELD_WIDTH } from './field';
import type { Vector2, Vector3 } from './math';

/** Approximate radius of a size-5 football, in metres. */
export const BALL_RADIUS = 0.11;

/**
 * Who, if anyone, has the ball. Possession never attaches the ball to a player: a controlled
 * ball is still simulated independently and only moved by contacts.
 */
export type PossessionState = 'free' | 'controlled' | 'contested' | 'out_of_play';

/**
 * The ball as an independent physical body. SI units: metres, m/s, rad/s. `position.z` is the
 * height of the ball's centre above the pitch, so a ball resting on the grass has `z = radius`.
 */
export interface BallState {
  id: string;
  position: Vector3;
  velocity: Vector3;
  /** Angular velocity in rad/s (right-handed, world axes). */
  spin: Vector3;
  radius: number;
  lastTouchPlayerId: string | null;
  lastTouchTeamId: string | null;
  /** Player who currently controls the ball (also set while a contest is being won). */
  controllerPlayerId: string | null;
  possessionState: PossessionState;
  isOutOfPlay: boolean;
}

export type KickType = 'pass' | 'shot' | 'clearance' | 'lob';

export const KICK_TYPES: readonly KickType[] = ['pass', 'shot', 'clearance', 'lob'];

export interface KickRequest {
  playerId: string;
  type: KickType;
  /** Horizontal direction of the kick; normalised by the ball engine. */
  direction: Vector2;
  /** 0–1 within the kick type's speed range. */
  power: number;
  /** 0–1 within the kick type's launch-angle range. */
  lift: number;
}

/** A free ball at rest, by default on the centre spot. */
export function createBallState(
  position: Vector2 = { x: FIELD_LENGTH / 2, y: FIELD_WIDTH / 2 },
  radius: number = BALL_RADIUS,
): BallState {
  return {
    id: 'ball',
    position: { x: position.x, y: position.y, z: radius },
    velocity: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    radius,
    lastTouchPlayerId: null,
    lastTouchTeamId: null,
    controllerPlayerId: null,
    possessionState: 'free',
    isOutOfPlay: false,
  };
}
