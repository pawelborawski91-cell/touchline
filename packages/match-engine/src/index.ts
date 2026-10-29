/**
 * @touchline/match-engine — authoritative, deterministic match simulation.
 *
 * May depend only on @touchline/shared and @touchline/physics. Must not import React, React
 * Native, Expo, Skia, Zustand, or any rendering/UI package.
 */
export {
  MatchEngine,
  type EngineDebugInfo,
  type EngineView,
  type MatchEngineOptions,
  type PlayerDebugInfo,
} from './MatchEngine';
export {
  DEFAULT_CLOCK_CONFIG,
  SimulationClock,
  type SimulationClockConfig,
} from './SimulationClock';
export { interpolateSnapshot, toMatchSnapshot, writeInterpolatedFrame } from './SimulationSnapshot';
export {
  createSimulationState,
  DEFAULT_SIMULATION_CONFIG,
  ticksPerTurn,
  type FollowerEntry,
  type SimulationConfig,
  type SimulationState,
  type TurnPhase,
} from './SimulationState';
export { stepPlayers } from './SimulationStep';
export {
  applyPlanningAction,
  endTurn,
  nextTurn,
  simulateTurn,
  startExecution,
  stepTurn,
} from './TurnController';
