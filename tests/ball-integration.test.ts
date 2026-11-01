import type { BallEvent } from '@touchline/ball-engine';
import {
  commitPlans,
  createSimulationState,
  MANUAL_ONLY_SIMULATION_CONFIG,
  MatchEngine,
  placeBall,
  planKick,
  planMovement,
  simulateTurn,
  stepExecution,
  writeInterpolatedFrame,
  type SimulationState,
} from '@touchline/match-engine';
import {
  ballFrameOffset,
  BALL_FRAME_SIZE,
  createInitialMatch,
  PLAYER_FRAME_STRIDE,
  type MatchPlayer,
} from '@touchline/shared';
import { describe, expect, it } from 'vitest';

// Ball physics in isolation: uncommanded players stand still (the AI has its own suites).
const config = MANUAL_ONLY_SIMULATION_CONFIG;
const STRIKER = 'north-city-9';
const WINGER = 'north-city-7';

const player = (state: SimulationState, id: string): MatchPlayer =>
  state.players.find((p) => p.id === id)!;

const ballToPlayer = (state: SimulationState, id: string): number => {
  const p = player(state, id);
  const { position } = state.ball.ball;
  return Math.hypot(position.x - p.position.x, position.y - p.position.y);
};

/** Runs execution tick by tick, collecting every state and ball event of the window. */
function runWindow(state: SimulationState): {
  state: SimulationState;
  states: SimulationState[];
  events: BallEvent[];
} {
  let current = state;
  const states: SimulationState[] = [];
  const events: BallEvent[] = [];
  while (current.phase === 'execution') {
    const next = stepExecution(current, config);
    const seen = new Set(current.recentEvents);
    events.push(...next.recentEvents.filter((event) => !seen.has(event)));
    states.push(next);
    current = next;
  }
  return { state: current, states, events };
}

describe('ball integration: dribble, pass, receive across turn boundaries', () => {
  it('runs the mandatory possession scenario with all 22 players', () => {
    // 1–2. Two full teams; the ball is placed next to the home striker.
    let state = createSimulationState(createInitialMatch());
    expect(new Set(state.players.map((p) => p.teamId)).size).toBe(2);
    expect(state.players).toHaveLength(22);
    state = placeBall(state, { x: 42.6, y: 34 }, config);
    expect(state.ball.ball.possessionState).toBe('free');

    // 4. The striker is ordered forward; the ball is not attached to him.
    state = planMovement(
      state,
      STRIKER,
      [
        { x: 42, y: 34 },
        { x: 52, y: 34 },
      ],
      { movementMode: 'jog' },
    ).state;
    const turn1 = runWindow(commitPlans(state, config));

    // 3. He gains control on his first touch.
    const gained = turn1.events.find((e) => e.type === 'control_gained');
    expect(gained).toMatchObject({ playerId: STRIKER });
    expect(turn1.states[0]!.ball.ball.controllerPlayerId).toBe(STRIKER);

    // 5. The ball follows through repeated, separate dribble touches, never a fixed offset.
    const dribbles = turn1.events.filter(
      (e) => e.type === 'touch' && e.kind === 'dribble' && e.playerId === STRIKER,
    );
    expect(dribbles.length).toBeGreaterThanOrEqual(5);
    const distances = turn1.states.map((s) => ballToPlayer(s, STRIKER));
    expect(Math.max(...distances)).toBeLessThan(config.ball.loseDistance);
    expect(Math.max(...distances) - Math.min(...distances)).toBeGreaterThan(0.1);
    expect(turn1.states.every((s) => s.ball.ball.controllerPlayerId === STRIKER)).toBe(true);
    expect(player(turn1.state, STRIKER).position.x).toBeGreaterThan(50);
    expect(turn1.state.ball.ball.position.x).toBeGreaterThan(50);

    // 9–10. Turn boundary: the ball is carried over untouched.
    state = turn1.state;
    expect(state.phase).toBe('planning');
    expect(state.turn).toBe(2);
    expect(state.ball).toBe(turn1.states.at(-1)!.ball);

    // 6. The striker passes to the winger.
    state = planKick(
      state,
      { playerId: STRIKER, type: 'pass', target: { ...player(state, WINGER).position } },
      config,
    );
    const turn2 = runWindow(commitPlans(state, config));
    const kick = turn2.events.find((e) => e.type === 'kick');
    expect(kick).toMatchObject({ playerId: STRIKER, kickType: 'pass' });
    expect(turn2.events).toContainEqual(
      expect.objectContaining({ type: 'control_lost', playerId: STRIKER, reason: 'kicked' }),
    );

    // 7. The ball travels on its own: free, moving, away from both players for a while.
    const inFlight = turn2.states.filter((s) => s.ball.ball.possessionState === 'free');
    expect(inFlight.length).toBeGreaterThan(20);
    const midway = inFlight[Math.floor(inFlight.length / 2)]!;
    expect(ballToPlayer(midway, STRIKER)).toBeGreaterThan(3);
    expect(ballToPlayer(midway, WINGER)).toBeGreaterThan(3);

    // 8. The winger receives it.
    const received = turn2.events.find((e) => e.type === 'control_gained');
    expect(received).toMatchObject({ playerId: WINGER });
    expect(turn2.state.ball.ball.controllerPlayerId).toBe(WINGER);
    expect(turn2.state.ball.ball.lastTouchPlayerId).toBe(WINGER);
    expect(ballToPlayer(turn2.state, WINGER)).toBeLessThan(config.ball.controlReach);

    // 9–10. Second boundary: possession and ball state survive into turn 3.
    expect(turn2.state.phase).toBe('planning');
    expect(turn2.state.turn).toBe(3);
    expect(turn2.state.ball).toBe(turn2.states.at(-1)!.ball);
    expect(turn2.state.plannedKicks).toEqual({});
  });
});

describe('ball and the turn lifecycle', () => {
  const kickedState = () => {
    let state = createSimulationState(createInitialMatch());
    state = placeBall(state, { x: 29.6, y: 34 }, config);
    return planKick(
      state,
      { playerId: 'north-city-6', type: 'lob', target: { x: 50, y: 34 } },
      config,
    );
  };

  it('freezes the ball during planning and never resets it at a boundary', () => {
    let state = commitPlans(kickedState(), config);
    for (let i = 0; i < 10; i += 1) state = stepExecution(state, config);
    expect(state.ball.ball.position.z).toBeGreaterThan(1);
    const engine = new MatchEngine(createInitialMatch(), { config });
    engine.placeBall({ x: 29.6, y: 34 });
    engine.planKick({ playerId: 'north-city-6', type: 'lob', target: { x: 50, y: 34 } });
    engine.commitPlans();
    while (engine.getState().phase === 'execution') engine.advanceFrame(0.05);
    const atBoundary = engine.getBall();
    expect(engine.getState().phase).toBe('planning');
    expect(engine.advanceFrame(10)).toBe(0);
    expect(engine.getBall()).toBe(atBoundary);
    expect(engine.getView().ball).toBe(atBoundary);
  });

  it('keeps an unfired kick order across turns until the player can strike', () => {
    let state = createSimulationState(createInitialMatch());
    state = planKick(
      state,
      { playerId: 'north-city-6', type: 'pass', target: { x: 40, y: 20 } },
      config,
    );
    state = simulateTurn(state, config);
    expect(state.plannedKicks['north-city-6']).toBeDefined();
    expect(state.ball.ball.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('is deterministic: identical inputs give identical ball states', () => {
    const run = () => {
      let state = commitPlans(kickedState(), config);
      while (state.phase === 'execution') state = stepExecution(state, config);
      return state.ball;
    };
    expect(run()).toEqual(run());
  });

  it('calls a stoppage when the ball goes out of play, and Drop ball brings it back', () => {
    let state = createSimulationState(createInitialMatch());
    state = placeBall(state, { x: 29.6, y: 34 }, config);
    state = planKick(
      state,
      { playerId: 'north-city-6', type: 'pass', target: { x: 29.6, y: -5 }, power: 1 },
      config,
    );
    const window = runWindow(commitPlans(state, config));
    expect(window.state.phase).toBe('stoppage');
    expect(window.state.ball.ball.isOutOfPlay).toBe(true);
    expect(window.state.ball.ball.possessionState).toBe('out_of_play');
    expect(window.events.at(-1)).toMatchObject({
      type: 'out_of_play',
      lastTouchTeamId: 'north-city',
    });
    const engine = new MatchEngine(createInitialMatch(), { config });
    engine.placeBall({ x: 29.6, y: 34 });
    engine.planKick({
      playerId: 'north-city-6',
      type: 'pass',
      target: { x: 29.6, y: -5 },
      power: 1,
    });
    engine.commitPlans();
    for (let i = 0; i < 200 && engine.getState().phase === 'execution'; i += 1)
      engine.advanceFrame(0.05);
    expect(engine.getState().phase).toBe('stoppage');
    expect(engine.getDebugInfo().ball.isOutOfPlay).toBe(true);
    engine.endStoppage();
    engine.placeBall({ x: 30, y: 3 });
    expect(engine.getBall()).toMatchObject({ isOutOfPlay: false, possessionState: 'free' });
  });

  it('writes the ball after the players in the render frame', () => {
    let state = commitPlans(kickedState(), config);
    const previous = state;
    state = stepExecution(state, config);
    const out = writeInterpolatedFrame(previous, state, 0.5, []);
    const base = ballFrameOffset(state.players.length);
    expect(base).toBe(22 * PLAYER_FRAME_STRIDE);
    expect(out).toHaveLength(base + BALL_FRAME_SIZE);
    const a = previous.ball.ball;
    const b = state.ball.ball;
    expect(out[base]).toBeCloseTo((a.position.x + b.position.x) / 2, 9);
    expect(out[base + 2]).toBeCloseTo((a.position.z + b.position.z) / 2, 9);
    expect(out[base + 5]).toBeCloseTo((a.velocity.z + b.velocity.z) / 2, 9);
  });

  it('rejects ball orders in the wrong phase', () => {
    const planning = createSimulationState(createInitialMatch());
    const engine = new MatchEngine(createInitialMatch(), { config });
    expect(() =>
      engine.kick({
        playerId: 'north-city-6',
        type: 'pass',
        direction: { x: 1, y: 0 },
        power: 0.5,
        lift: 0,
      }),
    ).toThrow(/during planning/);
    const executing = commitPlans(planning, config);
    expect(() => placeBall(executing, { x: 10, y: 10 }, config)).toThrow(/during execution/);
    expect(() =>
      planKick(
        executing,
        { playerId: 'north-city-6', type: 'pass', target: { x: 1, y: 1 } },
        config,
      ),
    ).toThrow(/during execution/);
  });

  it('stays stable with 22 players running through the ball for several turns', () => {
    let state = createSimulationState(createInitialMatch());
    state = placeBall(state, { x: 52.5, y: 34 }, config);
    for (const p of state.players) {
      if (p.role === 'GK') continue;
      state = planMovement(state, p.id, [{ ...p.position }, { x: 52.5, y: 34 }], {
        movementMode: 'sprint',
      }).state;
    }
    const touchesByPlayer = new Map<string, number>();
    let ticks = 0;
    for (let turn = 0; turn < 4; turn += 1) {
      state = commitPlans(state, config);
      while (state.phase === 'execution') {
        const before = state;
        state = stepExecution(state, config);
        ticks += 1;
        for (const event of state.recentEvents) {
          if (event.type === 'touch' && !before.recentEvents.includes(event)) {
            touchesByPlayer.set(event.playerId, (touchesByPlayer.get(event.playerId) ?? 0) + 1);
          }
        }
        const { position, velocity } = state.ball.ball;
        for (const value of [
          position.x,
          position.y,
          position.z,
          velocity.x,
          velocity.y,
          velocity.z,
        ]) {
          expect(Number.isFinite(value)).toBe(true);
        }
        expect(Math.hypot(velocity.x, velocity.y, velocity.z)).toBeLessThan(40);
        expect(position.z).toBeGreaterThanOrEqual(state.ball.ball.radius - 1e-9);
      }
      if (state.phase === 'stoppage') break;
    }
    expect(ticks).toBeGreaterThan(100);
    // No jittering contact: nobody touches the ball on most ticks.
    expect(Math.max(...touchesByPlayer.values())).toBeLessThan(ticks * 0.4);
  });
});
