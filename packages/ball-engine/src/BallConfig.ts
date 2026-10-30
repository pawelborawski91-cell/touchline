import { BALL_RADIUS, FIELD_LENGTH, FIELD_WIDTH, type KickType } from '@touchline/shared';

/**
 * Launch parameters of one kick type. `power` (0–1) maps linearly onto the speed range and
 * `lift` (0–1) onto the launch-angle range. `spin` is the spin about the horizontal axis across
 * the kick direction, in rad/s: positive is topspin, negative backspin; `'roll'` gives the spin of
 * a ball rolling at the launch speed (no skid on the grass).
 */
export interface KickPreset {
  minSpeed: number;
  maxSpeed: number;
  minLaunchAngle: number;
  maxLaunchAngle: number;
  /** Lift used when a caller does not choose one (the UI's default). */
  defaultLift: number;
  spin: number | 'roll';
}

const deg = (degrees: number) => (degrees * Math.PI) / 180;

/** Initial gameplay presets, not final balancing values. */
export const DEFAULT_KICK_PRESETS: Readonly<Record<KickType, KickPreset>> = Object.freeze({
  pass: {
    minSpeed: 5,
    maxSpeed: 18,
    minLaunchAngle: 0,
    maxLaunchAngle: deg(12),
    defaultLift: 0,
    spin: 'roll',
  },
  shot: {
    minSpeed: 16,
    maxSpeed: 30,
    minLaunchAngle: 0,
    maxLaunchAngle: deg(22),
    defaultLift: 0.2,
    spin: 6,
  },
  clearance: {
    minSpeed: 18,
    maxSpeed: 29,
    minLaunchAngle: deg(22),
    maxLaunchAngle: deg(45),
    defaultLift: 0.5,
    spin: -8,
  },
  lob: {
    minSpeed: 8,
    maxSpeed: 22,
    minLaunchAngle: deg(38),
    maxLaunchAngle: deg(60),
    defaultLift: 0.4,
    spin: -14,
  },
});

/** Ball physics and interaction tuning. SI units throughout. */
export interface BallConfig {
  radius: number;
  gravity: number;
  fieldLength: number;
  fieldWidth: number;

  // Air
  /** Quadratic drag factor k in a = −k·|v|·v, 1/m (½ρC_dA/m ≈ 0.012 for a football). */
  airDrag: number;
  /** Magnus factor c in a = c·(ω × v). */
  magnus: number;
  /** Fractional spin loss per second in flight. */
  airSpinDecay: number;

  // Bounce
  /** Vertical coefficient of restitution on grass. */
  restitution: number;
  /** Share of the contact-point slip removed by friction at each bounce (0–1). */
  bounceFriction: number;
  /** Landing speeds below this settle the ball on the grass instead of bouncing, m/s. */
  minBounceSpeed: number;

  // Ground
  /** Rolling resistance as a fraction of g (constant deceleration). */
  rollingResistance: number;
  /** Speed-proportional grass drag, 1/s. */
  groundFriction: number;
  /** Kinetic friction coefficient while the ball skids (slip between ball and grass). */
  slidingFriction: number;
  /** Fractional loss per second of spin about the vertical axis on the ground. */
  groundSpinDecay: number;

  // Player contact
  /** Radius of a player's body for deflections, m. */
  playerBodyRadius: number;
  /** Restitution of a ball deflecting off a player's body. */
  bodyRestitution: number;
  /** Balls whose underside is higher than this pass over players untouched, m. */
  bodyContactHeight: number;

  // Control
  /** Leg reach: distance from a player's centre within which they can touch the ball, m. */
  controlReach: number;
  /** Balls whose underside is higher than this cannot be controlled by a player on the ground, m. */
  controlHeight: number;
  /** Highest ball-to-player relative speed that can be controlled: base + perSkill·ballControl. */
  controlSpeedBase: number;
  controlSpeedPerSkill: number;
  /** Share of the relative velocity absorbed by a first touch: base + perSkill·ballControl. */
  cushionBase: number;
  cushionPerSkill: number;

  // Dribbling
  /** Where the dribbler aims to keep the ball, ahead of their centre along their heading, m. */
  preferredControlDistance: number;
  /** Time between dribble touches, s. */
  touchInterval: number;
  /** Largest velocity change one dribble touch can give: base + perSkill·technique, m/s. */
  maxTouchDeltaBase: number;
  maxTouchDeltaPerSkill: number;
  /** Control is lost once the ball is this far from the controller, m. */
  loseDistance: number;

  // Contests
  /** Players this close to the ball take part in a challenge for it, m. */
  contestRadius: number;
  /** Score bonus for the current controller, so control does not flicker between equal players. */
  incumbentBonus: number;

  // Kicks
  /** Furthest ball (horizontal centre distance) a player can kick, m. */
  kickReach: number;
  /** Highest ball underside that can be kicked, m. */
  kickMaxHeight: number;
  /** A ball moving faster than this relative to the player cannot be struck cleanly, m/s. */
  kickMaxRelativeSpeed: number;
  /** After kicking, the kicker cannot control the ball again for this long, s. */
  kickReleaseTime: number;
  kickPresets: Readonly<Record<KickType, KickPreset>>;
}

export const DEFAULT_BALL_CONFIG: Readonly<BallConfig> = Object.freeze({
  radius: BALL_RADIUS,
  gravity: 9.81,
  fieldLength: FIELD_LENGTH,
  fieldWidth: FIELD_WIDTH,

  airDrag: 0.012,
  magnus: 0.004,
  airSpinDecay: 0.1,

  restitution: 0.55,
  bounceFriction: 0.3,
  minBounceSpeed: 0.9,

  rollingResistance: 0.055,
  groundFriction: 0.2,
  slidingFriction: 0.4,
  groundSpinDecay: 2,

  playerBodyRadius: 0.35,
  bodyRestitution: 0.3,
  bodyContactHeight: 1.9,

  controlReach: 0.85,
  controlHeight: 0.9,
  controlSpeedBase: 4,
  controlSpeedPerSkill: 10,
  cushionBase: 0.6,
  cushionPerSkill: 0.35,

  preferredControlDistance: 0.65,
  touchInterval: 0.3,
  maxTouchDeltaBase: 3,
  maxTouchDeltaPerSkill: 6,
  loseDistance: 1.8,

  contestRadius: 1.5,
  incumbentBonus: 0.05,

  kickReach: 1,
  kickMaxHeight: 0.7,
  kickMaxRelativeSpeed: 18,
  kickReleaseTime: 0.4,
  kickPresets: DEFAULT_KICK_PRESETS,
});

/** Whole fixed steps covering `seconds` (at least one). */
export function secondsToTicks(seconds: number, fixedDeltaTime: number): number {
  return Math.max(1, Math.round(seconds / fixedDeltaTime));
}
