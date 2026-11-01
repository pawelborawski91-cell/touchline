import { ballHeight, horizontalSpeed, isAirborne } from '@touchline/ball-engine';
import {
  FIELD_LENGTH,
  FIELD_WIDTH,
  type BallState,
  type PlayerState,
  type Vector2,
} from '@touchline/shared';

import { clamp } from '../navigation/vector';

/**
 * Exponential speed decay used for the AI's ball prediction, 1/s. A rough fit to rolling
 * resistance plus grass drag; the AI only needs to know roughly where to run.
 */
const PREDICTION_DECAY = 0.45;
/** Intercept search horizon and step, s. */
const INTERCEPT_HORIZON = 3;
const INTERCEPT_STEP = 0.25;
/** Distance at which a player can play the ball, m. */
const PLAYING_REACH = 0.8;

/** What every player knows about the ball (all players see everything this sprint). */
export interface BallPerception {
  position: Vector2;
  velocity: Vector2;
  /** Height of the ball's underside, m. */
  height: number;
  speed: number;
  airborne: boolean;
  /** Horizontal heading in radians, or null when (almost) still. */
  heading: number | null;
  /** Nobody controls the ball (it may be contested). */
  isFree: boolean;
  isOutOfPlay: boolean;
}

export function perceiveBall(ball: BallState): BallPerception {
  const speed = horizontalSpeed(ball);
  return {
    position: { x: ball.position.x, y: ball.position.y },
    velocity: { x: ball.velocity.x, y: ball.velocity.y },
    height: ballHeight(ball),
    speed,
    airborne: isAirborne(ball),
    heading: speed > 0.5 ? Math.atan2(ball.velocity.y, ball.velocity.x) : null,
    // A challenge for a ball nobody controls is still a loose ball to go and win.
    isFree: ball.controllerPlayerId === null,
    isOutOfPlay: ball.isOutOfPlay,
  };
}

/** Where the ball will roughly be after `seconds` (clamped to the pitch). */
export function predictBallPosition(ball: BallPerception, seconds: number): Vector2 {
  const travel = (1 - Math.exp(-PREDICTION_DECAY * seconds)) / PREDICTION_DECAY;
  return {
    x: clamp(ball.position.x + ball.velocity.x * travel, 0, FIELD_LENGTH),
    y: clamp(ball.position.y + ball.velocity.y * travel, 0, FIELD_WIDTH),
  };
}

/**
 * Earliest predicted ball position the player can reach at `speed`, or the last predicted point.
 * Returns the point and the time it is reached.
 */
export function interceptPoint(
  ball: BallPerception,
  player: Pick<PlayerState, 'position'>,
  speed: number,
): { point: Vector2; time: number } {
  if (ball.speed < 0.3) {
    const d = Math.hypot(ball.position.x - player.position.x, ball.position.y - player.position.y);
    return { point: ball.position, time: d / Math.max(speed, 0.1) };
  }
  let last = ball.position;
  for (let t = 0; t <= INTERCEPT_HORIZON + 1e-9; t += INTERCEPT_STEP) {
    const point = predictBallPosition(ball, t);
    last = point;
    const d = Math.hypot(point.x - player.position.x, point.y - player.position.y);
    if (d <= speed * t + PLAYING_REACH) return { point, time: t };
  }
  const d = Math.hypot(last.x - player.position.x, last.y - player.position.y);
  return { point: last, time: INTERCEPT_HORIZON + d / Math.max(speed, 0.1) };
}
