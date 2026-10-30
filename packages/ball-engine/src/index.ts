/**
 * @touchline/ball-engine — the ball as an independent, deterministic physical body: flight,
 * bounces, rolling, player contact, possession, dribbling and kicks.
 *
 * May depend only on @touchline/shared. Pure TypeScript with no UI or platform dependencies.
 * All units are SI (metres, seconds, m/s, rad/s).
 */
export type { BallConfig, KickPreset } from './BallConfig';
export { DEFAULT_BALL_CONFIG, DEFAULT_KICK_PRESETS, secondsToTicks } from './BallConfig';
export type {
  BallBody,
  BallEvent,
  BallSimulationState,
  ControlLossReason,
  PossessionSnapshot,
  TouchKind,
} from './BallState';
export {
  ballHeight,
  createBallSimulationState,
  horizontalSpeed,
  isAirborne,
  setRollingSpin,
  toBody,
  withBody,
} from './BallState';
export type { FlightStepResult } from './BallFlight';
export { applyContactFriction, stepFlight } from './BallFlight';
export { stepGround } from './BallGroundMovement';
export {
  integrateBall,
  isAtRest,
  isGrounded,
  isOutOfBounds,
  predictTrajectory,
} from './BallPhysics';
export type { PlayerContact } from './BallCollision';
export {
  deflectOffPlayer,
  findPlayerContacts,
  placeAtContact,
  stopAtBody,
  sweptCircleEntry,
} from './BallCollision';
export type { Contender } from './PossessionManager';
export {
  canControl,
  contestScore,
  controlSpeedLimit,
  cushionBall,
  getPossessionSnapshot,
  possessionStateFor,
  relativeSpeed,
  strongestContender,
} from './PossessionManager';
export type { KickFailureReason, KickLaunch, KickOutcome, KickResult } from './BallController';
export {
  applyDribbleTouch,
  applyKick,
  kickTravelDistance,
  launchVelocity,
  maxTouchDelta,
  PASS_ARRIVAL_SPEED,
  suggestKickPower,
  validateKick,
} from './BallController';
export type { BallStepResult } from './BallEngine';
export { BallEngine, stepBall } from './BallEngine';
