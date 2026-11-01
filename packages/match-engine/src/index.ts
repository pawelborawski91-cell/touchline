/**
 * @touchline/match-engine — authoritative, deterministic match simulation.
 *
 * May depend only on @touchline/shared, @touchline/physics, @touchline/ball-engine and
 * @touchline/player-ai. Must not import React, React Native, Expo, Skia, Zustand, or any
 * rendering/UI package.
 */
export { advanceAI, setPlayerActive } from './AICoordinator';
export {
  advanceBall,
  cancelPlannedKick,
  firePlannedKicks,
  kickBall,
  placeBall,
  planKick,
  type PlanKickInput,
} from './BallCoordinator';
export {
  MatchEngine,
  type BallDebugInfo,
  type EngineAIDebugInfo,
  type EngineDebugInfo,
  type EngineView,
  type MatchEngineOptions,
  type PlayerDebugInfo,
} from './MatchEngine';
export {
  assertPhase,
  assertPhaseTransition,
  canTransitionPhase,
  MatchStateError,
  PHASE_TRANSITIONS,
  PhaseTransitionError,
} from './MatchPhaseMachine';
export {
  DEFAULT_CLOCK_CONFIG,
  SimulationClock,
  type SimulationClockConfig,
} from './SimulationClock';
export {
  interpolateBall,
  interpolateSnapshot,
  toMatchSnapshot,
  writeInterpolatedFrame,
} from './SimulationSnapshot';
export {
  createSimulationState,
  DEFAULT_SIMULATION_CONFIG,
  DEFAULT_TURN_CONFIG,
  MANUAL_ONLY_SIMULATION_CONFIG,
  RECENT_EVENT_LIMIT,
  ticksPerTurn,
  type PathExecutionState,
  type PlannedKick,
  type SimulationConfig,
  type SimulationState,
  type TeamCommitState,
  type TurnConfig,
} from './SimulationState';
export { createPathExecutionState, stepPlayers } from './SimulationStep';
export {
  callStoppage,
  cancelPlannedCommand,
  commitPlans,
  commitTeam,
  endStoppage,
  finishMatch,
  getTurnSnapshot,
  planMovement,
  PlanValidationError,
  replaceCommand,
  simulateTurn,
  stepExecution,
  validatePlans,
  type PlanIssue,
  type PlanMovementOptions,
  type PlanMovementResult,
  type TurnSnapshot,
} from './TurnController';
export {
  BEHAVIOR_LABELS,
  type AIPlayerDebug,
  type AITeamDebug,
  type BehaviorId,
  type PlayerControlMode,
  type PlayerRole,
  type TeamPlayState,
} from '@touchline/player-ai';
