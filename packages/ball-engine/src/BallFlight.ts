import type { BallConfig } from './BallConfig';
import type { BallBody } from './BallState';

/** Ratio m·r²/I for a thin-shelled ball (I = ⅔·m·r²), used to turn friction into spin change. */
export const SHELL_SPIN_FACTOR = 1.5;

/**
 * Applies a friction impulse `(dvx, dvy)` acting at the contact point under the ball, updating
 * both its velocity and its spin.
 */
export function applyContactFriction(body: BallBody, dvx: number, dvy: number): void {
  body.vx += dvx;
  body.vy += dvy;
  body.wx += (SHELL_SPIN_FACTOR * dvy) / body.radius;
  body.wy -= (SHELL_SPIN_FACTOR * dvx) / body.radius;
}

export interface FlightStepResult {
  /** Speed of the impact if the ball bounced this step, otherwise 0. */
  bounceSpeed: number;
  /** True when the ball landed too softly to bounce and is now on the grass. */
  settled: boolean;
}

/**
 * One semi-implicit Euler step of free flight: gravity, quadratic air drag and Magnus lift
 * (a = c·ω × v). Crossing the grass (centre below `radius`) reflects the motion with the
 * coefficient of restitution, and friction at the contact trades skid for spin. Soft landings
 * settle the ball on the grass.
 */
export function stepFlight(body: BallBody, config: BallConfig, dt: number): FlightStepResult {
  const { vx, vy, vz, wx, wy, wz } = body;
  const speed = Math.hypot(vx, vy, vz);
  const drag = config.airDrag * speed;
  const ax = -drag * vx + config.magnus * (wy * vz - wz * vy);
  const ay = -drag * vy + config.magnus * (wz * vx - wx * vz);
  const az = -config.gravity - drag * vz + config.magnus * (wx * vy - wy * vx);

  body.vx += ax * dt;
  body.vy += ay * dt;
  body.vz += az * dt;
  body.px += body.vx * dt;
  body.py += body.vy * dt;
  body.pz += body.vz * dt;

  const spinKeep = Math.max(0, 1 - config.airSpinDecay * dt);
  body.wx *= spinKeep;
  body.wy *= spinKeep;
  body.wz *= spinKeep;

  if (body.pz >= body.radius) return { bounceSpeed: 0, settled: false };

  const impact = -body.vz;
  if (impact <= config.minBounceSpeed) {
    body.pz = body.radius;
    body.vz = 0;
    return { bounceSpeed: 0, settled: true };
  }
  // Mirror the part of the step spent below the grass, scaled by the restitution.
  body.pz = body.radius + (body.radius - body.pz) * config.restitution;
  body.vz = impact * config.restitution;
  const slipX = body.vx - body.radius * body.wy;
  const slipY = body.vy + body.radius * body.wx;
  // Removing a share of the slip: the velocity takes 1 / (1 + factor) of the change.
  const share = config.bounceFriction / (1 + SHELL_SPIN_FACTOR);
  applyContactFriction(body, -slipX * share, -slipY * share);
  return { bounceSpeed: impact, settled: false };
}
