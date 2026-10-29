/**
 * @touchline/planning — player commands, trajectories, and planning interaction rules.
 *
 * Pure TypeScript; may depend only on @touchline/shared. All paths are world metres.
 */
export type { CommandStatus, CommandType, PlayerCommand } from './commands/PlayerCommand';
export {
  DEFAULT_COMMAND_PRIORITY,
  isLiveMovementCommand,
  LIVE_MOVEMENT_STATUSES,
} from './commands/PlayerCommand';
export type { MoveCommandInput } from './commands/CommandFactory';
export { createMoveCommand } from './commands/CommandFactory';
export type { CommandAction, CommandBook, CreateDraftResult } from './commands/CommandManager';
export {
  cancelCommand,
  commandReducer,
  confirmDraft,
  createCommandBook,
  createDraft,
  getCommand,
  getLiveMovementCommands,
  getMovementCommand,
  getPlayerCommands,
  removeCommand,
  replaceMovementCommand,
} from './commands/CommandManager';

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
