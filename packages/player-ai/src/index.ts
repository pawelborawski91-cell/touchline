/**
 * @touchline/player-ai — deterministic utility AI for players without a user command.
 *
 * May depend only on @touchline/shared and @touchline/ball-engine (snapshot types and ball
 * helpers). Pure TypeScript with no UI or platform dependencies. The AI never moves players: it
 * produces movement intents that the match engine's movement physics executes.
 */
export type { AIConfig } from './core/AIConfig';
export { DEFAULT_AI_CONFIG, tacticsFor } from './core/AIConfig';
export type { AIContext } from './core/AIContext';
export type { AIWorld } from './core/AIController';
export { updateAI } from './core/AIController';
export type { AIDebugInfo, AIPlayerDebug, AITeamDebug } from './core/AIDebug';
export { BEHAVIOR_LABELS, describeAI } from './core/AIDebug';
export type {
  AIDecision,
  BehaviorCategory,
  BehaviorId,
  MovementIntent,
  PlayerControlMode,
  PlayerRole,
  TeamPlayState,
} from './core/AIDecision';
export { PLAYER_ROLES, TEAM_PLAY_STATES } from './core/AIDecision';
export type { AIObservation, AIState, AITeamInfo, PlayerAIState } from './core/AIState';
export { createAIState, setPlayerInactive } from './core/AIState';
export type { Behavior, BehaviorProposal } from './core/Behavior';
export type { DecisionMemory, ScoredCandidate, Selection } from './core/UtilityEvaluator';
export { evaluateBehaviors, persistTarget, selectCandidate } from './core/UtilityEvaluator';
export {
  ALL_BEHAVIORS,
  ATTACKING_BEHAVIORS,
  BEHAVIORS_BY_ID,
  DEFENDING_BEHAVIORS,
  GENERAL_BEHAVIORS,
  TRANSITION_BEHAVIORS,
} from './behaviors';
export type { BallPerception } from './perception/BallPerception';
export { interceptPoint, perceiveBall, predictBallPosition } from './perception/BallPerception';
export type { PlayerPerception } from './perception/PlayerPerception';
export { perceivePlayer } from './perception/PlayerPerception';
export { SpatialGrid } from './perception/SpatialGrid';
export type {
  PossessionMemory,
  TeamAIState,
  TeamMember,
  TeamPerceptionInput,
} from './perception/TeamPerception';
export {
  INITIAL_POSSESSION_MEMORY,
  perceiveTeam,
  possessingTeam,
  resolvePlayState,
  updatePossessionMemory,
} from './perception/TeamPerception';
export type { BehaviorWeights, RoleProfile } from './roles/RoleProfile';
export { ROLE_PROFILES } from './roles';
export type { GoalkeeperPositioning } from './roles/GoalkeeperAI';
export {
  DEFAULT_GOALKEEPER_POSITIONING,
  GOALKEEPER_PROFILE,
  goalkeeperTarget,
  inOwnPenaltyArea,
} from './roles/GoalkeeperAI';
export { CENTRE_BACK_PROFILE, FULLBACK_PROFILE } from './roles/DefenderAI';
export {
  ATTACKING_MIDFIELDER_PROFILE,
  CENTRAL_MIDFIELDER_PROFILE,
  DEFENSIVE_MIDFIELDER_PROFILE,
} from './roles/MidfielderAI';
export { STRIKER_PROFILE } from './roles/StrikerAI';
export { WINGER_PROFILE } from './roles/WingerAI';
export type {
  AttackDirection,
  FormationDefinition,
  FormationId,
  FormationPosition,
} from './tactics/Formation';
export {
  DEFAULT_FORMATION_ID,
  FORMATION_4231,
  FORMATION_433,
  FORMATION_442,
  FORMATIONS,
  formationToPitch,
  lateralOf,
  lineOf,
  opponentGoalCentre,
  ownGoalCentre,
  positionForSlot,
} from './tactics/Formation';
export type { TeamShapeSnapshot } from './tactics/TeamShape';
export { computeTeamShape, shapeKey, updateTeamShape } from './tactics/TeamShape';
export type { ShapeParameters, TeamTactics } from './tactics/TeamTactics';
export { createTeamTactics, DEFAULT_SHAPE, DEFAULT_TEAM_TACTICS } from './tactics/TeamTactics';
export {
  bestPoint,
  candidatesAround,
  clampToPitch,
  goalSidePoint,
  laneScore,
  leash,
  paceForDistance,
  separateFromTeammates,
  spaceScore,
} from './navigation/PositionTargeting';
