import {
  applyKick,
  createBallSimulationState,
  stepBall,
  suggestKickPower,
  validateKick,
  type BallEvent,
  type KickResult,
} from '@touchline/ball-engine';
import {
  createBallState,
  KICK_TYPES,
  type KickRequest,
  type MatchPlayer,
  type Vector2,
} from '@touchline/shared';

import { assertPhase, MatchStateError } from './MatchPhaseMachine';
import {
  RECENT_EVENT_LIMIT,
  type PlannedKick,
  type SimulationConfig,
  type SimulationState,
} from './SimulationState';

/** Kick targets may lie slightly beyond the lines (e.g. a clearance into touch). */
const KICK_TARGET_MARGIN = 10;

function appendEvents(
  recent: readonly BallEvent[],
  events: readonly BallEvent[],
): readonly BallEvent[] {
  if (events.length === 0) return recent;
  const merged = [...recent, ...events];
  return merged.length > RECENT_EVENT_LIMIT ? merged.slice(-RECENT_EVENT_LIMIT) : merged;
}

/** Turns a kick order into a concrete request, aimed from the ball's current position. */
function requestFor(
  plan: PlannedKick,
  state: SimulationState,
  config: SimulationConfig,
  withPower: boolean,
): KickRequest {
  const { position } = state.ball.ball;
  const direction = { x: plan.target.x - position.x, y: plan.target.y - position.y };
  const distance = Math.hypot(direction.x, direction.y);
  const power =
    plan.power ??
    (withPower
      ? suggestKickPower(plan.type, distance, plan.lift, config.ball, config.match.fixedDeltaTime)
      : 0.5);
  return { playerId: plan.playerId, type: plan.type, direction, power, lift: plan.lift };
}

/**
 * Fires every kick order whose player can strike the ball now, in player-id order (only the
 * first can succeed: a kick releases the ball, and a ball just kicked is out of the others'
 * reach or too fast). Orders that cannot fire yet stay queued; malformed ones are dropped.
 */
export function firePlannedKicks(
  state: SimulationState,
  config: SimulationConfig,
): { state: SimulationState; events: BallEvent[] } {
  const ids = Object.keys(state.plannedKicks).sort();
  if (ids.length === 0) return { state, events: [] };
  let current = state;
  const events: BallEvent[] = [];
  for (const playerId of ids) {
    const plan = current.plannedKicks[playerId]!;
    const check = validateKick(
      current.ball,
      current.players,
      requestFor(plan, current, config, false),
      config.ball,
    );
    if (!check.ok && check.reason !== 'invalid_request' && check.reason !== 'unknown_player') {
      continue;
    }
    const plannedKicks = { ...current.plannedKicks };
    delete plannedKicks[playerId];
    if (!check.ok) {
      current = { ...current, plannedKicks };
      continue;
    }
    const outcome = applyKick(
      current.ball,
      current.players,
      requestFor(plan, current, config, true),
      config.ball,
      config.match.fixedDeltaTime,
    );
    events.push(...outcome.events);
    current = { ...current, ball: outcome.state, plannedKicks };
  }
  return { state: current, events };
}

/**
 * The ball's part of one execution tick, run after the players have moved:
 * planned kicks fire first (using the players' new positions), then the ball engine advances the
 * ball against the players' movement from `before.players` to `state.players`.
 * Returns the ball events of the tick (also appended to `recentEvents`).
 */
export function advanceBall(
  before: SimulationState,
  state: SimulationState,
  config: SimulationConfig,
): { state: SimulationState; events: BallEvent[] } {
  const kicked = firePlannedKicks(state, config);
  const step = stepBall(
    kicked.state.ball,
    before.players,
    kicked.state.players,
    config.ball,
    config.match.fixedDeltaTime,
  );
  const events = [...kicked.events, ...step.events];
  return {
    state: {
      ...kicked.state,
      ball: step.state,
      recentEvents: appendEvents(state.recentEvents, events),
    },
    events,
  };
}

function findPlayer(state: SimulationState, playerId: string): MatchPlayer {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new MatchStateError(`Unknown player ${playerId}.`);
  return player;
}

export interface PlanKickInput {
  playerId: string;
  type: PlannedKick['type'];
  target: Vector2;
  lift?: number;
  power?: number | null;
}

/** Orders a kick for a player during planning, replacing any earlier order for that player. */
export function planKick(
  state: SimulationState,
  input: PlanKickInput,
  config: SimulationConfig,
): SimulationState {
  assertPhase(state.phase, 'planning', 'plan kicks');
  findPlayer(state, input.playerId);
  if (!KICK_TYPES.includes(input.type)) {
    throw new MatchStateError(`Unknown kick type ${String(input.type)}.`);
  }
  const { x, y } = input.target;
  const { fieldLength, fieldWidth } = config.match;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < -KICK_TARGET_MARGIN ||
    y < -KICK_TARGET_MARGIN ||
    x > fieldLength + KICK_TARGET_MARGIN ||
    y > fieldWidth + KICK_TARGET_MARGIN
  ) {
    throw new MatchStateError(`Cannot plan a kick for ${input.playerId}: target is off the pitch.`);
  }
  const lift = input.lift ?? config.ball.kickPresets[input.type].defaultLift;
  const power = input.power ?? null;
  if (!(lift >= 0 && lift <= 1) || (power !== null && !(power >= 0 && power <= 1))) {
    throw new MatchStateError(`Cannot plan a kick for ${input.playerId}: lift and power are 0–1.`);
  }
  return {
    ...state,
    plannedKicks: {
      ...state.plannedKicks,
      [input.playerId]: {
        playerId: input.playerId,
        type: input.type,
        target: { x, y },
        lift,
        power,
      },
    },
  };
}

export function cancelPlannedKick(state: SimulationState, playerId: string): SimulationState {
  assertPhase(state.phase, 'planning', 'cancel kicks');
  if (!state.plannedKicks[playerId]) return state;
  const plannedKicks = { ...state.plannedKicks };
  delete plannedKicks[playerId];
  return { ...state, plannedKicks };
}

/**
 * Kicks the ball immediately (execution only; the simulation is frozen during planning). The
 * ball engine validates the kick; a rejected kick leaves the state unchanged.
 */
export function kickBall(
  state: SimulationState,
  request: KickRequest,
  config: SimulationConfig,
): { state: SimulationState; result: KickResult } {
  assertPhase(state.phase, 'execution', 'kick the ball');
  const outcome = applyKick(
    state.ball,
    state.players,
    request,
    config.ball,
    config.match.fixedDeltaTime,
  );
  return {
    state: {
      ...state,
      ball: outcome.state,
      recentEvents: appendEvents(state.recentEvents, outcome.events),
    },
    result: outcome.result,
  };
}

/**
 * Puts a still, free ball at a point on the pitch during planning (clamped inside the lines).
 * Stand-in for restarts, which do not exist yet; used to bring an out-of-play ball back.
 */
export function placeBall(
  state: SimulationState,
  position: Vector2,
  config: SimulationConfig,
): SimulationState {
  assertPhase(state.phase, 'planning', 'place the ball');
  const { fieldLength, fieldWidth } = config.match;
  const x = Math.min(Math.max(position.x, 0), fieldLength);
  const y = Math.min(Math.max(position.y, 0), fieldWidth);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new MatchStateError('Cannot place the ball at a non-finite position.');
  }
  return {
    ...state,
    ball: {
      ...createBallSimulationState(createBallState({ x, y }, config.ball.radius)),
      tick: state.ball.tick,
    },
  };
}
