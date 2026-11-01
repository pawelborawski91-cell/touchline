import {
  commitPlans,
  createSimulationState,
  DEFAULT_SIMULATION_CONFIG,
  placeBall,
  stepExecution,
  type SimulationConfig,
  type SimulationState,
} from '@touchline/match-engine';
import type { TeamAIState } from '@touchline/player-ai';
import { createInitialMatch, type MatchPlayer, type Vector2 } from '@touchline/shared';

export const HOME = 'north-city';
export const AWAY = 'south-united';
export const config: SimulationConfig = DEFAULT_SIMULATION_CONFIG;

/** Kick-off lineup with some players moved, the ball placed and the AI on (planning phase). */
export function setupMatch(
  options: { positions?: Readonly<Record<string, Vector2>>; ball?: Vector2 } = {},
  simulationConfig: SimulationConfig = config,
): SimulationState {
  const match = createInitialMatch();
  const positions = options.positions ?? {};
  const snapshot = {
    ...match,
    players: match.players.map((player) =>
      positions[player.id] ? { ...player, position: positions[player.id]! } : player,
    ),
  };
  const state = createSimulationState(snapshot);
  return options.ball ? placeBall(state, options.ball, simulationConfig) : state;
}

/** Ball at a player's feet (just ahead of him), so he takes control on the first tick. */
export function ballAtFeetOf(state: SimulationState, playerId: string, direction: 1 | -1): Vector2 {
  const { position } = player(state, playerId);
  return { x: position.x + 0.3 * direction, y: position.y };
}

export const player = (state: SimulationState, id: string): MatchPlayer =>
  state.players.find((p) => p.id === id)!;

export const team = (state: SimulationState, teamId: string): TeamAIState =>
  state.ai.teams[teamId]!;

export const behaviorOf = (state: SimulationState, id: string) =>
  state.ai.players[id]?.decision?.behaviorId ?? null;

export const speedOf = (p: MatchPlayer): number => Math.hypot(p.velocity.x, p.velocity.y);

export const dist = (a: Vector2, b: Vector2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Runs execution ticks (committing plans first if planning), calling `visit` after each. */
export function run(
  state: SimulationState,
  ticks: number,
  visit: (state: SimulationState) => void = () => {},
  simulationConfig: SimulationConfig = config,
): SimulationState {
  let current = state;
  for (let i = 0; i < ticks; i += 1) {
    if (current.phase === 'planning') current = commitPlans(current, simulationConfig);
    if (current.phase !== 'execution') break;
    current = stepExecution(current, simulationConfig);
    visit(current);
  }
  return current;
}

/** Runs to the end of the current execution window. */
export function finishTurn(
  state: SimulationState,
  visit: (state: SimulationState) => void = () => {},
  simulationConfig: SimulationConfig = config,
): SimulationState {
  let current = state.phase === 'planning' ? commitPlans(state, simulationConfig) : state;
  while (current.phase === 'execution') {
    current = stepExecution(current, simulationConfig);
    visit(current);
  }
  return current;
}
