import type { BallState, Vector3 } from '@touchline/shared';

import type { BallConfig } from './BallConfig';
import { stepFlight } from './BallFlight';
import { stepGround } from './BallGroundMovement';
import { toBody, type BallBody } from './BallState';

/** True when the ball rests on (or rolls along) the grass rather than flying. */
export function isGrounded(body: BallBody): boolean {
  return body.pz <= body.radius + 1e-9 && body.vz <= 0;
}

/**
 * Advances the ball's free motion by one fixed step, choosing the flight or ground model.
 * Returns the impact speed when the ball bounced this step (0 otherwise).
 */
export function integrateBall(body: BallBody, config: BallConfig, dt: number): number {
  if (isGrounded(body)) {
    stepGround(body, config, dt);
    return 0;
  }
  return stepFlight(body, config, dt).bounceSpeed;
}

/**
 * True once the whole ball has crossed a touchline or goal line (Law 9: the ball is out when it
 * has wholly crossed the line, on the ground or in the air).
 */
export function isOutOfBounds(
  position: Pick<Vector3, 'x' | 'y'>,
  radius: number,
  config: Pick<BallConfig, 'fieldLength' | 'fieldWidth'>,
): boolean {
  return (
    position.x < -radius ||
    position.y < -radius ||
    position.x > config.fieldLength + radius ||
    position.y > config.fieldWidth + radius
  );
}

/** True when the ball neither moves nor spins. */
export function isAtRest(body: BallBody): boolean {
  return isGrounded(body) && body.vx === 0 && body.vy === 0 && body.wx === 0 && body.wy === 0;
}

/**
 * Free-ball trajectory (no player contact) sampled once per fixed step, starting with the current
 * position. Stops early when the ball comes to rest. For debug drawing and kick-power estimates.
 */
export function predictTrajectory(
  ball: BallState,
  config: BallConfig,
  dt: number,
  seconds: number,
): Vector3[] {
  const body = toBody(ball);
  const points: Vector3[] = [{ x: body.px, y: body.py, z: body.pz }];
  const steps = Math.ceil(seconds / dt);
  for (let i = 0; i < steps && !isAtRest(body); i += 1) {
    integrateBall(body, config, dt);
    points.push({ x: body.px, y: body.py, z: body.pz });
  }
  return points;
}
