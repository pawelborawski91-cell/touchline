/**
 * @touchline/physics — rendering-independent player movement physics.
 *
 * May depend only on @touchline/shared. Must not import React, React Native, Expo, Skia,
 * Zustand, or any rendering/UI package. All functions are pure and deterministic.
 */
export {
  angleDifference,
  clamp,
  degToRad,
  lerpAngle,
  moveTowards,
  normalizeAngle,
  rotateTowards,
} from './math/angles';
export {
  add,
  angleOf,
  distance,
  dot,
  fromAngle,
  length,
  lerp,
  normalize,
  scale,
  sub,
  vec,
  ZERO,
} from './math/vector';
export { getSpeedCap, MOVEMENT_MODE_SPEED, type MovementMode } from './movement/MovementModes';
export {
  DEFAULT_STAMINA_CONFIG,
  drainStamina,
  staminaSpeedCeiling,
  type StaminaConfig,
} from './movement/Stamina';
export {
  alignedSpeed,
  arrivalSpeed,
  BRAKING_MARGIN,
  computeSteering,
  headingError,
  stoppingDistance,
  type MovementIntent,
  type SteeringOutput,
} from './movement/SteeringController';
export {
  availableAcceleration,
  PITCH_MOVEMENT_BOUNDS,
  stepMovement,
  turnRate,
  type Bounds,
  type MovementBody,
} from './movement/PlayerMovement';
export {
  createFollowerState,
  DEFAULT_PATH_FOLLOWER_CONFIG,
  followPath,
  preparePath,
  type FollowerState,
  type FollowResult,
  type PathFollowerConfig,
  type PreparedPath,
} from './movement/PathFollower';
