import {
  cancelPlannedCommand,
  commitPlans,
  createSimulationState,
  MatchEngine,
  planMovement,
  replaceCommand,
  simulateTurn,
  stepExecution,
  type SimulationState,
  MANUAL_ONLY_SIMULATION_CONFIG,
} from '@touchline/match-engine';
import {
  createInitialMatch,
  getCommand,
  type MatchPlayer,
  type PlayerCommand,
  type Vector2,
} from '@touchline/shared';
import { describe, expect, it } from 'vitest';

// Movement and command physics in isolation: uncommanded players stand still.
const config = MANUAL_ONLY_SIMULATION_CONFIG;

const ST = 'north-city-9';
const DT = 0.05;

const playerOf = (state: SimulationState, id = ST): MatchPlayer =>
  state.players.find((p) => p.id === id)!;
const commandOf = (state: SimulationState, id: string): PlayerCommand =>
  getCommand(state.commands, id)!;
const speedOf = (p: MatchPlayer) => Math.hypot(p.velocity.x, p.velocity.y);

/** A 30 m path from the player: 20 m straight, then 10 m bending upwards. */
function thirtyMetres(start: Vector2): Vector2[] {
  const points: Vector2[] = [start];
  for (let i = 1; i <= 20; i += 1) points.push({ x: start.x + i, y: start.y });
  const radius = 40 / Math.PI; // a 45° arc of this radius is 10 m long
  for (let i = 1; i <= 10; i += 1) {
    const a = (i / 10) * (Math.PI / 4);
    points.push({
      x: start.x + 20 + Math.sin(a) * radius,
      y: start.y - (1 - Math.cos(a)) * radius,
    });
  }
  return points;
}

function planned(mode: 'run' | 'sprint' = 'run') {
  const state = createSimulationState(createInitialMatch());
  const result = planMovement(state, ST, thirtyMetres(playerOf(state).position), {
    movementMode: mode,
  });
  return { state: result.state, commandId: result.command.id };
}

function pathLength(points: readonly Vector2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return total;
}

describe('mandatory scenario: a 30 m command across turn boundaries', () => {
  it('moves part-way in turn 1, stays active, and completes from where it stopped', () => {
    // 1–2. Initialise a player and assign a 30 m path.
    const { state: initial, commandId } = planned('run');
    const start = playerOf(initial).position;
    expect(pathLength(commandOf(initial, commandId).path)).toBeCloseTo(30, 0);

    // 3–4. Commit and execute one five-second turn.
    const afterTurn1 = simulateTurn(initial, config);
    const p1 = playerOf(afterTurn1);
    const path1 = afterTurn1.pathStates[commandId]!;

    // 5. Moved, but not at the destination.
    const end = commandOf(afterTurn1, commandId).path.at(-1)!;
    const moved = Math.hypot(p1.position.x - start.x, p1.position.y - start.y);
    expect(moved).toBeGreaterThan(10);
    expect(Math.hypot(p1.position.x - end.x, p1.position.y - end.y)).toBeGreaterThan(2);
    expect(speedOf(p1)).toBeGreaterThan(1);

    // 6. The command is still active (not paused, not completed, not recreated).
    expect(commandOf(afterTurn1, commandId)).toMatchObject({ status: 'active', startedTurn: 1 });
    expect(p1.activeCommandId).toBe(commandId);
    expect(afterTurn1.commands.commands).toHaveLength(1);

    // 7. Path progress is preserved and consistent with the distance run.
    expect(path1.currentWaypointIndex).toBeGreaterThan(5);
    expect(path1.distanceAlongPath).toBeGreaterThan(10);
    expect(path1.progress).toBeGreaterThan(0.3);
    expect(path1.progress).toBeLessThan(1);

    // 8. Back in planning for turn 2, with nothing changed by the phase change itself.
    expect(afterTurn1).toMatchObject({ phase: 'planning', turn: 2, tick: 100 });

    // 9. Commit the next turn: execution resumes from the exact same state.
    const resumed = commitPlans(afterTurn1, config);
    expect(playerOf(resumed)).toEqual(p1);
    expect(resumed.pathStates[commandId]).toEqual(path1);
    expect(commandOf(resumed, commandId).path).toEqual(commandOf(afterTurn1, commandId).path);

    // 10. The first tick continues along the remaining path: no restart, no teleport.
    const firstTick = stepExecution(resumed, config);
    const p2 = playerOf(firstTick);
    const step = Math.hypot(p2.position.x - p1.position.x, p2.position.y - p1.position.y);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThanOrEqual(p1.movement.maxSpeed * DT + 1e-9);
    expect(Math.abs(speedOf(p2) - speedOf(p1))).toBeLessThanOrEqual(
      p1.movement.deceleration * DT + 1e-9,
    );
    const path2 = firstTick.pathStates[commandId]!;
    expect(path2.currentWaypointIndex).toBeGreaterThanOrEqual(path1.currentWaypointIndex);
    expect(path2.distanceAlongPath).toBeGreaterThan(path1.distanceAlongPath);

    // 11. It eventually completes, at the end of the path.
    let state = firstTick;
    while (state.phase === 'execution') state = stepExecution(state, config);
    expect(commandOf(state, commandId)).toMatchObject({ status: 'completed', endedTurn: 2 });
    const final = playerOf(state);
    expect(Math.hypot(final.position.x - end.x, final.position.y - end.y)).toBeLessThanOrEqual(
      0.25,
    );
    expect(final.activeCommandId).toBeNull();
    expect(state.pathStates[commandId]).toMatchObject({ progress: 1, isFinalWaypoint: true });
  });
});

describe('persistence across turn boundaries', () => {
  it('preserves position, velocity, facing, stamina, waypoint and progress exactly', () => {
    const { state: initial, commandId } = planned('sprint');
    let state = commitPlans(initial, config);
    for (let i = 0; i < 99; i += 1) state = stepExecution(state, config);
    const last = stepExecution(state, config);
    expect(last.phase).toBe('planning');
    // The boundary tick moves players like any other tick; then nothing is reset.
    const atBoundary = playerOf(last);
    const recommitted = commitPlans(last, config);
    expect(playerOf(recommitted)).toEqual(atBoundary);
    expect(recommitted.pathStates[commandId]).toEqual(last.pathStates[commandId]);
    expect(atBoundary.position).not.toEqual(playerOf(initial).position);
  });

  it('never processes a waypoint twice: indices and distance only increase', () => {
    const { state: initial, commandId } = planned('sprint');
    let state = commitPlans(initial, config);
    let index = 1;
    let distance = 0;
    for (let turn = 0; turn < 3; turn += 1) {
      while (state.phase === 'execution' && commandOf(state, commandId).status === 'active') {
        state = stepExecution(state, config);
        const progress = state.pathStates[commandId]!;
        expect(progress.currentWaypointIndex).toBeGreaterThanOrEqual(index);
        expect(progress.distanceAlongPath).toBeGreaterThanOrEqual(distance - 1e-12);
        index = progress.currentWaypointIndex;
        distance = progress.distanceAlongPath;
      }
      if (commandOf(state, commandId).status !== 'active') break;
      if (state.phase === 'planning') state = commitPlans(state, config);
    }
    expect(commandOf(state, commandId).status).toBe('completed');
  });

  it('keeps queued commands queued through planning and activates them at commit', () => {
    const { state: initial, commandId } = planned();
    const other = 'north-city-4';
    const queuedOnly = planMovement(initial, other, [
      playerOf(initial, other).position,
      { x: 20, y: 30 },
    ]);
    expect(commandOf(queuedOnly.state, queuedOnly.command.id).status).toBe('queued');
    const executing = commitPlans(queuedOnly.state, config);
    expect(commandOf(executing, queuedOnly.command.id).status).toBe('active');
    expect(commandOf(executing, commandId).status).toBe('active');
  });

  it('keeps completed commands completed and never runs them again', () => {
    const state = createSimulationState(createInitialMatch());
    const start = playerOf(state).position;
    const short = planMovement(state, ST, [start, { x: start.x + 4, y: start.y }]);
    const turn1 = simulateTurn(short.state, config);
    expect(commandOf(turn1, short.command.id).status).toBe('completed');
    const restingAt = playerOf(turn1).position;
    // Still inspectable during the next planning phase.
    expect(turn1.commands.commands).toHaveLength(1);
    const turn2 = simulateTurn(turn1, config);
    expect(playerOf(turn2).position).toEqual(restingAt);
    expect(getCommand(turn2.commands, short.command.id)).toBeUndefined();
  });

  it('never resumes a cancelled command; the player brakes naturally instead', () => {
    const { state: initial, commandId } = planned('sprint');
    const turn1 = simulateTurn(initial, config);
    const moving = playerOf(turn1);
    const cancelled = cancelPlannedCommand(turn1, commandId);
    expect(commandOf(cancelled, commandId)).toMatchObject({ status: 'cancelled', endedTurn: 2 });
    expect(playerOf(cancelled).activeCommandId).toBeNull();
    expect(playerOf(cancelled).velocity).toEqual(moving.velocity);
    const turn2 = simulateTurn(cancelled, config);
    expect(commandOf(turn2, commandId).status).toBe('cancelled');
    expect(speedOf(playerOf(turn2))).toBe(0);
    expect(() => cancelPlannedCommand(turn2, commandId)).toThrow(/cancelled to cancelled/);
  });
});

describe('replacement', () => {
  it('replaces a queued command (old one cancelled)', () => {
    const { state, commandId } = planned();
    const start = playerOf(state).position;
    const result = replaceCommand(state, commandId, [start, { x: start.x, y: start.y + 10 }]);
    expect(commandOf(result.state, commandId).status).toBe('cancelled');
    expect(commandOf(result.state, result.command.id)).toMatchObject({
      status: 'queued',
      movementMode: 'run',
    });
  });

  it('replaces an active command during planning from the actual position, keeping momentum', () => {
    const { state: initial, commandId } = planned('sprint');
    const turn1 = simulateTurn(initial, config);
    const before = playerOf(turn1);
    // The UI draws from the player's live position; any stale start point is re-anchored.
    const replacement = replaceCommand(turn1, commandId, [
      { x: 0, y: 0 },
      { x: before.position.x + 5, y: before.position.y + 12 },
    ]);
    const oldCommand = commandOf(replacement.state, commandId);
    expect(oldCommand).toMatchObject({ status: 'interrupted', endedTurn: 2 });
    expect(playerOf(replacement.state).position).toEqual(before.position);
    expect(playerOf(replacement.state).velocity).toEqual(before.velocity);
    expect(playerOf(replacement.state).activeCommandId).toBeNull();
    expect(replacement.state.commands.commands.filter((c) => c.status === 'active')).toHaveLength(
      0,
    );

    const executing = commitPlans(replacement.state, config);
    const started = commandOf(executing, replacement.command.id);
    expect(started.status).toBe('active');
    expect(started.path[0]).toEqual(before.position);
    expect(playerOf(executing).velocity).toEqual(before.velocity);

    const next = stepExecution(executing, config);
    const step = Math.hypot(
      playerOf(next).position.x - before.position.x,
      playerOf(next).position.y - before.position.y,
    );
    expect(step).toBeLessThanOrEqual(before.movement.maxSpeed * DT + 1e-9);
    expect(step).toBeGreaterThan(0.1);
    expect(commandOf(next, commandId).status).toBe('interrupted');
  });

  it('works through the engine API and keeps ids unique', () => {
    const engine = new MatchEngine(createInitialMatch(), { config });
    const start = engine.getState().players.find((p) => p.id === ST)!.position;
    const first = engine.planMovement(ST, thirtyMetres(start), { movementMode: 'sprint' });
    engine.commitPlans();
    for (let i = 0; i < 100; i += 1) engine.advanceFrame(DT);
    expect(engine.getView()).toMatchObject({ phase: 'planning', turn: 2 });
    const position = engine.getState().players.find((p) => p.id === ST)!.position;
    const second = engine.replaceCommand(first.id, [position, { x: position.x, y: 20 }]);
    expect(second.id).not.toBe(first.id);
    expect(second.movementMode).toBe('sprint');
    expect(engine.getCommand(first.id)?.status).toBe('interrupted');
    expect(() => engine.replaceCommand(first.id, [position, { x: 1, y: 1 }])).toThrow(/not live/);
    engine.cancelCommand(second.id);
    expect(engine.getCommand(second.id)?.status).toBe('cancelled');
  });
});

describe('planning freeze', () => {
  it('changes nothing about players or time while planning, however long it lasts', () => {
    const { state: initial, commandId } = planned('sprint');
    const turn1 = simulateTurn(initial, config);
    const engine = new MatchEngine(createInitialMatch(), { config });
    // Drive an engine to the same point through real frames.
    const start = engine.getState().players.find((p) => p.id === ST)!.position;
    engine.planMovement(ST, thirtyMetres(start), { movementMode: 'sprint' });
    engine.commitPlans();
    while (engine.getState().phase === 'execution') engine.advanceFrame(1 / 60);
    const frozen = engine.getState();
    expect(frozen.players).toEqual(turn1.players);

    for (let i = 0; i < 600; i += 1) expect(engine.advanceFrame(1 / 60)).toBe(0);
    engine.advanceFrame(10_000);
    const later = engine.getState();
    expect(later).toBe(frozen);
    expect(later.tick).toBe(100);
    const runner = later.players.find((p) => p.id === ST)!;
    expect(runner.staminaCurrent).toBe(playerOf(turn1).staminaCurrent);
    expect(runner.velocity).toEqual(playerOf(turn1).velocity);
    expect(later.pathStates[commandId]).toEqual(turn1.pathStates[commandId]);
    expect(engine.getTurnSnapshot()).toMatchObject({ phase: 'planning', turnTick: 0, turn: 2 });
  });

  it('plan edits during planning never move players', () => {
    const { state: initial, commandId } = planned();
    const turn1 = simulateTurn(initial, config);
    const edited = cancelPlannedCommand(
      planMovement(turn1, 'north-city-4', [
        playerOf(turn1, 'north-city-4').position,
        { x: 10, y: 10 },
      ]).state,
      commandId,
    );
    expect(edited.players.map((p) => [p.position, p.velocity, p.facing, p.staminaCurrent])).toEqual(
      turn1.players.map((p) => [p.position, p.velocity, p.facing, p.staminaCurrent]),
    );
    expect(edited.tick).toBe(turn1.tick);
  });
});
