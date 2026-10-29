/**
 * @touchline/planning — player commands, trajectories, and planning interaction rules.
 *
 * Pure TypeScript; may depend only on @touchline/shared. All paths are world metres.
 */
// Command model and manager live in @touchline/shared so the match engine can execute them
// without depending on planning; re-exported here for planning consumers.
export type {
  CommandAction,
  CommandBook,
  CommandStatus,
  CommandType,
  CreateDraftResult,
  DraftOptions,
  MoveCommandInput,
  MovementMode,
  PlayerCommand,
} from '@touchline/shared';
export {
  activateCommand,
  activateLiveCommands,
  cancelCommand,
  commandReducer,
  completeCommand,
  confirmDraft,
  createCommandBook,
  createDraft,
  createMoveCommand,
  DEFAULT_COMMAND_PRIORITY,
  DEFAULT_MOVEMENT_MODE,
  getActiveMovementCommand,
  getCommand,
  getLiveMovementCommands,
  getMovementCommand,
  getPlayerCommands,
  isActiveMovementCommand,
  isFinishedCommand,
  isLiveMovementCommand,
  LIVE_MOVEMENT_STATUSES,
  MOVEMENT_MODES,
  pauseActiveCommands,
  pauseCommand,
  pruneFinishedCommands,
  removeCommand,
  replaceMovementCommand,
  resumeCommand,
} from '@touchline/shared';

export type { SamplePathOptions } from './path/PathSampler';
export {
  appendSample,
  DEFAULT_SAMPLE_SPACING,
  DEFAULT_SIMPLIFY_TOLERANCE,
  removeLastPoint,
  samplePath,
  simplifyPath,
} from './path/PathSampler';
export type {
  FieldBounds,
  PathRejection,
  PathValidationResult,
  ValidatePathOptions,
} from './path/PathValidator';
export {
  clampToBounds,
  describeRejection,
  isFinitePoint,
  MIN_PATH_LENGTH,
  PITCH_BOUNDS,
  validatePath,
} from './path/PathValidator';
export { distance, distanceToSegment, pathLength } from './path/pathMath';

export type { PlanningEvent, PlanningMode, PlanningUiState } from './state/planningState';
export {
  canConfirmDraft,
  canStartDrawing,
  INITIAL_PLANNING_STATE,
  PREVIEW_COMMAND_ID,
  reducePlanning,
} from './state/planningState';
export type { DragIntent, DragStartInput } from './state/dragRouting';
export { classifyDragStart, DRAW_START_SLACK_PX, resolvePinchStart } from './state/dragRouting';
