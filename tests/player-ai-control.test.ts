import {
  advanceAI,
  commitPlans,
  MatchEngine,
  planMovement,
  setPlayerActive,
  stepExecution,
  type SimulationState,
} from '@touchline/match-engine';
import {
  goalkeeperTarget,
  inOwnPenaltyArea,
  ROLE_PROFILES,
  type AttackDirection,
  type BehaviorId,
} from '@touchline/player-ai';
import { createInitialMatch, FIELD_LENGTH, FIELD_WIDTH } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

import {
  ballAtFeetOf,
  behaviorOf,
  config,
  dist,
  finishTurn,
  HOME,
  player,
  run,
  setupMatch,
  speedOf,
  team,
} from './ai-fixtures';

describe('AI and the turn cycle', () => {
  it('runs only during execution and freezes during planning', () => {
    const planning = setupMatch({ ball: { x: 42.3, y: 34 } });
    expect(advanceAI(planning, config)).toBe(planning);
    const executed = finishTurn(planning);
    expect(executed.phase).toBe('planning');
    expect(executed.ai.lastUpdateTick).toBe(executed.tick - 1);
    expect(advanceAI(executed, config)).toBe(executed);
  });

  it('keeps decisions and team states across the turn boundary', () => {
    const ended = finishTurn(setupMatch({ ball: { x: 42.3, y: 34 } }));
    const committed = commitPlans(ended, config);
    expect(committed.ai).toBe(ended.ai);
    const next = stepExecution(committed, config);
    // The first tick of the new turn is a normal AI tick, not a reset.
    expect(next.ai.possession.possessingTeamId).toBe(ended.ai.possession.possessingTeamId);
    for (const [id, memory] of Object.entries(ended.ai.players)) {
      expect(memory.decision).not.toBeNull();
      expect(next.ai.players[id]!.switchedAtTick).toBeLessThanOrEqual(next.tick);
    }
    const unchanged = Object.keys(ended.ai.players).filter(
      (id) =>
        next.ai.players[id]!.decision?.behaviorId === ended.ai.players[id]!.decision?.behaviorId,
    );
    expect(unchanged.length).toBeGreaterThan(15);
  });

  it('never touches the command book', () => {
    let state = setupMatch({ ball: { x: 42.3, y: 34 } });
    state = planMovement(state, 'north-city-7', [
      player(state, 'north-city-7').position,
      { x: 60, y: 60 },
    ]).state;
    state = commitPlans(state, config);
    for (let i = 0; i < 60; i += 1) {
      const after = advanceAI(state, config);
      expect(after.commands).toBe(state.commands);
      expect(after.players).toBe(state.players);
      expect(after.ball).toBe(state.ball);
      state = stepExecution(state, config);
    }
  });

  it('inactive players get no intent and slow to a stop; availability is a planning action', () => {
    let state = finishTurn(setupMatch({ ball: ballAtFeetOf(setupMatch(), 'north-city-6', 1) }));
    const id = 'north-city-8';
    expect(speedOf(player(state, id))).toBeGreaterThan(0.5);
    state = setPlayerActive(state, id, false);
    state = run(state, 60);
    expect(state.ai.players[id]!.controlMode).toBe('inactive');
    expect(state.ai.players[id]!.intent).toBeNull();
    expect(speedOf(player(state, id))).toBe(0);
    expect(() => setPlayerActive(commitPlans(finishTurn(state), config), id, true)).toThrow();
    state = setPlayerActive(finishTurn(state), id, true);
    state = run(state, 2);
    expect(state.ai.players[id]!.controlMode).toBe('autonomous');
    expect(state.ai.players[id]!.intent).not.toBeNull();
  });

  it('the engine exposes AI debug data without changing the simulation', () => {
    const engine = new MatchEngine(createInitialMatch());
    engine.commitPlans();
    for (let i = 0; i < 30; i += 1) engine.advanceFrame(config.match.fixedDeltaTime);
    const before = engine.getState();
    const info = engine.getAIDebugInfo();
    engine.getDebugInfo('north-city-9');
    expect(engine.getState()).toBe(before);
    expect(info.enabled).toBe(true);
    expect(info.players).toHaveLength(22);
    expect(info.teams.map((t) => t.formationId)).toEqual(['4-3-3', '4-3-3']);
    for (const p of info.players) {
      expect(p.controlMode).toBe('autonomous');
      expect(info.secondsSinceDecision[p.playerId]).toBeGreaterThanOrEqual(0);
      expect(info.secondsSinceDecision[p.playerId]).toBeLessThanOrEqual(
        config.ai.decisionIntervalTicks * 2 * config.match.fixedDeltaTime + 1e-9,
      );
    }
  });

  it('reports formation roles before the first execution tick', () => {
    const info = new MatchEngine(createInitialMatch()).getAIDebugInfo();
    const roleOf = (id: string) => info.players.find((p) => p.playerId === id)?.role;
    expect(info.lastUpdateTick).toBeNull();
    expect(roleOf('north-city-1')).toBe('GK');
    expect(roleOf('north-city-5')).toBe('CB');
    expect(roleOf('south-united-7')).toBe('WG');
    expect(roleOf('south-united-9')).toBe('ST');
  });
});

describe('roles', () => {
  const weight = (role: keyof typeof ROLE_PROFILES, id: BehaviorId) =>
    ROLE_PROFILES[role].weights[id] ?? 0;

  it('differentiate behavior through their weights', () => {
    expect(weight('GK', 'protect_goal')).toBe(1);
    for (const role of ['CB', 'FB', 'DM', 'CM', 'AM', 'WG', 'ST'] as const) {
      expect(weight(role, 'protect_goal')).toBe(0);
    }
    expect(weight('CB', 'forward_run')).toBe(0);
    expect(weight('CB', 'attack_box')).toBe(0);
    expect(weight('ST', 'attack_box')).toBeGreaterThan(weight('CM', 'attack_box'));
    expect(weight('WG', 'hold_width')).toBeGreaterThan(weight('CM', 'hold_width'));
    expect(weight('DM', 'defensive_cover')).toBeGreaterThan(weight('AM', 'defensive_cover'));
    expect(weight('CB', 'hold_line')).toBeGreaterThan(weight('ST', 'hold_line'));
    expect(ROLE_PROFILES.ST.pressRange).toBeGreaterThan(ROLE_PROFILES.CB.pressRange);
    expect(ROLE_PROFILES.CB.leash).toBeLessThan(ROLE_PROFILES.WG.leash);
  });

  it('the goalkeeper stays in his box on the goal–ball line', () => {
    for (const direction of [1, -1] as AttackDirection[]) {
      for (let x = 0; x <= FIELD_LENGTH; x += 7.5) {
        for (let y = 0; y <= FIELD_WIDTH; y += 8.5) {
          const target = goalkeeperTarget({ x, y }, direction, direction === 1 ? 30 : 75);
          expect(inOwnPenaltyArea(target, direction)).toBe(true);
        }
      }
      const goalX = direction === 1 ? 0 : FIELD_LENGTH;
      const near = goalkeeperTarget({ x: goalX + direction * 12, y: 20 }, direction, 30);
      expect(near.y).toBeLessThan(FIELD_WIDTH / 2);
    }
  });

  it('play their part in a match: keeper home, centre-backs deep, wingers wide', () => {
    const states: SimulationState[] = [];
    finishTurn(
      finishTurn(setupMatch({ ball: ballAtFeetOf(setupMatch(), 'north-city-6', 1) }), (s) =>
        states.push(s),
      ),
      (s) => states.push(s),
    );
    for (const s of states) {
      expect(behaviorOf(s, 'north-city-1')).toBe('protect_goal');
      for (const id of ['north-city-4', 'north-city-5']) {
        expect(['forward_run', 'attack_box', 'counter_run']).not.toContain(behaviorOf(s, id));
      }
    }
    const end = states
      .filter((s) => s.tick >= 40 && team(s, HOME).playState === 'attacking')
      .pop()!;
    expect(end).toBeDefined();
    const rw = player(end, 'north-city-7');
    const cb = player(end, 'north-city-5');
    expect(Math.abs(rw.position.y - FIELD_WIDTH / 2)).toBeGreaterThan(18);
    expect(rw.position.x).toBeGreaterThan(cb.position.x + 25);
  });
});

describe('stability over a long run', () => {
  // Six turns of autonomous play (30 simulated seconds) from a kick-off with the ball loose.
  const states: SimulationState[] = [];
  let state = setupMatch({ ball: { x: 52.5, y: 34 } });
  for (let turn = 0; turn < 6 && state.phase === 'planning'; turn += 1) {
    state = finishTurn(state, (s) => states.push(s));
  }

  it('one presser and one chaser at most, one marker per opponent', () => {
    for (const s of states) {
      for (const t of Object.values(s.ai.teams)) {
        const pressing = s.players.filter(
          (p) => p.teamId === t.teamId && behaviorOf(s, p.id) === 'press_carrier',
        );
        expect(pressing.length).toBeLessThanOrEqual(1);
        const chasing = s.players.filter(
          (p) => p.teamId === t.teamId && behaviorOf(s, p.id) === 'chase_loose_ball',
        );
        expect(chasing.length).toBeLessThanOrEqual(1);
        const marked = Object.values(t.marks);
        expect(new Set(marked).size).toBe(marked.length);
      }
    }
  });

  it('never sends a crowd to the ball', () => {
    for (const s of states) {
      const ball = s.ball.ball.position;
      const carrier = s.ball.ball.controllerPlayerId;
      for (const teamId of Object.keys(s.ai.teams)) {
        const near = s.players.filter(
          (p) => p.teamId === teamId && p.id !== carrier && dist(p.position, ball) < 5,
        );
        expect(near.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('switches behavior at a calm rate and rarely flips back', () => {
    const history: Record<string, { tick: number; from: BehaviorId; to: BehaviorId }[]> = {};
    for (let i = 1; i < states.length; i += 1) {
      for (const [id, memory] of Object.entries(states[i]!.ai.players)) {
        const from = states[i - 1]!.ai.players[id]!.decision?.behaviorId;
        const to = memory.decision?.behaviorId;
        if (from && to && from !== to)
          (history[id] ??= []).push({ tick: states[i]!.tick, from, to });
      }
    }
    const seconds = states.length * config.match.fixedDeltaTime;
    let flips = 0;
    let switches = 0;
    for (const list of Object.values(history)) {
      switches += list.length;
      for (let i = 1; i < list.length; i += 1) {
        if (list[i]!.to === list[i - 1]!.from && list[i]!.tick - list[i - 1]!.tick <= 10)
          flips += 1;
      }
    }
    // Under one switch per player every 1.5 s on average; quick A→B→A flips are rare.
    expect(switches / 22 / seconds).toBeLessThan(1 / 1.5);
    expect(flips / switches).toBeLessThan(0.2);
  });

  it('keeps every AI target on the pitch', () => {
    for (const s of states) {
      for (const memory of Object.values(s.ai.players)) {
        const target = memory.intent?.targetPosition;
        if (!target) continue;
        expect(target.x).toBeGreaterThanOrEqual(0);
        expect(target.x).toBeLessThanOrEqual(FIELD_LENGTH);
        expect(target.y).toBeGreaterThanOrEqual(0);
        expect(target.y).toBeLessThanOrEqual(FIELD_WIDTH);
      }
    }
  });
});

describe('performance', () => {
  it('updates 22 players well within the 50 ms tick budget', () => {
    let state = commitPlans(setupMatch({ ball: { x: 52.5, y: 34 } }), config);
    const ticks = 100;
    let aiTime = 0;
    for (let i = 0; i < ticks && state.phase === 'execution'; i += 1) {
      const start = performance.now();
      advanceAI(state, config);
      aiTime += performance.now() - start;
      state = stepExecution(state, config);
    }
    expect(state.players).toHaveLength(22);
    // Generous bound so slow CI machines pass; typical is well under 1 ms per tick.
    expect(aiTime / ticks).toBeLessThan(5);
  });
});
