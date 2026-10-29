import type { PlayerMovementAttributes, Vector2 } from '@touchline/shared';

import { angleDifference, clamp } from '../math/angles';
import { angleOf, fromAngle, scale, sub } from '../math/vector';

/** Fraction of the deceleration budget the arrival planner uses, leaving room for discrete steps. */
export const BRAKING_MARGIN = 0.85;

/** Distance needed to stop from `speed` at constant `deceleration`: v² / 2a. */
export function stoppingDistance(speed: number, deceleration: number): number {
  return deceleration > 0 ? (speed * speed) / (2 * deceleration) : Infinity;
}

/**
 * Fastest speed from which the player can still slow to `exitSpeed` within `distance`,
 * capped at `cap`: √(v_exit² + 2·a·d).
 */
export function arrivalSpeed(
  distance: number,
  deceleration: number,
  cap: number,
  exitSpeed = 0,
): number {
  const d = Math.max(0, distance);
  return Math.min(cap, Math.sqrt(exitSpeed * exitSpeed + 2 * deceleration * BRAKING_MARGIN * d));
}

/** What the player wants to do this step: head in `direction` at `speed` (null = just brake). */
export interface MovementIntent {
  direction: number | null;
  speed: number;
}

export interface SteeringOutput {
  desiredDirection: number | null;
  desiredSpeed: number;
  desiredVelocity: Vector2;
  /** (desired − current velocity), the correction the movement integrator works towards. */
  steeringAcceleration: Vector2;
  braking: boolean;
  stoppingDistance: number;
}

/**
 * Steering for a target point: head straight for it at `cruiseSpeed`, then brake so that the
 * player stops (or reaches `exitSpeed`) at a point `distanceToGoal` ahead.
 */
export function computeSteering(params: {
  position: Vector2;
  velocity: Vector2;
  target: Vector2;
  distanceToGoal: number;
  cruiseSpeed: number;
  exitSpeed?: number;
  attributes: PlayerMovementAttributes;
}): SteeringOutput {
  const { position, velocity, target, distanceToGoal, cruiseSpeed, attributes } = params;
  const toTarget = sub(target, position);
  const hasDirection = Math.hypot(toTarget.x, toTarget.y) > 1e-4;
  const desiredDirection = hasDirection ? angleOf(toTarget) : null;
  const desiredSpeed = arrivalSpeed(
    distanceToGoal,
    attributes.deceleration,
    cruiseSpeed,
    params.exitSpeed ?? 0,
  );
  const desiredVelocity =
    desiredDirection === null ? { x: 0, y: 0 } : scale(fromAngle(desiredDirection), desiredSpeed);
  const speed = Math.hypot(velocity.x, velocity.y);
  return {
    desiredDirection,
    desiredSpeed,
    desiredVelocity,
    steeringAcceleration: sub(desiredVelocity, velocity),
    braking: desiredSpeed < speed,
    stoppingDistance: stoppingDistance(speed, attributes.deceleration),
  };
}

/**
 * Speed the player aims for given how far its heading is from the desired direction: full speed
 * when aligned, easing off through a turn so momentum carries it round instead of overshooting.
 */
export function alignedSpeed(desiredSpeed: number, headingError: number, agility: number): number {
  const alignment = Math.cos(clamp(Math.abs(headingError), 0, Math.PI));
  const floor = 0.1 + 0.1 * agility;
  return desiredSpeed * Math.max(floor, alignment);
}

export function headingError(facing: number, direction: number | null): number {
  return direction === null ? 0 : angleDifference(facing, direction);
}
