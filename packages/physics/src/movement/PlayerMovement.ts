import {
  FIELD_LENGTH,
  FIELD_WIDTH,
  type PlayerMovementAttributes,
  type Vector2,
} from '@touchline/shared';

import { clamp, degToRad, moveTowards, normalizeAngle, rotateTowards } from '../math/angles';
import { fromAngle } from '../math/vector';
import { alignedSpeed, headingError, type MovementIntent } from './SteeringController';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const PITCH_MOVEMENT_BOUNDS: Readonly<Bounds> = Object.freeze({
  minX: 0,
  minY: 0,
  maxX: FIELD_LENGTH,
  maxY: FIELD_WIDTH,
});

/** Kinematic state the integrator advances. Velocity always points along `facing`. */
export interface MovementBody {
  position: Vector2;
  velocity: Vector2;
  facing: number;
}

/**
 * Turning rate in rad/s. Agile players turn faster; everyone turns faster standing still than at
 * full speed (1.6× at rest down to 0.8× at max speed), so tight turns need braking first.
 */
export function turnRate(attributes: PlayerMovementAttributes, speed: number): number {
  const base = degToRad(attributes.turningSpeed) * (0.6 + 0.4 * attributes.agility);
  const speedFactor = 1.6 - 0.8 * clamp(speed / attributes.maxSpeed, 0, 1);
  return base * speedFactor;
}

/** Acceleration available at a speed; tapers towards max speed so top speed is reached gradually. */
export function availableAcceleration(attributes: PlayerMovementAttributes, speed: number): number {
  return attributes.acceleration * (1 - 0.45 * clamp(speed / attributes.maxSpeed, 0, 1));
}

/**
 * One fixed step of player movement (semi-implicit Euler):
 * 1. rotate the heading towards the intent at the speed-dependent turn rate;
 * 2. pick a target speed, eased off while the heading is still misaligned;
 * 3. change speed by at most acceleration·dt (speeding up) or deceleration·dt (braking);
 * 4. move along the new heading and keep the player inside the bounds.
 * Momentum is preserved because neither heading nor speed can jump.
 */
export function stepMovement(
  body: MovementBody,
  intent: MovementIntent,
  attributes: PlayerMovementAttributes,
  dt: number,
  bounds: Bounds = PITCH_MOVEMENT_BOUNDS,
): MovementBody {
  const speed = Math.hypot(body.velocity.x, body.velocity.y);
  let facing = body.facing;
  let targetSpeed = 0;

  if (intent.direction !== null && intent.speed > 0) {
    facing = rotateTowards(facing, intent.direction, turnRate(attributes, speed) * dt);
    targetSpeed = alignedSpeed(
      intent.speed,
      headingError(facing, intent.direction),
      attributes.agility,
    );
  }

  const rate =
    targetSpeed > speed ? availableAcceleration(attributes, speed) : attributes.deceleration;
  const nextSpeed = moveTowards(speed, targetSpeed, rate * dt);
  const heading = fromAngle(facing);
  let vx = heading.x * nextSpeed;
  let vy = heading.y * nextSpeed;
  let x = body.position.x + vx * dt;
  let y = body.position.y + vy * dt;

  if (x < bounds.minX || x > bounds.maxX) {
    x = clamp(x, bounds.minX, bounds.maxX);
    vx = 0;
  }
  if (y < bounds.minY || y > bounds.maxY) {
    y = clamp(y, bounds.minY, bounds.maxY);
    vy = 0;
  }

  return { position: { x, y }, velocity: { x: vx, y: vy }, facing: normalizeAngle(facing) };
}
