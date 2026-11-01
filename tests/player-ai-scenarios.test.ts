import {
  MANUAL_ONLY_SIMULATION_CONFIG,
  planMovement,
  type SimulationState,
} from '@touchline/match-engine';
import { inOwnPenaltyArea, type BehaviorId } from '@touchline/player-ai';
import { FIELD_WIDTH } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

import {
  AWAY,
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

const BACK_FOUR = ['RB', 'RCB', 'LCB', 'LB'];

const outfield = (state: SimulationState, teamId: string) =>
  state.players.filter((p) => p.teamId === teamId && p.role !== 'GK');

const bySlot = (state: SimulationState, teamId: string, slot: string) =>
  state.players.find((p) => p.teamId === teamId && p.role === slot)!;

/** Teammates of the ball carrier (or everyone, without one) within `radius` of the ball. */
function crowd(state: SimulationState, teamId: string, radius: number): number {
  const ball = state.ball.ball.position;
  const carrier = state.ball.ball.controllerPlayerId;
  return state.players.filter(
    (p) => p.teamId === teamId && p.id !== carrier && dist(p.position, ball) <= radius,
  ).length;
}

function behaviorsOf(state: SimulationState, teamId: string): Set<BehaviorId> {
  const ids = new Set<BehaviorId>();
  for (const p of state.players) {
    const id = behaviorOf(state, p.id);
    if (p.teamId === teamId && id) ids.add(id);
  }
  return ids;
}

function possessionFor(carrierId: string, direction: 1 | -1): SimulationState {
  const base = setupMatch();
  return setupMatch({ ball: ballAtFeetOf(base, carrierId, direction) });
}

describe('scenario A: attacking possession', () => {
  // The home holding midfielder has the ball in midfield; the first 3.5 s, before the opposing
  // striker's press arrives.
  const states: SimulationState[] = [];
  const state = run(possessionFor('north-city-6', 1), 70, (s) => states.push(s));

  it('keeps the ball with the carrier, who dribbles forward', () => {
    expect(state.ball.ball.controllerPlayerId).toBe('north-city-6');
    expect(behaviorOf(state, 'north-city-6')).toBe('carry_ball');
    expect(player(state, 'north-city-6').position.x).toBeGreaterThan(36);
    expect(team(state, HOME).playState).toBe('attacking');
    expect(team(state, AWAY).playState).toBe('defending');
  });

  it('spreads out instead of swarming the ball', () => {
    for (const s of states.slice(10)) expect(crowd(s, HOME, 8)).toBeLessThanOrEqual(2);
    expect(team(state, HOME).shape.width).toBeGreaterThan(50);
    for (const slot of ['RW', 'LW']) {
      expect(Math.abs(bySlot(state, HOME, slot).position.y - FIELD_WIDTH / 2)).toBeGreaterThan(20);
    }
  });

  it('gives the carrier support, depth and rest defence', () => {
    const carrier = player(state, 'north-city-6');
    const supporters = outfield(state, HOME).filter(
      (p) => p.id !== carrier.id && dist(p.position, carrier.position) < 16,
    );
    expect(supporters.length).toBeGreaterThanOrEqual(1);
    const striker = bySlot(state, HOME, 'ST');
    expect(striker.position.x).toBeGreaterThan(carrier.position.x + 12);
    const behind = outfield(state, HOME).filter((p) => p.position.x < carrier.position.x - 10);
    expect(behind.length).toBeGreaterThanOrEqual(2);
    expect(behaviorsOf(state, HOME).size).toBeGreaterThanOrEqual(4);
  });

  it('is defended by one presser while the rest hold the block', () => {
    const pressers = outfield(state, AWAY).filter(
      (p) => behaviorOf(state, p.id) === 'press_carrier',
    );
    expect(pressers.map((p) => p.id)).toEqual([team(state, AWAY).presserId]);
    const block = outfield(state, AWAY).filter((p) => p.id !== team(state, AWAY).presserId);
    for (const p of block) expect(p.position.x).toBeGreaterThan(state.ball.ball.position.x);
  });
});

describe('scenario B: defending', () => {
  // The away holding midfielder has the ball; home defends its goal at x = 0.
  const states: SimulationState[] = [];
  const state = run(possessionFor('south-united-6', -1), 60, (s) => states.push(s));

  it('sends exactly one presser and keeps everyone else off the ball', () => {
    expect(team(state, HOME).playState).toBe('defending');
    for (const s of states.slice(10)) {
      const home = team(s, HOME);
      const pressing = outfield(s, HOME).filter((p) => behaviorOf(s, p.id) === 'press_carrier');
      expect(pressing.length).toBeLessThanOrEqual(1);
      if (pressing.length === 1) expect(pressing[0]!.id).toBe(home.presserId);
      expect(crowd(s, HOME, 8)).toBeLessThanOrEqual(2);
    }
    expect(behaviorOf(state, team(state, HOME).presserId!)).toBe('press_carrier');
  });

  it('marks one-to-one: never two defenders on one opponent', () => {
    for (const s of states) {
      const marked = Object.values(team(s, HOME).marks);
      expect(new Set(marked).size).toBe(marked.length);
      const markers = Object.keys(team(s, HOME).marks);
      expect(markers).not.toContain(team(s, HOME).presserId);
    }
    expect(Object.keys(team(state, HOME).marks).length).toBeGreaterThanOrEqual(2);
  });

  it('stays compact and goal-side of the ball', () => {
    const ball = state.ball.ball.position;
    for (const slot of BACK_FOUR) {
      expect(bySlot(state, HOME, slot).position.x).toBeLessThan(ball.x);
    }
    expect(team(state, HOME).shape.width).toBeLessThan(team(state, AWAY).shape.width - 10);
    expect(team(state, HOME).shape.depth).toBeLessThan(team(state, AWAY).shape.depth - 8);
    expect(inOwnPenaltyArea(bySlot(state, HOME, 'GK').position, 1)).toBe(true);
    expect(behaviorOf(state, bySlot(state, HOME, 'GK').id)).toBe('protect_goal');
  });
});

describe('scenario C: turnover', () => {
  // Scenario A played on: the away striker's press wins the ball from the home carrier.
  const states: SimulationState[] = [];
  run(possessionFor('north-city-6', 1), 160, (s) => states.push(s));
  const changeIndex = states.findIndex((s) => team(s, HOME).playState === 'transition_defense');
  const changed = states[changeIndex]!;
  const before = states[changeIndex - 1]!;

  it('switches team states on the actual change of possession', () => {
    expect(changeIndex).toBeGreaterThan(60);
    for (const s of states.slice(5, changeIndex)) expect(team(s, HOME).playState).toBe('attacking');
    expect(team(changed, AWAY).playState).toBe('transition_attack');
    expect(changed.ball.ball.lastTouchTeamId).toBe(AWAY);
    const won = states.findIndex((s) => s.ball.ball.controllerPlayerId?.startsWith(AWAY));
    expect(won).toBeGreaterThan(0);
    expect(changeIndex - won).toBeLessThanOrEqual(config.ai.looseBallGraceTicks + 1);
  });

  it('reacts at once: counter-press near the ball, recovery elsewhere, runs for the winners', () => {
    for (const p of outfield(changed, HOME)) {
      expect(changed.ai.players[p.id]!.decidedAtTick).toBe(changed.ai.lastUpdateTick);
    }
    const window = states.slice(changeIndex, changeIndex + 20);
    const homeBehaviors = new Set(window.flatMap((s) => [...behaviorsOf(s, HOME)]));
    const awayBehaviors = new Set(window.flatMap((s) => [...behaviorsOf(s, AWAY)]));
    const ballWinning: BehaviorId[] = ['counter_press', 'press_carrier', 'chase_loose_ball'];
    expect(ballWinning.some((id) => homeBehaviors.has(id))).toBe(true);
    expect(homeBehaviors.has('recover_shape')).toBe(true);
    expect(awayBehaviors.has('counter_run') || awayBehaviors.has('support_forward')).toBe(true);
  });

  it('drops the home block back', () => {
    expect(team(changed, HOME).shape.defensiveLineX).toBeLessThan(
      team(before, HOME).shape.defensiveLineX - 5,
    );
    expect(team(changed, HOME).shape.width).toBeLessThan(team(before, HOME).shape.width);
  });
});

describe('scenario D: manual override', () => {
  const RW = 'north-city-7';
  const path = (state: SimulationState) => [player(state, RW).position, { x: 60, y: 60 }];
  const start = setupMatch();
  const commanded = planMovement(start, RW, path(start), { movementMode: 'run' }).state;

  const states: SimulationState[] = [];
  const withAI = run(commanded, 160, (s) => states.push(s));
  const manualStates: SimulationState[] = [];
  run(commanded, 160, (s) => manualStates.push(s), MANUAL_ONLY_SIMULATION_CONFIG);
  const releaseIndex = states.findIndex((s) => s.ai.players[RW]!.controlMode === 'autonomous');

  it('the command drives the player exactly as it would without the AI', () => {
    expect(releaseIndex).toBeGreaterThan(20);
    for (let i = 0; i < releaseIndex - 1; i += 1) {
      const memory = states[i]!.ai.players[RW]!;
      expect(memory.controlMode).toBe('manual');
      expect(memory.intent).toBeNull();
      expect(player(states[i]!, RW).position).toEqual(player(manualStates[i]!, RW).position);
      expect(states[i]!.commands).toEqual(manualStates[i]!.commands);
    }
    expect(dist(player(states[releaseIndex - 1]!, RW).position, { x: 60, y: 60 })).toBeLessThan(1);
  });

  it('teammates stay autonomous while one player is under manual control', () => {
    const s = states[10]!;
    for (const p of outfield(s, HOME).filter((p) => p.id !== RW)) {
      expect(s.ai.players[p.id]!.controlMode).toBe('autonomous');
    }
  });

  it('returns to the AI smoothly once the command completes', () => {
    const released = states[releaseIndex]!;
    const memory = released.ai.players[RW]!;
    expect(memory.decidedAtTick).toBe(released.ai.lastUpdateTick);
    expect(memory.intent).not.toBeNull();
    expect(released.commands.commands.find((c) => c.playerId === RW)?.status).toBe('completed');
    // No velocity reset: speed only changes within the physics' acceleration limits (turns
    // rotate the velocity at the physics' turn rate), and the hand-over itself is seamless.
    for (let i = 1; i < states.length; i += 1) {
      const ds = speedOf(player(states[i]!, RW)) - speedOf(player(states[i - 1]!, RW));
      expect(Math.abs(ds)).toBeLessThan(0.5);
    }
    for (let i = releaseIndex - 3; i <= releaseIndex + 3; i += 1) {
      const v0 = player(states[i - 1]!, RW).velocity;
      const v1 = player(states[i]!, RW).velocity;
      expect(Math.hypot(v1.x - v0.x, v1.y - v0.y)).toBeLessThan(0.5);
    }
    expect(speedOf(player(withAI, RW))).toBeGreaterThan(0);
    expect(dist(player(withAI, RW).position, { x: 60, y: 60 })).toBeGreaterThan(1);
  });

  it('a command takes over a moving AI player without resetting his velocity', () => {
    const moving = finishTurn(possessionFor('north-city-6', 1));
    const before = player(moving, RW);
    expect(speedOf(before)).toBeGreaterThan(1);
    const next = planMovement(
      moving,
      RW,
      [before.position, { x: before.position.x + 10, y: before.position.y - 10 }],
      { movementMode: 'run' },
    ).state;
    const after = run(next, 1);
    expect(after.ai.players[RW]!.controlMode).toBe('manual');
    expect(Math.abs(speedOf(player(after, RW)) - speedOf(before))).toBeLessThan(0.5);
  });
});
