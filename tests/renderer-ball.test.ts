import {
  BALL_TRAIL_MIN_SPEED,
  ballLiftPx,
  ballTrail,
  projectBall,
  readBallFrame,
} from '@touchline/renderer/core';
import { ballFrameOffset, BALL_RADIUS } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

describe('ball projection', () => {
  it('draws a ball on the grass with no lift, full shadow and no stalk', () => {
    const p = projectBall(BALL_RADIUS, BALL_RADIUS);
    expect(p).toEqual({
      height: 0,
      liftPx: 0,
      ballScale: 1,
      shadowScale: 1,
      shadowOpacity: 1,
      showStalk: false,
    });
  });

  it('raises the ball, widens and fades the shadow as it climbs', () => {
    const low = projectBall(1, BALL_RADIUS);
    const high = projectBall(8, BALL_RADIUS);
    expect(high.liftPx).toBeGreaterThan(low.liftPx);
    expect(high.shadowScale).toBeGreaterThan(low.shadowScale);
    expect(high.shadowOpacity).toBeLessThan(low.shadowOpacity);
    expect(high.ballScale).toBeGreaterThan(low.ballScale);
    expect(low.showStalk).toBe(true);
  });

  it('compresses large heights so a high ball stays on screen', () => {
    expect(ballLiftPx(30)).toBeLessThan(90);
    expect(ballLiftPx(1) / 1).toBeGreaterThan(ballLiftPx(20) / 20);
    expect(ballLiftPx(-1)).toBe(0);
  });

  it('reads the ball from the render frame after the players', () => {
    const frame = [...Array.from({ length: 8 }, () => 0), 10, 20, 0.5, 1, 2, 3];
    expect(readBallFrame(frame, ballFrameOffset(2))).toEqual({
      x: 10,
      y: 20,
      z: 0.5,
      vx: 1,
      vy: 2,
      vz: 3,
    });
    expect(readBallFrame(frame.slice(0, 10), ballFrameOffset(2))).toBeNull();
    expect(readBallFrame(undefined, 0)).toBeNull();
  });

  it('draws a trail only behind a fast ball, pointing back along its path', () => {
    const slow = { x: 10, y: 10, z: BALL_RADIUS, vx: BALL_TRAIL_MIN_SPEED - 1, vy: 0, vz: 0 };
    expect(ballTrail(slow, BALL_RADIUS, 9.81)).toEqual([]);
    const fast = { x: 10, y: 10, z: 3, vx: 15, vy: 0, vz: -2 };
    const trail = ballTrail(fast, BALL_RADIUS, 9.81, 0.3, 6);
    expect(trail).toHaveLength(7);
    expect(trail[0]).toEqual({ x: 10, y: 10, height: 3 - BALL_RADIUS });
    expect(trail.at(-1)!.x).toBeCloseTo(10 - 15 * 0.3, 9);
    expect(trail.every((p) => p.height >= 0)).toBe(true);
  });
});
