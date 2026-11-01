import {
  commitPlans,
  createSimulationState,
  planMovement,
  stepExecution,
  type SimulationState,
  MANUAL_ONLY_SIMULATION_CONFIG,
} from '@touchline/match-engine';
import { getSpeedCap } from '@touchline/physics';
import { createInitialMatch, type MovementMode, type Vector2 } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

// Movement and command physics in isolation: uncommanded players stand still.
const config = MANUAL_ONLY_SIMULATION_CONFIG;

const DT = 0.05;

interface Trace {
  positions: Vector2[];
  speeds: number[];
  facings: number[];
  completedAtTick: number | null;
  final: SimulationState;
  cap: number;
}

/** Plans one command, then executes turns until it completes (at most three turns). */
function execute(playerId: string, waypoints: Vector2[], mode: MovementMode): Trace {
  let state = createSimulationState(createInitialMatch());
  const player = state.players.find((p) => p.id === playerId)!;
  const cap = getSpeedCap(player.movement, mode, player.staminaCurrent);
  state = planMovement(state, playerId, [player.position, ...waypoints], {
    movementMode: mode,
  }).state;
  const trace: Trace = {
    positions: [player.position],
    speeds: [0],
    facings: [player.facing],
    completedAtTick: null,
    final: state,
    cap,
  };
  for (let turn = 0; turn < 3 && trace.completedAtTick === null; turn += 1) {
    state = commitPlans(state, config);
    while (state.phase === 'execution') {
      state = stepExecution(state, config);
      const p = state.players.find((x) => x.id === playerId)!;
      trace.positions.push(p.position);
      trace.speeds.push(Math.hypot(p.velocity.x, p.velocity.y));
      trace.facings.push(p.facing);
      if (trace.completedAtTick === null && state.commands.commands[0]!.status === 'completed') {
        trace.completedAtTick = state.tick;
      }
    }
  }
  trace.final = state;
  return trace;
}

function maxStep(positions: readonly Vector2[]): number {
  let max = 0;
  for (let i = 1; i < positions.length; i += 1) {
    max = Math.max(
      max,
      Math.hypot(positions[i]!.x - positions[i - 1]!.x, positions[i]!.y - positions[i - 1]!.y),
    );
  }
  return max;
}

function expectNaturalMovement(trace: Trace, end: Vector2): void {
  expect(trace.completedAtTick).not.toBeNull();
  // No teleporting: a tick can never move further than the speed cap allows.
  expect(maxStep(trace.positions)).toBeLessThanOrEqual(trace.cap * DT + 1e-9);
  // Speed never exceeds the mode cap and never jumps.
  for (let i = 1; i < trace.speeds.length; i += 1) {
    expect(trace.speeds[i]!).toBeLessThanOrEqual(trace.cap + 1e-9);
    expect(Math.abs(trace.speeds[i]! - trace.speeds[i - 1]!)).toBeLessThanOrEqual(6 * DT + 1e-9);
  }
  const final = trace.positions.at(-1)!;
  expect(Math.hypot(final.x - end.x, final.y - end.y)).toBeLessThanOrEqual(0.25);
  expect(trace.speeds.at(-1)).toBe(0);
  for (const p of trace.positions) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(105);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(68);
  }
}

describe('movement scenarios', () => {
  it('A: straight sprint accelerates, holds top speed, brakes and stops on the target', () => {
    const end = { x: 72, y: 34 };
    const trace = execute('north-city-9', [end], 'sprint');
    expectNaturalMovement(trace, end);
    const peak = Math.max(...trace.speeds);
    expect(peak).toBeGreaterThan(trace.cap * 0.95);
    // Acceleration phase: about 3 s to get near top speed, not instant.
    expect(trace.speeds[10]!).toBeLessThan(trace.cap * 0.4);
    // No overshoot past the destination along the run.
    expect(Math.max(...trace.positions.map((p) => p.x))).toBeLessThanOrEqual(end.x + 0.25);
    // It slows down before the end rather than stopping dead.
    const peakIndex = trace.speeds.indexOf(peak);
    expect(trace.speeds.length - peakIndex).toBeGreaterThan(15);
  });

  it('B: curved run follows the drawn curve smoothly', () => {
    const start = createInitialMatch().players.find((p) => p.id === 'north-city-7')!.position;
    // Quarter circle of radius 15 m, tangent to the player's initial heading (+x), curving to −y.
    const centre = { x: start.x, y: start.y - 15 };
    const curve: Vector2[] = [];
    for (let i = 1; i <= 16; i += 1) {
      const a = Math.PI / 2 - (i / 16) * (Math.PI / 2);
      curve.push({ x: centre.x + 15 * Math.cos(a), y: centre.y + 15 * Math.sin(a) });
    }
    const trace = execute('north-city-7', curve, 'run');
    expectNaturalMovement(trace, curve.at(-1)!);
    // Stays close to the circle the whole way (no corner cutting or wide drift).
    for (const p of trace.positions) {
      expect(Math.abs(Math.hypot(p.x - centre.x, p.y - centre.y) - 15)).toBeLessThan(1);
    }
    // Heading turns progressively, never more than the turn rate allows in one tick.
    for (let i = 1; i < trace.facings.length; i += 1) {
      const d = Math.abs(
        Math.atan2(
          Math.sin(trace.facings[i]! - trace.facings[i - 1]!),
          Math.cos(trace.facings[i]! - trace.facings[i - 1]!),
        ),
      );
      expect(d).toBeLessThan(0.5);
    }
  });

  it('C: sharp turn brakes into the corner, turns, then decelerates to a stop', () => {
    const corner = { x: 48, y: 22 };
    const end = { x: 48, y: 36 };
    const trace = execute('north-city-10', [corner, end], 'run');
    expectNaturalMovement(trace, end);
    const nearCorner = trace.positions
      .map((p, i) => ({ d: Math.hypot(p.x - corner.x, p.y - corner.y), i }))
      .sort((a, b) => a.d - b.d)[0]!;
    // Passes close to the corner without overshooting it by more than ~1 m.
    expect(nearCorner.d).toBeLessThan(1);
    expect(Math.max(...trace.positions.map((p) => p.x))).toBeLessThanOrEqual(corner.x + 1);
    // Slower at the corner than on the straight before it.
    const before = Math.max(...trace.speeds.slice(0, nearCorner.i));
    expect(trace.speeds[nearCorner.i]!).toBeLessThan(before);
  });
});
