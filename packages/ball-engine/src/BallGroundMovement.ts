import type { BallConfig } from './BallConfig';
import { applyContactFriction, SHELL_SPIN_FACTOR } from './BallFlight';
import type { BallBody } from './BallState';

/**
 * One step of the ball on the grass.
 *
 * 1. Skid: while the contact point slips (spin not matching the velocity), kinetic friction
 *    moves velocity and spin towards pure rolling. This is how spin changes rolling behaviour:
 *    backspin checks the ball, topspin drives it on.
 * 2. Rolling resistance: a constant deceleration (`rollingResistance · g`) plus speed-proportional
 *    grass drag. When a step's deceleration exceeds the remaining speed the ball comes to rest,
 *    so it never creeps or slides indefinitely and low speeds stay stable.
 * 3. Spin about the vertical axis decays; position advances with the new velocity.
 */
export function stepGround(body: BallBody, config: BallConfig, dt: number): void {
  body.pz = body.radius;
  body.vz = 0;

  const slipX = body.vx - body.radius * body.wy;
  const slipY = body.vy + body.radius * body.wx;
  const slip = Math.hypot(slipX, slipY);
  if (slip > 1e-9) {
    // Friction changes the slip (1 + factor) times faster than it changes the velocity.
    const change = Math.min(
      config.slidingFriction * config.gravity * dt,
      slip / (1 + SHELL_SPIN_FACTOR),
    );
    applyContactFriction(body, (-slipX / slip) * change, (-slipY / slip) * change);
  }

  const speed = Math.hypot(body.vx, body.vy);
  const decel = (config.rollingResistance * config.gravity + config.groundFriction * speed) * dt;
  if (speed <= decel) {
    body.vx = 0;
    body.vy = 0;
    body.wx = 0;
    body.wy = 0;
  } else {
    const keep = (speed - decel) / speed;
    body.vx *= keep;
    body.vy *= keep;
    body.wx *= keep;
    body.wy *= keep;
  }
  body.wz *= Math.max(0, 1 - config.groundSpinDecay * dt);

  body.px += body.vx * dt;
  body.py += body.vy * dt;
}
