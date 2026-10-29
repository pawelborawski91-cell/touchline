import {
  alignedSpeed,
  angleDifference,
  arrivalSpeed,
  createFollowerState,
  drainStamina,
  followPath,
  getSpeedCap,
  lerpAngle,
  MOVEMENT_MODE_SPEED,
  normalizeAngle,
  preparePath,
  rotateTowards,
  staminaSpeedCeiling,
  stepMovement,
  stoppingDistance,
  turnRate,
  type FollowerState,
  type MovementBody,
  type MovementIntent,
} from '@touchline/physics';
import type { PlayerMovementAttributes, Vector2 } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const DT = 0.05;

const ATTRS: PlayerMovementAttributes = {
  maxSpeed: 8,
  acceleration: 3,
  deceleration: 5,
  agility: 0.8,
  turningSpeed: 300,
  stamina: 0.8,
};

function body(x = 50, y = 34, speed = 0, facing = 0): MovementBody {
  return {
    position: { x, y },
    velocity: { x: Math.cos(facing) * speed, y: Math.sin(facing) * speed },
    facing,
  };
}

const speedOf = (b: MovementBody) => Math.hypot(b.velocity.x, b.velocity.y);

function run(start: MovementBody, intent: MovementIntent, ticks: number): MovementBody[] {
  const states = [start];
  for (let i = 0; i < ticks; i += 1) states.push(stepMovement(states[i]!, intent, ATTRS, DT));
  return states;
}

/** Follows a path until completion (or `maxTicks`), returning every body state. */
function follow(points: Vector2[], cap: number, maxTicks = 400) {
  const path = preparePath(points);
  let follower: FollowerState = createFollowerState();
  let current = body(points[0]!.x, points[0]!.y);
  const states = [current];
  for (let i = 0; i < maxTicks; i += 1) {
    const result = followPath(path, follower, current, cap, ATTRS);
    follower = result.follower;
    if (result.completed) return { states, completed: true, ticks: i };
    current = stepMovement(current, result.intent, ATTRS, DT);
    states.push(current);
  }
  return { states, completed: false, ticks: maxTicks };
}

describe('angles', () => {
  it('normalises into (−π, π] and takes the shortest difference', () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(angleDifference(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
  });

  it('rotates towards a target without overshooting', () => {
    expect(rotateTowards(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(rotateTowards(0, 0.2, 0.3)).toBeCloseTo(0.2);
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI);
  });
});

describe('player movement', () => {
  it('accelerates gradually from rest, never faster than the acceleration attribute', () => {
    const states = run(body(), { direction: 0, speed: 8 }, 20);
    for (let i = 1; i < states.length; i += 1) {
      const gain = speedOf(states[i]!) - speedOf(states[i - 1]!);
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeLessThanOrEqual(ATTRS.acceleration * DT + 1e-9);
    }
    expect(speedOf(states[1]!)).toBeCloseTo(ATTRS.acceleration * DT);
  });

  it('reaches but never exceeds the requested speed', () => {
    const states = run(body(10, 34), { direction: 0, speed: 6 }, 200);
    const speeds = states.map(speedOf);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(6 + 1e-9);
    expect(speeds.at(-1)).toBeCloseTo(6);
  });

  it('decelerates at the deceleration rate and stops smoothly', () => {
    const states = run(body(20, 34, 7), { direction: null, speed: 0 }, 40);
    for (let i = 1; i < states.length; i += 1) {
      const loss = speedOf(states[i - 1]!) - speedOf(states[i]!);
      expect(loss).toBeGreaterThanOrEqual(0);
      expect(loss).toBeLessThanOrEqual(ATTRS.deceleration * DT + 1e-9);
    }
    expect(speedOf(states.at(-1)!)).toBe(0);
  });

  it('turns at a finite rate, faster at low speed than at high speed', () => {
    const turned = stepMovement(body(50, 34, 0), { direction: Math.PI / 2, speed: 3 }, ATTRS, DT);
    expect(turned.facing).toBeCloseTo(turnRate(ATTRS, 0) * DT);
    expect(turned.facing).toBeLessThan(Math.PI / 2);
    expect(turnRate(ATTRS, 0)).toBeGreaterThan(turnRate(ATTRS, ATTRS.maxSpeed));
  });

  it('keeps momentum through a turn instead of changing direction instantly', () => {
    const start = body(30, 34, 7, 0);
    const next = stepMovement(start, { direction: Math.PI, speed: 7 }, ATTRS, DT);
    expect(next.velocity.x).toBeGreaterThan(0);
    expect(speedOf(next)).toBeLessThan(7);
    expect(speedOf(next)).toBeGreaterThan(7 - ATTRS.deceleration * DT - 1e-9);
  });

  it('eases speed off while the heading is misaligned', () => {
    expect(alignedSpeed(8, 0, 0.8)).toBe(8);
    expect(alignedSpeed(8, Math.PI / 3, 0.8)).toBeCloseTo(4);
    expect(alignedSpeed(8, Math.PI, 0.8)).toBeCloseTo(8 * 0.18);
  });

  it('stays inside the pitch and drops the outward velocity at the boundary', () => {
    let current = body(104, 34, 6, 0);
    for (let i = 0; i < 20; i += 1)
      current = stepMovement(current, { direction: 0, speed: 6 }, ATTRS, DT);
    expect(current.position.x).toBeLessThanOrEqual(105);
    expect(current.velocity.x).toBe(0);
    current = stepMovement(
      body(30, 0.1, 5, -Math.PI / 2),
      { direction: -Math.PI / 2, speed: 5 },
      ATTRS,
      DT,
    );
    expect(current.position.y).toBe(0);
  });
});

describe('steering', () => {
  it('computes the stopping distance as v² / 2a', () => {
    expect(stoppingDistance(6, 5)).toBeCloseTo(3.6);
    expect(stoppingDistance(0, 5)).toBe(0);
  });

  it('limits the approach speed so the player can stop in the remaining distance', () => {
    expect(arrivalSpeed(100, 5, 8)).toBe(8);
    expect(arrivalSpeed(0, 5, 8)).toBe(0);
    const v = arrivalSpeed(2, 5, 8);
    expect(stoppingDistance(v, 5)).toBeLessThanOrEqual(2);
    expect(arrivalSpeed(0, 5, 8, 3)).toBe(3);
  });

  it('stops within its stopping distance when braking from speed', () => {
    const start = body(20, 34, 6);
    const states = run(start, { direction: null, speed: 0 }, 60);
    const travelled = states.at(-1)!.position.x - start.position.x;
    expect(travelled).toBeLessThanOrEqual(stoppingDistance(6, ATTRS.deceleration) + 0.01);
  });
});

describe('path follower', () => {
  it('advances waypoints within the arrival radius without snapping to them', () => {
    const points = [
      { x: 20, y: 34 },
      { x: 30, y: 34 },
      { x: 30, y: 44 },
    ];
    const { states, completed } = follow(points, 6);
    expect(completed).toBe(true);
    // The corner is cut smoothly but stays close to the drawn waypoint.
    const closest = Math.min(
      ...states.map((s) => Math.hypot(s.position.x - 30, s.position.y - 34)),
    );
    expect(closest).toBeLessThan(1.5);
    for (let i = 1; i < states.length; i += 1) {
      const step = Math.hypot(
        states[i]!.position.x - states[i - 1]!.position.x,
        states[i]!.position.y - states[i - 1]!.position.y,
      );
      expect(step).toBeLessThanOrEqual(6 * DT + 1e-9);
    }
  });

  it('slows near the end and completes only once stopped at the destination', () => {
    const { states, completed } = follow(
      [
        { x: 20, y: 34 },
        { x: 40, y: 34 },
      ],
      8,
    );
    expect(completed).toBe(true);
    const end = states.at(-1)!;
    expect(Math.hypot(end.position.x - 40, end.position.y - 34)).toBeLessThanOrEqual(0.25);
    expect(speedOf(end)).toBeLessThanOrEqual(0.1 + ATTRS.deceleration * DT);
    expect(Math.max(...states.map((s) => s.position.x))).toBeLessThanOrEqual(40.3);
    const lastSecond = states.slice(-20).map(speedOf);
    expect(lastSecond[0]!).toBeGreaterThan(lastSecond.at(-1)!);
  });

  it('reports completion immediately for a stationary single-point path', () => {
    const result = followPath(
      preparePath([{ x: 5, y: 5 }]),
      createFollowerState(),
      body(5, 5),
      6,
      ATTRS,
    );
    expect(result.completed).toBe(true);
  });

  it('marks sharp corners with a low corner speed factor and straight points with 1', () => {
    const path = preparePath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
    ]);
    expect(path.total).toBeCloseTo(30);
    expect(path.cornerFactor[1]).toBe(1);
    expect(path.cornerFactor[2]).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('movement modes and stamina', () => {
  it('caps speed by mode', () => {
    expect(MOVEMENT_MODE_SPEED).toEqual({ walk: 0.35, jog: 0.55, run: 0.8, sprint: 1 });
    expect(getSpeedCap(ATTRS, 'walk', 1)).toBeCloseTo(2.8);
    expect(getSpeedCap(ATTRS, 'run', 1)).toBeCloseTo(6.4);
    expect(getSpeedCap(ATTRS, 'sprint', 1)).toBe(8);
  });

  it('drains fastest when sprinting and never below zero', () => {
    const drained = (mode: 'walk' | 'run' | 'sprint') => 1 - drainStamina(1, ATTRS, mode, 5, 5, 1);
    expect(drained('sprint')).toBeGreaterThan(drained('run'));
    expect(drained('run')).toBeGreaterThan(drained('walk'));
    expect(drainStamina(0.001, ATTRS, 'sprint', 8, 8, 10)).toBe(0);
    expect(drainStamina(0.5, ATTRS, 'sprint', 0, 8, 1)).toBe(0.5);
  });

  it('limits sprint speed when stamina is low', () => {
    expect(staminaSpeedCeiling(0.5)).toBe(1);
    expect(staminaSpeedCeiling(0)).toBeCloseTo(0.7);
    expect(getSpeedCap(ATTRS, 'sprint', 0)).toBeCloseTo(5.6);
    expect(getSpeedCap(ATTRS, 'walk', 0)).toBeCloseTo(2.8);
  });
});
