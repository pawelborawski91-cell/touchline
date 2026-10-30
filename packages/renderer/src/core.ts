// Platform-free entry point: pure camera and coordinate maths, safe to import from Node and tests.
export type {
  CameraConfig,
  CameraState,
  CenterLimits,
  ScreenPoint,
  ViewTransform,
  Viewport,
  WorldBounds,
  WorldPoint,
} from './types/renderer';
export { screenLengthToWorld, screenToWorld } from './coordinates/screenToWorld';
export { worldLengthToScreen, worldToScreen } from './coordinates/worldToScreen';
export {
  clampCamera,
  clampZoom,
  createInitialCamera,
  DEFAULT_CAMERA_CONFIG,
  getCameraScale,
  getCenterLimits,
  getFitScale,
  getViewTransform,
  panCamera,
  PITCH_BOUNDS,
  PITCH_SURROUND_METRES,
  zoomCameraAt,
} from './camera/cameraTransforms';
export type { HitTarget } from './interaction/hitTest';
export {
  findMarkerAt,
  MARKER_HIT_SLACK_PX,
  PLAYER_MARKER_RADIUS,
  screenDistanceTo,
} from './interaction/hitTest';
export type { PathHeading } from './path/pathGeometry';
export { getPathEnd, pointsAlongPath, remainingRoute } from './path/pathGeometry';
export type { BallFrameValues, BallProjection, BallTrailPoint } from './ball/ballProjection';
export {
  BALL_LIFT_KNEE,
  BALL_LIFT_PX,
  BALL_STALK_MIN_HEIGHT,
  BALL_TRAIL_MIN_SPEED,
  ballLiftPx,
  ballTrail,
  projectBall,
  readBallFrame,
} from './ball/ballProjection';
