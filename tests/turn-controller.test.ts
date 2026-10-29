import {
  callStoppage,
  canTransitionPhase,
  commitPlans,
  commitTeam,
  createSimulationState,
  DEFAULT_SIMULATION_CONFIG,
  DEFAULT_TURN_CONFIG,
  endStoppage,
  finishMatch,
  getTurnSnapshot,
  MatchEngine,
  MatchStateError,
  PHASE_TRANSITIONS,
  PhaseTransitionError,
  planMovement,
  PlanValidationError,
  stepExecution,
  ticksPerTurn,
  validatePlans,
  type SimulationState,
} from '@touchline/match-engine';
import {
  AWAY_TEAM,
  createInitialMatch,
  getCommand,
  HOME_TEAM,
  type MatchPhase,
} from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const fresh = () => createSimulationState(createInitialMatch());

function runExecution(state: SimulationState): { state: SimulationState; ticks: number } {
  let current = state;
  let ticks = 0;
  while (current.phase === 'execution') {
    current = stepExecution(current);
    ticks += 1;
  }
  return { state: current, ticks };
}

describe('match phase state machine', () => {
  it('allows exactly the documented phase transitions', () => {
    const phases: MatchPhase[] = ['planning', 'execution', 'stoppage', 'finished'];
    const allowed = phases.flatMap((from) =>
      phases.filter((to) => canTransitionPhase(from, to)).map((to) => `${from}->${to}`),
    );
    expect(allowed.sort()).toEqual(
      [
        'planning->execution',
        'planning->finished',
        'execution->planning',
        'execution->stoppage',
        'stoppage->planning',
      ].sort(),
    );
    expect(PHASE_TRANSITIONS.finished).toEqual([]);
  });

  it('rejects committing while executing, in a stoppage, or after the match finished', () => {
    const executing = commitPlans(fresh());
    expect(() => commitPlans(executing)).toThrow(MatchStateError);
    expect(() => commitPlans(executing)).toThrow(/commit plans during execution/);
    const stopped = callStoppage(executing);
    expect(() => commitPlans(stopped)).toThrow(/during stoppage/);
    const finished = finishMatch(fresh());
    expect(() => commitPlans(finished)).toThrow(/during finished/);
  });

  it('rejects advancing during planning, stoppage and finished', () => {
    expect(() => stepExecution(fresh())).toThrow(/advance the simulation during planning/);
    expect(() => stepExecution(callStoppage(commitPlans(fresh())))).toThrow(/stoppage/);
    expect(() => stepExecution(finishMatch(fresh()))).toThrow(/finished/);
  });

  it('rejects illegal phase transitions with PhaseTransitionError', () => {
    expect(() => callStoppage(fresh())).toThrow(PhaseTransitionError);
    expect(() => callStoppage(fresh())).toThrow(/from planning to stoppage/);
    expect(() => endStoppage(fresh())).toThrow(/from planning to planning/);
    expect(() => finishMatch(commitPlans(fresh()))).toThrow(/from execution to finished/);
    expect(() => finishMatch(finishMatch(fresh()))).toThrow(/from finished to finished/);
  });

  it('goes execution → stoppage → planning, pausing running commands', () => {
    const state = fresh();
    const player = state.players[9]!;
    const planned = planMovement(state, player.id, [
      player.position,
      { x: player.position.x + 20, y: player.position.y },
    ]).state;
    let executing = commitPlans(planned);
    for (let i = 0; i < 30; i += 1) executing = stepExecution(executing);
    const stopped = callStoppage(executing);
    expect(stopped.phase).toBe('stoppage');
    expect(stopped.commands.commands[0]!.status).toBe('paused');
    expect(stopped.players).toBe(executing.players);
    const planning = endStoppage(stopped);
    expect(planning).toMatchObject({ phase: 'planning', turn: 2, turnTick: 0 });
    const resumed = commitPlans(planning);
    expect(resumed.commands.commands[0]!.status).toBe('active');
  });
});

describe('turn controller', () => {
  it('starts in planning on turn 1', () => {
    const state = fresh();
    expect(state.phase).toBe('planning');
    expect(state.turn).toBe(1);
    expect(getTurnSnapshot(state)).toMatchObject({
      turn: 1,
      phase: 'planning',
      tick: 0,
      turnTick: 0,
      ticksPerTurn: 100,
      elapsedSeconds: 0,
      remainingSeconds: 5,
      progress: 0,
    });
  });

  it('uses 5 s turns at 20 Hz and refuses turn lengths that are not whole ticks', () => {
    expect(DEFAULT_TURN_CONFIG).toEqual({ turnDuration: 5, fixedDeltaTime: 0.05 });
    expect(ticksPerTurn()).toBe(100);
    const bad = {
      ...DEFAULT_SIMULATION_CONFIG,
      match: { ...DEFAULT_SIMULATION_CONFIG.match, turnDuration: 5.01 },
    };
    expect(() => ticksPerTurn(bad)).toThrow(RangeError);
    expect(() => new MatchEngine(createInitialMatch(), { config: bad })).toThrow(RangeError);
  });

  it('commit starts execution; execution lasts exactly 100 ticks and returns to planning', () => {
    const executing = commitPlans(fresh());
    expect(executing).toMatchObject({ phase: 'execution', turn: 1, turnTick: 0 });
    const { state, ticks } = runExecution(executing);
    expect(ticks).toBe(100);
    expect(state).toMatchObject({ phase: 'planning', turn: 2, tick: 100, turnTick: 0 });
  });

  it('increments the turn once per completed execution', () => {
    let state = fresh();
    for (let turn = 1; turn <= 4; turn += 1) {
      expect(state.turn).toBe(turn);
      state = runExecution(commitPlans(state)).state;
    }
    expect(state).toMatchObject({ turn: 5, tick: 400 });
  });

  it('reports elapsed and remaining time from ticks', () => {
    let state = commitPlans(fresh());
    for (let i = 0; i < 37; i += 1) state = stepExecution(state);
    const snapshot = getTurnSnapshot(state);
    expect(snapshot.turnTick).toBe(37);
    expect(snapshot.elapsedSeconds).toBeCloseTo(1.85, 10);
    expect(snapshot.remainingSeconds).toBeCloseTo(3.15, 10);
    expect(snapshot.progress).toBeCloseTo(0.37, 10);
  });

  it('tracks team commits; execution starts once every team has committed', () => {
    const homeOnly = commitTeam(fresh(), HOME_TEAM.id);
    expect(homeOnly.phase).toBe('planning');
    expect(homeOnly.teamCommits).toEqual([
      { teamId: HOME_TEAM.id, committed: true },
      { teamId: AWAY_TEAM.id, committed: false },
    ]);
    const both = commitTeam(homeOnly, AWAY_TEAM.id);
    expect(both.phase).toBe('execution');
    const back = runExecution(both).state;
    expect(back.teamCommits.every((team) => !team.committed)).toBe(true);
    expect(() => commitTeam(fresh(), 'nobody')).toThrow(/Unknown team/);
  });

  it('validates plans before committing', () => {
    const state = fresh();
    const player = state.players[3]!;
    expect(() => planMovement(state, player.id, [player.position])).toThrow(/two points/);
    expect(() => planMovement(state, player.id, [player.position, { x: 200, y: 10 }])).toThrow(
      /leaves the pitch/,
    );
    expect(() => planMovement(state, 'ghost', [player.position, player.position])).toThrow(
      /Unknown player/,
    );
    // A corrupted plan (bypassing planMovement) is caught at commit time.
    const planned = planMovement(state, player.id, [player.position, { x: 10, y: 10 }]).state;
    const corrupt: SimulationState = {
      ...planned,
      commands: {
        ...planned.commands,
        commands: planned.commands.commands.map((c) => ({
          ...c,
          path: [{ x: Number.NaN, y: 0 }, c.path[1]!],
        })),
      },
    };
    expect(validatePlans(corrupt)).toHaveLength(1);
    expect(() => commitPlans(corrupt)).toThrow(PlanValidationError);
    expect(getCommand(planned.commands, planned.commands.commands[0]!.id)?.status).toBe('queued');
  });
});
