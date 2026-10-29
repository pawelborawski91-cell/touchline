import {
  createSimulationState,
  MatchEngine,
  planMovement,
  SimulationClock,
  simulateTurn,
  stepExecution,
  ticksPerTurn,
  type SimulationState,
} from '@touchline/match-engine';
import { createInitialMatch, type Vector2 } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const PLAYER = 'north-city-9';

function pathFrom(start: Vector2): Vector2[] {
  return [start, { x: start.x + 15, y: start.y + 6 }, { x: start.x + 25, y: start.y - 4 }];
}

function plannedState(): SimulationState {
  const state = createSimulationState(createInitialMatch());
  const start = state.players.find((p) => p.id === PLAYER)!.position;
  return planMovement(state, PLAYER, pathFrom(start), { movementMode: 'sprint' }).state;
}

function plannedEngine(): MatchEngine {
  const engine = new MatchEngine(createInitialMatch());
  const start = engine.getState().players.find((p) => p.id === PLAYER)!.position;
  engine.planMovement(PLAYER, pathFrom(start), { movementMode: 'sprint' });
  return engine;
}

function runFrames(engine: MatchEngine, deltas: readonly number[]): void {
  let i = 0;
  while (engine.getState().phase === 'execution') {
    engine.advanceFrame(deltas[i % deltas.length]!);
    i += 1;
    if (i > 100_000) throw new Error('turn never finished');
  }
}

describe('SimulationClock', () => {
  it('turns real time into whole fixed steps and keeps the remainder', () => {
    const clock = new SimulationClock();
    expect(clock.advance(0.03)).toBe(0);
    expect(clock.alpha).toBeCloseTo(0.6);
    expect(clock.advance(0.03)).toBe(1);
    expect(clock.alpha).toBeCloseTo(0.2);
  });

  it('counts three 60 FPS frames as exactly one step', () => {
    const clock = new SimulationClock();
    const steps = [1 / 60, 1 / 60, 1 / 60].map((dt) => clock.advance(dt));
    expect(steps).toEqual([0, 0, 1]);
  });

  it('clamps long frames (backgrounding, stalls) and caps steps per frame', () => {
    const clock = new SimulationClock();
    expect(clock.advance(30)).toBe(5);
    expect(clock.alpha).toBe(0);
    const small = new SimulationClock({
      fixedDeltaTime: 0.05,
      maxFrameDelta: 1,
      maxStepsPerFrame: 3,
    });
    expect(small.advance(1)).toBe(3);
    expect(small.alpha).toBe(0);
  });

  it('ignores negative and non-finite deltas', () => {
    const clock = new SimulationClock();
    expect(clock.advance(-1)).toBe(0);
    expect(clock.advance(Number.NaN)).toBe(0);
    expect(clock.advance(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clock.alpha).toBe(0);
  });
});

describe('turn timing', () => {
  it('runs exactly 100 fixed ticks per 5 s turn', () => {
    expect(ticksPerTurn()).toBe(100);
    const after = simulateTurn(plannedState());
    expect(after.phase).toBe('planning');
    expect(after.tick).toBe(100);
    expect(after.turn).toBe(2);
    const second = simulateTurn(after);
    expect(second.tick).toBe(200);
    expect(second.turn).toBe(3);
  });

  it('gives identical results for different frame-delta sequences', () => {
    const sequences = [[1 / 60], [1 / 30], [0.05], [0.016, 0.017, 0.0167, 0.033], [0.2, 0.01]];
    const finals = sequences.map((deltas) => {
      const engine = plannedEngine();
      engine.commitPlans();
      runFrames(engine, deltas);
      return engine.getState();
    });
    for (const final of finals) {
      expect(final.tick).toBe(100);
      expect(final.players).toEqual(finals[0]!.players);
      expect(final.commands).toEqual(finals[0]!.commands);
      expect(final.pathStates).toEqual(finals[0]!.pathStates);
    }
    const headless = simulateTurn(plannedState());
    expect(headless.players).toEqual(finals[0]!.players);
  });

  it('is deterministic across repeated runs', () => {
    const a = simulateTurn(simulateTurn(plannedState()));
    const b = simulateTurn(simulateTurn(plannedState()));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does not advance while planning', () => {
    const engine = plannedEngine();
    const before = engine.getState();
    expect(engine.advanceFrame(1)).toBe(0);
    expect(engine.getState()).toBe(before);
    expect(() => stepExecution(before)).toThrow(/advance the simulation during planning/);
    engine.commitPlans();
    runFrames(engine, [0.05]);
    const done = engine.getState();
    expect(done.phase).toBe('planning');
    expect(engine.advanceFrame(1)).toBe(0);
    expect(engine.getState()).toBe(done);
  });

  it('survives a long stall: a huge frame runs at most a few steps', () => {
    const engine = plannedEngine();
    engine.commitPlans();
    expect(engine.advanceFrame(600)).toBe(5);
    expect(engine.getState().tick).toBe(5);
  });

  it('simulates nothing while suspended (app in background) and resumes on request', () => {
    const engine = plannedEngine();
    engine.commitPlans();
    for (let i = 0; i < 20; i += 1) engine.advanceFrame(0.05);
    engine.suspend();
    const held = engine.getState();
    expect(engine.isSuspended).toBe(true);
    expect(engine.getView().suspended).toBe(true);
    for (let i = 0; i < 1000; i += 1) expect(engine.advanceFrame(0.25)).toBe(0);
    expect(engine.getState()).toBe(held);
    engine.resume();
    expect(engine.advanceFrame(0.05)).toBe(1);
    expect(engine.getState().tick).toBe(held.tick + 1);
  });

  it('locks the plan during execution and unlocks it for the next turn', () => {
    const engine = plannedEngine();
    engine.commitPlans();
    const path = [
      { x: 1, y: 1 },
      { x: 5, y: 5 },
    ];
    expect(() => engine.planMovement('north-city-1', path)).toThrow(/edit plans during execution/);
    runFrames(engine, [0.05]);
    expect(engine.getView().phase).toBe('planning');
    expect(engine.getView().turn).toBe(2);
    engine.planMovement('north-city-1', path);
    expect(engine.getView().commands.commands.some((c) => c.playerId === 'north-city-1')).toBe(
      true,
    );
  });

  it('interpolates between the last two ticks without mutating the simulation', () => {
    const engine = plannedEngine();
    engine.commitPlans();
    for (let i = 0; i < 30; i += 1) engine.advanceFrame(0.05);
    engine.advanceFrame(0.025);
    const state = engine.getState();
    const index = state.players.findIndex((p) => p.id === PLAYER);
    const snapshot = engine.getInterpolatedSnapshot();
    const frame = engine.writeFrame([]);
    const x = snapshot.players[index]!.position.x;
    expect(engine.alpha).toBeCloseTo(0.5);
    expect(x).toBeLessThan(state.players[index]!.position.x);
    expect(frame[index * 4]).toBeCloseTo(x);
    expect(frame[index * 4 + 1]).toBeCloseTo(snapshot.players[index]!.position.y);
    expect(frame[index * 4 + 3]).toBeGreaterThanOrEqual(1);
    expect(frame[0 * 4 + 3]).toBe(-1);
    expect(engine.getState()).toBe(state);
  });

  it('notifies view subscribers rarely and tick subscribers every simulated tick', () => {
    const engine = plannedEngine();
    let views = 0;
    let ticks = 0;
    engine.subscribe(() => {
      views += 1;
    });
    engine.subscribeTicks(() => {
      ticks += 1;
    });
    engine.commitPlans();
    expect(views).toBe(1);
    for (let i = 0; i < 10; i += 1) engine.advanceFrame(0.05);
    expect(views).toBe(1);
    expect(ticks).toBe(11);
    expect(engine.getTurnSnapshot()).toMatchObject({ turnTick: 10, remainingSeconds: 4.5 });
    runFrames(engine, [0.05]);
    expect(views).toBeGreaterThanOrEqual(2);
    expect(engine.getView().phase).toBe('planning');
  });
});
