import {
  applyPlanningAction,
  createSimulationState,
  MatchEngine,
  nextTurn,
  SimulationClock,
  simulateTurn,
  startExecution,
  stepTurn,
  ticksPerTurn,
  type SimulationState,
} from '@touchline/match-engine';
import { createInitialMatch } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const PLAYER = 'north-city-9';

function plannedState(): SimulationState {
  const state = createSimulationState(createInitialMatch());
  const start = state.players.find((p) => p.id === PLAYER)!.position;
  return applyPlanningAction(state, {
    type: 'replaceMovement',
    playerId: PLAYER,
    path: [start, { x: start.x + 15, y: start.y + 6 }, { x: start.x + 25, y: start.y - 4 }],
    movementMode: 'sprint',
  });
}

function plannedEngine(): MatchEngine {
  const engine = new MatchEngine(createInitialMatch());
  const start = engine.getState().players.find((p) => p.id === PLAYER)!.position;
  engine.dispatchCommand({
    type: 'replaceMovement',
    playerId: PLAYER,
    path: [start, { x: start.x + 15, y: start.y + 6 }, { x: start.x + 25, y: start.y - 4 }],
    movementMode: 'sprint',
  });
  return engine;
}

function runFrames(engine: MatchEngine, deltas: readonly number[]): void {
  let i = 0;
  while (engine.getState().phase === 'executing') {
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

  it('clamps long frames (backgrounding) and caps steps per frame', () => {
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
    expect(after.phase).toBe('turn_complete');
    expect(after.tick).toBe(100);
    expect(after.turnTick).toBe(100);
    const second = simulateTurn(nextTurn(after));
    expect(second.tick).toBe(200);
    expect(second.turn).toBe(2);
  });

  it('gives identical results for different frame-delta sequences', () => {
    const sequences = [[1 / 60], [1 / 30], [0.05], [0.016, 0.017, 0.0167, 0.033], [0.2, 0.01]];
    const finals = sequences.map((deltas) => {
      const engine = plannedEngine();
      engine.startExecution();
      runFrames(engine, deltas);
      return engine.getState();
    });
    for (const final of finals) {
      expect(final.tick).toBe(100);
      expect(final.players).toEqual(finals[0]!.players);
      expect(final.commands).toEqual(finals[0]!.commands);
    }
    const headless = simulateTurn(plannedState());
    expect(headless.players).toEqual(finals[0]!.players);
  });

  it('is deterministic across repeated runs', () => {
    const a = simulateTurn(plannedState());
    const b = simulateTurn(plannedState());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does not advance while planning or after the turn is complete', () => {
    const engine = plannedEngine();
    const before = engine.getState();
    expect(engine.advanceFrame(1)).toBe(0);
    expect(engine.getState()).toBe(before);
    expect(stepTurn(before)).toBe(before);
    engine.startExecution();
    runFrames(engine, [0.05]);
    const done = engine.getState();
    expect(done.phase).toBe('turn_complete');
    expect(engine.advanceFrame(1)).toBe(0);
    expect(engine.getState()).toBe(done);
  });

  it('survives a backgrounded app: a huge frame runs at most a few steps', () => {
    const engine = plannedEngine();
    engine.startExecution();
    expect(engine.advanceFrame(600)).toBe(5);
    expect(engine.getState().tick).toBe(5);
  });

  it('locks the plan during execution and unlocks it for the next turn', () => {
    const engine = plannedEngine();
    engine.startExecution();
    const executing = engine.getState();
    engine.dispatchCommand({
      type: 'replaceMovement',
      playerId: 'north-city-1',
      path: [
        { x: 1, y: 1 },
        { x: 5, y: 5 },
      ],
    });
    expect(engine.getState().commands).toBe(executing.commands);
    runFrames(engine, [0.05]);
    expect(engine.nextTurn()).toBe(true);
    expect(engine.getView().phase).toBe('planning');
    expect(engine.getView().turn).toBe(2);
    engine.dispatchCommand({
      type: 'replaceMovement',
      playerId: 'north-city-1',
      path: [
        { x: 1, y: 1 },
        { x: 5, y: 5 },
      ],
    });
    expect(engine.getView().commands.commands.some((c) => c.playerId === 'north-city-1')).toBe(
      true,
    );
  });

  it('interpolates between the last two ticks without mutating the simulation', () => {
    const engine = plannedEngine();
    engine.startExecution();
    for (let i = 0; i < 30; i += 1) engine.advanceFrame(0.05);
    engine.advanceFrame(0.025);
    const state = engine.getState();
    const index = state.players.findIndex((p) => p.id === PLAYER);
    const snapshot = engine.getInterpolatedSnapshot();
    const frame = engine.writeFrame([]);
    const x = snapshot.players[index]!.position.x;
    expect(engine.alpha).toBeCloseTo(0.5);
    expect(x).toBeLessThan(state.players[index]!.position.x);
    expect(frame[index * 3]).toBeCloseTo(x);
    expect(frame[index * 3 + 1]).toBeCloseTo(snapshot.players[index]!.position.y);
    expect(engine.getState()).toBe(state);
  });

  it('only notifies subscribers on plan, phase or command-status changes', () => {
    const engine = plannedEngine();
    let notifications = 0;
    engine.subscribe(() => {
      notifications += 1;
    });
    engine.startExecution();
    expect(notifications).toBe(1);
    for (let i = 0; i < 10; i += 1) engine.advanceFrame(0.05);
    expect(notifications).toBe(1);
    runFrames(engine, [0.05]);
    expect(notifications).toBeGreaterThanOrEqual(2);
    expect(engine.getView().phase).toBe('turn_complete');
  });

  it('carries momentum and the paused command into the next turn', () => {
    const state = createSimulationState(createInitialMatch());
    const start = state.players.find((p) => p.id === PLAYER)!.position;
    const planned = applyPlanningAction(state, {
      type: 'replaceMovement',
      playerId: PLAYER,
      path: [start, { x: start.x + 40, y: start.y }],
      movementMode: 'sprint',
    });
    const first = simulateTurn(planned);
    const runner = first.players.find((p) => p.id === PLAYER)!;
    expect(first.commands.commands[0]!.status).toBe('paused');
    expect(Math.hypot(runner.velocity.x, runner.velocity.y)).toBeGreaterThan(1);
    const resumed = stepTurn(startExecution(nextTurn(first)));
    const after = resumed.players.find((p) => p.id === PLAYER)!;
    expect(resumed.commands.commands[0]!.status).toBe('active');
    expect(after.position.x - runner.position.x).toBeGreaterThan(0.05);
  });
});
