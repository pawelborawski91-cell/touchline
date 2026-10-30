import {
  BallEngine,
  createBallSimulationState,
  DEFAULT_BALL_CONFIG,
  integrateBall,
  isAtRest,
  isOutOfBounds,
  predictTrajectory,
  stepBall,
  toBody,
  type BallEvent,
  type BallSimulationState,
} from '@touchline/ball-engine';
import { BALL_RADIUS, createBallState, type BallState, type Vector3 } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const config = DEFAULT_BALL_CONFIG;
const DT = 0.05;

function ballWith(
  position: Partial<Vector3>,
  velocity: Partial<Vector3>,
  spin?: Vector3,
): BallState {
  const ball = createBallState();
  return {
    ...ball,
    position: { ...ball.position, ...position },
    velocity: { x: 0, y: 0, z: 0, ...velocity },
    spin: spin ?? { x: 0, y: 0, z: 0 },
  };
}

/** Runs the ball on an empty pitch, returning every state and event. */
function fly(ball: BallState, seconds: number) {
  let state: BallSimulationState = createBallSimulationState(ball);
  const states: BallState[] = [];
  const events: BallEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    const result = stepBall(state, [], [], config, DT);
    state = result.state;
    states.push(state.ball);
    events.push(...result.events);
  }
  return { state, states, events };
}

const hSpeed = (b: BallState) => Math.hypot(b.velocity.x, b.velocity.y);

describe('ground movement', () => {
  it('slows a rolling ball with friction and brings it fully to rest', () => {
    const { states } = fly(ballWith({ x: 20 }, { x: 10 }, { x: 0, y: 10 / BALL_RADIUS, z: 0 }), 12);
    const speeds = states.map(hSpeed);
    for (let i = 1; i < speeds.length; i += 1)
      expect(speeds[i]!).toBeLessThanOrEqual(speeds[i - 1]!);
    expect(speeds.at(-1)).toBe(0);
    const travelled = states.at(-1)!.position.x - 20;
    expect(travelled).toBeGreaterThan(20);
    expect(travelled).toBeLessThan(40);
    expect(states.every((b) => b.position.z === BALL_RADIUS)).toBe(true);
  });

  it('stops without snapping or reversing at low speed', () => {
    const { states } = fly(ballWith({ x: 20 }, { x: 0.4 }), 3);
    const xs = states.map((b) => b.position.x);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
      expect(xs[i]! - xs[i - 1]!).toBeLessThan(0.4 * DT + 1e-9);
    }
    expect(hSpeed(states.at(-1)!)).toBe(0);
    expect(isAtRest(toBody(states.at(-1)!))).toBe(true);
  });

  it('turns skid into roll: a ball launched without spin picks up rolling spin', () => {
    const { states } = fly(ballWith({ x: 20 }, { x: 8 }), 1);
    const last = states.at(-1)!;
    expect(last.spin.y).toBeCloseTo(last.velocity.x / BALL_RADIUS, 1);
    // Skidding costs more speed than rolling: the first 0.25 s lose more than the next.
    const lossEarly = 8 - hSpeed(states[4]!);
    const lossLate = hSpeed(states[4]!) - hSpeed(states[9]!);
    expect(lossEarly).toBeGreaterThan(lossLate);
  });

  it('lets backspin check a rolling ball and topspin carry it further', () => {
    const roll = (wy: number) =>
      fly(ballWith({ x: 20 }, { x: 8 }, { x: 0, y: wy, z: 0 }), 10).state.ball;
    const plain = roll(8 / BALL_RADIUS).position.x;
    const back = roll(-30).position.x;
    const top = roll(8 / BALL_RADIUS + 30).position.x;
    expect(back).toBeLessThan(plain);
    expect(top).toBeGreaterThan(plain);
  });
});

describe('aerial movement', () => {
  it('follows a gravity arc and lands when the centre reaches the radius', () => {
    const { states, events } = fly(ballWith({ x: 20 }, { x: 10, z: 10 }), 3);
    const apex = Math.max(...states.map((b) => b.position.z));
    expect(apex).toBeGreaterThan(4);
    expect(apex).toBeLessThan((10 * 10) / (2 * 9.81) + BALL_RADIUS);
    const firstBounce = events.find((e) => e.type === 'bounce');
    expect(firstBounce).toBeDefined();
    expect(states.every((b) => b.position.z >= BALL_RADIUS - 1e-12)).toBe(true);
  });

  it('loses speed to air resistance (shorter than a vacuum arc)', () => {
    const { states, events } = fly(ballWith({ x: 0 }, { x: 20, z: 15 }), 4);
    const landing = events.find((e) => e.type === 'bounce')!;
    const vacuumRange = (2 * 20 * 15) / 9.81;
    expect(states[landing.tick]!.position.x).toBeLessThan(vacuumRange);
    expect(states[landing.tick]!.position.x).toBeGreaterThan(vacuumRange * 0.6);
  });

  it('bounces lose energy each time and the ball settles on the grass', () => {
    const { states, events } = fly(ballWith({ x: 20, z: 6 }, { x: 3 }), 8);
    const bounces = events
      .filter((e) => e.type === 'bounce')
      .map((e) => (e as { impactSpeed: number }).impactSpeed);
    expect(bounces.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < bounces.length; i += 1) expect(bounces[i]!).toBeLessThan(bounces[i - 1]!);
    const last = states.at(-1)!;
    expect(last.position.z).toBe(BALL_RADIUS);
    expect(last.velocity.z).toBe(0);
  });

  it('never ends a step below the grass', () => {
    const { states } = fly(ballWith({ x: 20, z: 2 }, { x: 25, z: -30 }), 2);
    expect(Math.min(...states.map((b) => b.position.z))).toBeGreaterThanOrEqual(BALL_RADIUS);
  });

  it('curves with sidespin (Magnus)', () => {
    const curl = fly(ballWith({ x: 20 }, { x: 20, z: 6 }, { x: 0, y: 0, z: 30 }), 1.2).state.ball;
    const straight = fly(ballWith({ x: 20 }, { x: 20, z: 6 }), 1.2).state.ball;
    expect(straight.position.y).toBeCloseTo(34, 9);
    expect(curl.position.y).toBeGreaterThan(34.5);
  });

  it('matches the predicted trajectory on an empty pitch', () => {
    const ball = ballWith({ x: 20 }, { x: 12, z: 8 });
    const predicted = predictTrajectory(ball, config, DT, 2);
    const { states } = fly(ball, 2);
    expect(predicted[10]!.x).toBeCloseTo(states[9]!.position.x, 9);
    expect(predicted[10]!.z).toBeCloseTo(states[9]!.position.z, 9);
  });

  it('is independent of how real time is split between update calls', () => {
    const ball = ballWith({ x: 20 }, { x: 14, z: 7 }, { x: 0, y: -10, z: 4 });
    const a = new BallEngine(ball, config, DT);
    const b = new BallEngine(ball, config, DT);
    for (let i = 0; i < 60; i += 1) a.update([], 1 / 60);
    for (let i = 0; i < 20; i += 1) b.update([], 1 / 20);
    expect(a.getState()).toEqual(b.getState());
  });
});

describe('out of play', () => {
  it('is out only once the whole ball has crossed a line', () => {
    expect(isOutOfBounds({ x: -0.1, y: 30 }, BALL_RADIUS, config)).toBe(false);
    expect(isOutOfBounds({ x: -0.12, y: 30 }, BALL_RADIUS, config)).toBe(true);
    expect(isOutOfBounds({ x: 50, y: 68.2 }, BALL_RADIUS, config)).toBe(true);
  });

  it('reports out of play once and keeps simulating the ball', () => {
    const { states, events } = fly(ballWith({ x: 2 }, { x: -6 }), 2);
    const out = events.filter((e) => e.type === 'out_of_play');
    expect(out).toHaveLength(1);
    expect(states.at(-1)!.isOutOfPlay).toBe(true);
    expect(states.at(-1)!.possessionState).toBe('out_of_play');
    expect(states.at(-1)!.position.x).toBeLessThan(-0.11);
  });

  it('integrateBall alone is deterministic', () => {
    const run = () => {
      const body = toBody(ballWith({ x: 10, z: 1 }, { x: 9, y: 2, z: 5 }, { x: 3, y: -4, z: 2 }));
      for (let i = 0; i < 80; i += 1) integrateBall(body, config, DT);
      return body;
    };
    expect(run()).toEqual(run());
  });
});
