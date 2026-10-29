import {
  activateLiveCommands,
  commandReducer,
  getActiveMovementCommand,
  pauseActiveCommands,
  pruneFinishedCommands,
  type CommandAction,
} from '@touchline/shared';

import {
  DEFAULT_SIMULATION_CONFIG,
  ticksPerTurn,
  type SimulationConfig,
  type SimulationState,
} from './SimulationState';
import { stepPlayers } from './SimulationStep';

/** Planning-phase command edits. Ignored outside planning so plans are locked during execution. */
export function applyPlanningAction(
  state: SimulationState,
  action: CommandAction,
): SimulationState {
  if (state.phase !== 'planning') return state;
  const commands = commandReducer(state.commands, action);
  return commands === state.commands ? state : { ...state, commands };
}

/**
 * Commits the plan and starts a turn: finished commands from earlier turns are dropped, and
 * every queued or paused command becomes active. Only valid from planning.
 */
export function startExecution(state: SimulationState): SimulationState {
  if (state.phase !== 'planning') return state;
  const commands = activateLiveCommands(pruneFinishedCommands(state.commands));
  const players = state.players.map((player) => ({
    ...player,
    activeCommandId: getActiveMovementCommand(commands, player.id)?.id ?? null,
  }));
  return { ...state, phase: 'executing', turnTick: 0, commands, players };
}

/** Ends the turn: commands still running are paused (they resume next turn). */
export function endTurn(state: SimulationState): SimulationState {
  if (state.phase !== 'executing') return state;
  return { ...state, phase: 'turn_complete', commands: pauseActiveCommands(state.commands) };
}

/** Returns to planning for the next turn. */
export function nextTurn(state: SimulationState): SimulationState {
  if (state.phase !== 'turn_complete') return state;
  return { ...state, phase: 'planning', turn: state.turn + 1, turnTick: 0 };
}

/**
 * One fixed simulation step of the turn. No-op outside execution. After the last step of the
 * turn (tick 100 at 20 Hz × 5 s) the turn ends automatically.
 */
export function stepTurn(
  state: SimulationState,
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
): SimulationState {
  if (state.phase !== 'executing') return state;
  const stepped = stepPlayers(state, config);
  const advanced = { ...stepped, tick: state.tick + 1, turnTick: state.turnTick + 1 };
  return advanced.turnTick >= ticksPerTurn(config) ? endTurn(advanced) : advanced;
}

/** Runs a full turn from planning in one call; used by tests and headless simulation. */
export function simulateTurn(
  state: SimulationState,
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
): SimulationState {
  let current = startExecution(state);
  while (current.phase === 'executing') current = stepTurn(current, config);
  return current;
}
