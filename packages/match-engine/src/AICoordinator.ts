import { getPossessionSnapshot } from '@touchline/ball-engine';
import { setPlayerInactive, updateAI, type AIWorld } from '@touchline/player-ai';

import { assertPhase } from './MatchPhaseMachine';
import type { SimulationConfig, SimulationState } from './SimulationState';

/** Players whose movement this tick comes from an active user command. */
function manualPlayerIds(state: SimulationState): Set<string> {
  const ids = new Set<string>();
  for (const command of state.commands.commands) {
    if (command.type === 'move' && command.status === 'active') ids.add(command.playerId);
  }
  return ids;
}

/**
 * The AI's part of one execution tick, run before the players move: it reads the tick's
 * read-only world (players, ball, possession, which players are under manual control) and
 * stores decisions and movement intents in `state.ai`. It never touches commands, positions or
 * velocities; the movement physics executes the intents.
 */
export function advanceAI(state: SimulationState, config: SimulationConfig): SimulationState {
  if (!config.ai.enabled) return state;
  const world: AIWorld = {
    tick: state.tick,
    deltaTime: config.match.fixedDeltaTime,
    phase: state.phase,
    players: state.players,
    ball: state.ball.ball,
    possession: getPossessionSnapshot(state.ball, state.players),
    manualPlayerIds: manualPlayerIds(state),
  };
  const ai = updateAI(state.ai, world, config.ai);
  return ai === state.ai ? state : { ...state, ai };
}

/**
 * Takes a player out of (or back into) normal behavior; planning only. Reserved for future match
 * events (injuries, dismissals): an inactive player gets no AI intent and just slows down.
 */
export function setPlayerActive(
  state: SimulationState,
  playerId: string,
  active: boolean,
): SimulationState {
  assertPhase(state.phase, 'planning', 'change player availability');
  const ai = setPlayerInactive(state.ai, playerId, !active);
  return ai === state.ai ? state : { ...state, ai };
}
