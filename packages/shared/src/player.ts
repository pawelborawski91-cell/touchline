import type { Vector2 } from './math';

/** Per-player movement capabilities. Prototype tuning values, not real-world measurements. */
export interface PlayerMovementAttributes {
  /** Top speed in m/s (5.5–8.5). */
  maxSpeed: number;
  /** Speed gained per second when speeding up, m/s² (2–4). */
  acceleration: number;
  /** Speed shed per second when braking, m/s² (3–6). */
  deceleration: number;
  /** 0.5–1; scales turning and how well speed is kept through turns. */
  agility: number;
  /** Peak turning rate in degrees per second (180–360). */
  turningSpeed: number;
  /** Endurance 0–1; higher drains stamina more slowly. */
  stamina: number;
}

/** Ball-handling capabilities, 0–1. Prototype tuning values. */
export interface PlayerTechnicalAttributes {
  /** Quality of touches: how hard a dribble touch can redirect the ball, kick cleanliness. */
  technique: number;
  /** First touch: how fast a ball can be brought under control and how softly it is cushioned. */
  ballControl: number;
}

export const DEFAULT_TECHNICAL_ATTRIBUTES: Readonly<PlayerTechnicalAttributes> = Object.freeze({
  technique: 0.6,
  ballControl: 0.6,
});

/** Pace a movement command is executed at; caps the player's speed for that command. */
export type MovementMode = 'walk' | 'jog' | 'run' | 'sprint';

export const DEFAULT_MOVEMENT_MODE: MovementMode = 'run';

export const MOVEMENT_MODES: readonly MovementMode[] = ['walk', 'jog', 'run', 'sprint'];

export interface PlayerState {
  id: string;
  teamId: string;
  position: Vector2;
  /** World velocity in m/s. */
  velocity: Vector2;
  /** Heading in radians; 0 faces +x, π/2 faces +y. */
  facing: number;
  role: string;
  movement: PlayerMovementAttributes;
  technical: PlayerTechnicalAttributes;
  /** Remaining stamina, 0–1. */
  staminaCurrent: number;
  activeCommandId: string | null;
}
