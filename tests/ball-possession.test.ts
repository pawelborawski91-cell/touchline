import {
  applyKick,
  BallEngine,
  contestScore,
  createBallSimulationState,
  DEFAULT_BALL_CONFIG,
  kickTravelDistance,
  launchVelocity,
  stepBall,
  suggestKickPower,
  toBody,
  validateKick,
  type BallEvent,
  type BallSimulationState,
} from '@touchline/ball-engine';
import {
  BALL_RADIUS,
  createBallState,
  createInitialMatch,
  type BallState,
  type KickRequest,
  type PlayerState,
  type Vector2,
  type Vector3,
} from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const config = DEFAULT_BALL_CONFIG;
const DT = 0.05;
const template = createInitialMatch().players[6]!;

function makePlayer(
  id: string,
  teamId: string,
  position: Vector2,
  velocity: Vector2 = { x: 0, y: 0 },
  technical = { technique: 0.7, ballControl: 0.7 },
  agility = 0.8,
): PlayerState {
  return {
    ...template,
    id,
    teamId,
    position: { ...position },
    velocity: { ...velocity },
    facing: Math.atan2(velocity.y, velocity.x),
    technical,
    movement: { ...template.movement, agility },
    activeCommandId: null,
  };
}

function ball(position: Partial<Vector3>, velocity: Partial<Vector3> = {}): BallState {
  const base = createBallState();
  return {
    ...base,
    position: { ...base.position, ...position },
    velocity: { x: 0, y: 0, z: 0, ...velocity },
  };
}

/** Steps the ball while moving players at constant velocity (or via `move`). */
function simulate(
  start: BallSimulationState,
  players: PlayerState[],
  ticks: number,
  move: (p: PlayerState, tick: number) => PlayerState = (p) => ({
    ...p,
    position: { x: p.position.x + p.velocity.x * DT, y: p.position.y + p.velocity.y * DT },
  }),
) {
  let state = start;
  let current = players;
  const states: BallSimulationState[] = [];
  const events: BallEvent[] = [];
  const playerHistory: PlayerState[][] = [];
  for (let i = 0; i < ticks; i += 1) {
    const next = current.map((p) => move(p, i));
    const result = stepBall(state, current, next, config, DT);
    state = result.state;
    current = next;
    states.push(state);
    events.push(...result.events);
    playerHistory.push(next);
  }
  return { state, states, events, players: current, playerHistory };
}

const distance = (b: BallState, p: PlayerState) =>
  Math.hypot(b.position.x - p.position.x, b.position.y - p.position.y);

describe('ball–player interaction', () => {
  it('a slow ball reaching a player is controlled and cushioned', () => {
    const receiver = { ...makePlayer('a', 'home', { x: 30, y: 34 }), facing: Math.PI };
    const { state, events } = simulate(
      createBallSimulationState(ball({ x: 24 }, { x: 8 })),
      [receiver],
      30,
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'control_gained', playerId: 'a' }),
    );
    expect(state.ball.controllerPlayerId).toBe('a');
    expect(state.ball.lastTouchPlayerId).toBe('a');
    expect(Math.hypot(state.ball.velocity.x, state.ball.velocity.y)).toBeLessThan(2);
  });

  it('a fast ball cannot pass through a player: it deflects off the body', () => {
    const blocker = makePlayer('a', 'home', { x: 30, y: 34 }, undefined, {
      technique: 0.3,
      ballControl: 0.1,
    });
    const { states, events } = simulate(
      createBallSimulationState(ball({ x: 25 }, { x: 25 })),
      [blocker],
      20,
    );
    const touch = events.find((e) => e.type === 'touch');
    expect(touch).toMatchObject({ playerId: 'a', kind: 'deflection' });
    expect(Math.max(...states.map((s) => s.ball.position.x))).toBeLessThan(30);
    expect(states.at(-1)!.ball.velocity.x).toBeLessThan(0);
  });

  it('a high ball passes over a player untouched', () => {
    const player = makePlayer('a', 'home', { x: 30, y: 34 });
    const { events, state } = simulate(
      createBallSimulationState(ball({ x: 25, z: 3 }, { x: 20, z: 1 })),
      [player],
      10,
    );
    expect(events.filter((e) => e.type === 'touch')).toEqual([]);
    expect(state.ball.position.x).toBeGreaterThan(31);
  });

  it('a player running into a still ball pushes it rather than passing through', () => {
    const runner = makePlayer(
      'a',
      'home',
      { x: 20, y: 34 },
      { x: 7, y: 0 },
      { technique: 0.2, ballControl: 0 },
    );
    const free = {
      ...createBallSimulationState(ball({ x: 22 })),
      releasedPlayerId: 'a',
      releaseUntilTick: 1000,
    };
    const { states, playerHistory } = simulate(free, [runner], 20);
    for (let i = 0; i < states.length; i += 1) {
      expect(distance(states[i]!.ball, playerHistory[i]![0]!)).toBeGreaterThanOrEqual(
        config.playerBodyRadius + BALL_RADIUS - 1e-6,
      );
    }
    expect(states.at(-1)!.ball.position.x).toBeGreaterThan(22.5);
  });

  it('a ball resting against a player produces no repeated impulses', () => {
    const player = makePlayer('a', 'home', { x: 30, y: 34 });
    const resting = {
      ...createBallSimulationState(ball({ x: 30 + config.playerBodyRadius + BALL_RADIUS })),
      releasedPlayerId: 'a',
      releaseUntilTick: 1000,
    };
    const { events, state } = simulate(resting, [player], 40);
    expect(events.filter((e) => e.type === 'touch')).toEqual([]);
    expect(state.ball.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('possession', () => {
  it('starts free and becomes controlled by a player next to the ball', () => {
    const start = createBallSimulationState(ball({ x: 30.5 }));
    expect(start.ball.possessionState).toBe('free');
    const engine = new BallEngine(start.ball, config, DT);
    const players = [makePlayer('a', 'home', { x: 30, y: 34 })];
    engine.update(players, DT);
    expect(engine.getPossession(players)).toMatchObject({
      state: 'controlled',
      controllerPlayerId: 'a',
      controllerTeamId: 'home',
      lastTouchPlayerId: 'a',
    });
  });

  it('becomes contested when an opponent closes in, and the stronger player wins', () => {
    const holder = makePlayer(
      'a',
      'home',
      { x: 30, y: 34 },
      undefined,
      { technique: 0.4, ballControl: 0.4 },
      0.6,
    );
    const tackler = makePlayer(
      'b',
      'away',
      { x: 31.2, y: 34 },
      undefined,
      { technique: 0.9, ballControl: 0.9 },
      0.95,
    );
    const start = simulate(createBallSimulationState(ball({ x: 30.5 })), [holder], 1).state;
    expect(start.ball.controllerPlayerId).toBe('a');
    const { events, state } = simulate(start, [holder, tackler], 6);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'contest', playerIds: ['a', 'b'] }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'control_lost', playerId: 'a', reason: 'tackled' }),
    );
    expect(state.ball.controllerPlayerId).toBe('b');
    expect(state.ball.possessionState).toBe('contested');
  });

  it('resolves contests deterministically (equal players: the incumbent keeps it)', () => {
    const run = () => {
      const a = makePlayer('a', 'home', { x: 30, y: 34 });
      const b = makePlayer('b', 'away', { x: 31.1, y: 34 });
      const held = simulate(createBallSimulationState(ball({ x: 30.55 })), [a], 1).state;
      return simulate(held, [a, b], 10).state;
    };
    const first = run();
    expect(first).toEqual(run());
    expect(first.ball.controllerPlayerId).toBe('a');
  });

  it('scores contests by closeness, agility, technique and control, minus relative speed', () => {
    const body = toBody(ball({ x: 30 }));
    const near = makePlayer('a', 'h', { x: 30.3, y: 34 });
    const far = makePlayer('b', 'h', { x: 31.2, y: 34 });
    expect(contestScore(near, 0.3, body, false, config)).toBeGreaterThan(
      contestScore(far, 1.2, body, false, config),
    );
    const skilled = makePlayer(
      'c',
      'h',
      { x: 30.5, y: 34 },
      undefined,
      { technique: 1, ballControl: 1 },
      1,
    );
    const clumsy = makePlayer(
      'd',
      'h',
      { x: 30.5, y: 34 },
      undefined,
      { technique: 0, ballControl: 0 },
      0.5,
    );
    expect(contestScore(skilled, 0.5, body, false, config)).toBeGreaterThan(
      contestScore(clumsy, 0.5, body, false, config),
    );
    const sprinting = makePlayer('e', 'h', { x: 30.5, y: 34 }, { x: 8, y: 0 });
    expect(contestScore(sprinting, 0.5, body, false, config)).toBeLessThan(
      contestScore(near, 0.5, body, false, config),
    );
  });

  it('a teammate nearby does not steal or contest the ball', () => {
    const a = makePlayer('a', 'home', { x: 30, y: 34 });
    const mate = makePlayer(
      'b',
      'home',
      { x: 31.1, y: 34 },
      undefined,
      { technique: 1, ballControl: 1 },
      1,
    );
    const held = simulate(createBallSimulationState(ball({ x: 30.55 })), [a], 1).state;
    const { state } = simulate(held, [a, mate], 10);
    expect(state.ball.controllerPlayerId).toBe('a');
    expect(state.ball.possessionState).toBe('controlled');
  });

  it('loses control when the ball gets away', () => {
    const a = makePlayer('a', 'home', { x: 30, y: 34 });
    const held = simulate(createBallSimulationState(ball({ x: 30.55 })), [a], 1).state;
    const runaway = {
      ...held,
      ball: { ...held.ball, velocity: { x: 12, y: 0, z: 0 } },
      nextTouchTick: 1000,
    };
    const { events, state } = simulate(runaway, [a], 10);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'control_lost', playerId: 'a', reason: 'loose' }),
    );
    expect(state.ball.possessionState).toBe('free');
  });
});

describe('dribbling', () => {
  const dribble = (turn: (p: PlayerState, tick: number) => PlayerState, ticks = 60) => {
    const a = makePlayer('a', 'home', { x: 30, y: 34 }, { x: 5, y: 0 });
    const held = simulate(createBallSimulationState(ball({ x: 30.6 }, { x: 5 })), [a], 1).state;
    return simulate(held, [a], ticks, turn);
  };
  const straight = (p: PlayerState) => ({
    ...p,
    position: { x: p.position.x + p.velocity.x * DT, y: p.position.y + p.velocity.y * DT },
  });

  it('keeps the ball close through repeated touches, never attached', () => {
    const { states, events, playerHistory } = dribble(straight);
    const touches = events.filter((e) => e.type === 'touch' && e.kind === 'dribble');
    expect(touches.length).toBeGreaterThanOrEqual(8);
    expect(touches.length).toBeLessThan(states.length / 2);
    const gaps = states.map((s, i) => distance(s.ball, playerHistory[i]![0]!));
    expect(Math.max(...gaps)).toBeLessThan(config.loseDistance);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.1);
    expect(states.every((s) => s.ball.controllerPlayerId === 'a')).toBe(true);
    // The ball is ahead of the player in the direction of travel.
    expect(states.at(-1)!.ball.position.x).toBeGreaterThan(playerHistory.at(-1)![0]!.position.x);
  });

  it('follows a gradual turn', () => {
    const curve = (p: PlayerState, tick: number) => {
      const angle = Math.min(tick, 30) * (Math.PI / 2 / 30);
      const velocity = { x: 5 * Math.cos(angle), y: 5 * Math.sin(angle) };
      return {
        ...p,
        velocity,
        position: { x: p.position.x + velocity.x * DT, y: p.position.y + velocity.y * DT },
      };
    };
    const { state, players } = dribble(curve);
    expect(state.ball.controllerPlayerId).toBe('a');
    expect(distance(state.ball, players[0]!)).toBeLessThan(1.2);
  });

  it('can lose the ball on a sudden sharp turn at speed', () => {
    const swerve = (p: PlayerState, tick: number) => {
      const velocity =
        tick < 20
          ? { x: 7, y: 0 }
          : { x: -7 * Math.cos(Math.PI / 4), y: 7 * Math.sin(Math.PI / 4) };
      return {
        ...p,
        velocity,
        position: { x: p.position.x + velocity.x * DT, y: p.position.y + velocity.y * DT },
      };
    };
    const { events } = dribble(swerve);
    expect(events).toContainEqual(expect.objectContaining({ type: 'control_lost', playerId: 'a' }));
  });
});

describe('kicking', () => {
  const setup = (ballAt: Partial<Vector3> = { x: 30.5 }) => {
    const kicker = makePlayer('a', 'home', { x: 30, y: 34 });
    const state = createBallSimulationState(ball(ballAt));
    return { kicker, state };
  };
  const request = (overrides: Partial<KickRequest> = {}): KickRequest => ({
    playerId: 'a',
    type: 'pass',
    direction: { x: 1, y: 0 },
    power: 0.5,
    lift: 0,
    ...overrides,
  });

  it('applies an impulse along the direction, updates last touch and releases control', () => {
    const { kicker } = setup();
    const held = simulate(createBallSimulationState(ball({ x: 30.5 })), [kicker], 1).state;
    expect(held.ball.controllerPlayerId).toBe('a');
    const { state, result, events } = applyKick(
      held,
      [kicker],
      request({ direction: { x: 0, y: 2 } }),
      config,
      DT,
    );
    expect(result.ok).toBe(true);
    expect(state.ball.velocity.x).toBeCloseTo(0, 9);
    expect(state.ball.velocity.y).toBeCloseTo(11.5, 9);
    expect(state.ball.controllerPlayerId).toBeNull();
    expect(state.ball.possessionState).toBe('free');
    expect(state.ball.lastTouchPlayerId).toBe('a');
    expect(events.map((e) => e.type)).toEqual(['control_lost', 'kick']);
  });

  it('rejects kicks out of reach, too high, or from a player not in control', () => {
    const { kicker } = setup();
    const far = createBallSimulationState(ball({ x: 32 }));
    expect(validateKick(far, [kicker], request(), config)).toMatchObject({
      ok: false,
      reason: 'too_far',
    });
    const high = createBallSimulationState(ball({ x: 30.5, z: 1.5 }));
    expect(validateKick(high, [kicker], request(), config)).toMatchObject({
      ok: false,
      reason: 'too_high',
    });
    const other = makePlayer('b', 'away', { x: 31, y: 34 });
    const owned = simulate(createBallSimulationState(ball({ x: 30.5 })), [kicker], 1).state;
    expect(owned.ball.controllerPlayerId).toBe('a');
    expect(validateKick(owned, [kicker, other], request({ playerId: 'b' }), config)).toMatchObject({
      ok: false,
      reason: 'controlled_by_other',
    });
    expect(validateKick(far, [kicker], request({ power: 2 }), config)).toMatchObject({
      reason: 'invalid_request',
    });
    expect(
      validateKick(far, [kicker], request({ direction: { x: 0, y: 0 } }), config),
    ).toMatchObject({
      reason: 'invalid_request',
    });
    expect(validateKick(far, [kicker], request({ playerId: 'ghost' }), config)).toMatchObject({
      reason: 'unknown_player',
    });
  });

  it('leaves the state unchanged when a kick is rejected', () => {
    const { kicker } = setup({ x: 35 });
    const start = createBallSimulationState(ball({ x: 35 }));
    const outcome = applyKick(start, [kicker], request(), config, DT);
    expect(outcome.result.ok).toBe(false);
    expect(outcome.state).toBe(start);
    expect(outcome.events).toEqual([]);
  });

  it('gives each kick type its own speed and launch angle', () => {
    const angle = (type: KickRequest['type'], lift: number) =>
      launchVelocity(config.kickPresets[type], 1, 0, 0.5, lift).launchAngle;
    expect(angle('pass', 0)).toBe(0);
    expect(angle('lob', 0.5)).toBeGreaterThan(angle('clearance', 0.5));
    expect(angle('clearance', 0.5)).toBeGreaterThan(angle('shot', 0.5));
    const speed = (type: KickRequest['type']) =>
      launchVelocity(config.kickPresets[type], 1, 0, 1, 0).speed;
    expect(speed('shot')).toBeGreaterThan(speed('pass'));
  });

  it('a lob rises, flies over a player in the way, and lands beyond', () => {
    const { kicker, state } = setup();
    const defender = makePlayer('d', 'away', { x: 38, y: 34 });
    const kicked = applyKick(
      state,
      [kicker, defender],
      request({ type: 'lob', lift: 0.5, power: 0.5 }),
      config,
      DT,
    );
    expect(kicked.state.ball.velocity.z).toBeGreaterThan(5);
    const { events, states } = simulate(kicked.state, [kicker, defender], 60, (p) => p);
    expect(events.filter((e) => e.type === 'touch' && e.playerId === 'd')).toEqual([]);
    expect(Math.max(...states.map((s) => s.ball.position.z))).toBeGreaterThan(3);
    expect(events.find((e) => e.type === 'bounce')).toBeDefined();
  });

  it('the kicker cannot immediately re-control the ball', () => {
    const { kicker, state } = setup();
    const kicked = applyKick(state, [kicker], request({ power: 0 }), config, DT);
    const { events } = simulate(kicked.state, [kicker], 6, (p) => p);
    expect(events.filter((e) => e.type === 'control_gained')).toEqual([]);
  });

  it('suggests power for a distance, monotonic in distance', () => {
    const p20 = suggestKickPower('pass', 20, 0, config, DT);
    const p30 = suggestKickPower('pass', 30, 0, config, DT);
    expect(p30).toBeGreaterThan(p20);
    expect(kickTravelDistance('pass', p20, 0, config, DT)).toBeCloseTo(20, 0);
    expect(suggestKickPower('pass', 500, 0, config, DT)).toBe(1);
    expect(suggestKickPower('pass', 0.5, 0, config, DT)).toBe(0);
  });
});
