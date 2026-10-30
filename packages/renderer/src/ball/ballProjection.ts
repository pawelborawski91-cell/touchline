import { BALL_FRAME_SIZE } from '@touchline/shared';

/**
 * How a ball in 3D is drawn on the top-down pitch. The ball's ground position (x, y) is where its
 * shadow sits; the ball itself is drawn raised up the screen by a lift that grows with height.
 * Lift and sizes are screen pixels (log-compressed so a 30 m clearance stays on screen), so the
 * ball reads the same at every zoom.
 */
export interface BallProjection {
  /** Height of the ball's underside above the grass, m. */
  height: number;
  /** Upward screen offset of the drawn ball from its shadow, px. */
  liftPx: number;
  /** Scale of the drawn ball (slightly larger when high, as if nearer the camera). */
  ballScale: number;
  /** Scale and opacity of the shadow (wider and fainter when high). */
  shadowScale: number;
  shadowOpacity: number;
  /** Whether to draw the height stalk joining the shadow and the ball. */
  showStalk: boolean;
}

/** Lift for a ball `metres` high: `BALL_LIFT_PX · ln(1 + metres / BALL_LIFT_KNEE)`. */
export const BALL_LIFT_PX = 28;
export const BALL_LIFT_KNEE = 2;
/** The stalk appears above this height, m. */
export const BALL_STALK_MIN_HEIGHT = 0.25;

export function ballLiftPx(height: number): number {
  'worklet';
  return height > 0 ? BALL_LIFT_PX * Math.log1p(height / BALL_LIFT_KNEE) : 0;
}

export function projectBall(z: number, radius: number): BallProjection {
  'worklet';
  const height = Math.max(0, z - radius);
  return {
    height,
    liftPx: ballLiftPx(height),
    ballScale: 1 + 0.4 * (1 - Math.exp(-height / 4)),
    shadowScale: 1 + 0.7 * (1 - Math.exp(-height / 3)),
    shadowOpacity: 0.3 + 0.7 * Math.exp(-height / 3),
    showStalk: height > BALL_STALK_MIN_HEIGHT,
  };
}

/** Ball values read from a render frame: centre position (m) and velocity (m/s). */
export interface BallFrameValues {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** Reads the ball from a frame at `offset` (see `ballFrameOffset`), or null if it is not there. */
export function readBallFrame(
  values: readonly number[] | undefined,
  offset: number,
): BallFrameValues | null {
  'worklet';
  if (!values || offset < 0 || values.length < offset + BALL_FRAME_SIZE) return null;
  return {
    x: values[offset]!,
    y: values[offset + 1]!,
    z: values[offset + 2]!,
    vx: values[offset + 3]!,
    vy: values[offset + 4]!,
    vz: values[offset + 5]!,
  };
}

export interface BallTrailPoint {
  x: number;
  y: number;
  height: number;
}

/** Trails are drawn only for balls moving at least this fast, m/s. */
export const BALL_TRAIL_MIN_SPEED = 4;

/**
 * Where the ball was over the last `seconds`, extrapolated backwards from its current position
 * and velocity under gravity (newest first). Empty for slow balls. Approximate (drag and bounces
 * are ignored); for a short fading streak only.
 */
export function ballTrail(
  ball: BallFrameValues,
  radius: number,
  gravity: number,
  seconds = 0.3,
  steps = 8,
): BallTrailPoint[] {
  'worklet';
  const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
  if (speed < BALL_TRAIL_MIN_SPEED) return [];
  const points: BallTrailPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (seconds * i) / steps;
    const z = ball.z - ball.vz * t - 0.5 * gravity * t * t;
    points.push({
      x: ball.x - ball.vx * t,
      y: ball.y - ball.vy * t,
      height: Math.max(0, z - radius),
    });
  }
  return points;
}
