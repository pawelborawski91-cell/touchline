import { FIELD_LENGTH, FIELD_WIDTH } from '../field';
import type { Vector2 } from '../math';
import type { MatchPlayer, MatchSnapshot, TeamInfo, TeamSide } from '../match';
import type { PlayerMovementAttributes } from '../player';

export type FormationRole =
  'GK' | 'RB' | 'RCB' | 'LCB' | 'LB' | 'RCM' | 'CM' | 'LCM' | 'RW' | 'ST' | 'LW';

export interface FormationSlot {
  role: FormationRole;
  shirtNumber: number;
  /** Kickoff position for a team defending the x = 0 goal, in metres. */
  position: Vector2;
}

/**
 * 4-3-3 kickoff shape for the team defending x = 0 and attacking +x. Facing +x, a player's right
 * is +y, so right-sided roles sit at larger y. Everyone is in their own half and outside the
 * centre circle.
 */
export const FORMATION_4_3_3: readonly FormationSlot[] = [
  { role: 'GK', shirtNumber: 1, position: { x: 4.5, y: 34 } },
  { role: 'RB', shirtNumber: 2, position: { x: 21, y: 57 } },
  { role: 'RCB', shirtNumber: 5, position: { x: 16.5, y: 42.5 } },
  { role: 'LCB', shirtNumber: 4, position: { x: 16.5, y: 25.5 } },
  { role: 'LB', shirtNumber: 3, position: { x: 21, y: 11 } },
  { role: 'RCM', shirtNumber: 8, position: { x: 33, y: 46 } },
  { role: 'CM', shirtNumber: 6, position: { x: 29, y: 34 } },
  { role: 'LCM', shirtNumber: 10, position: { x: 33, y: 22 } },
  { role: 'RW', shirtNumber: 7, position: { x: 46, y: 58 } },
  { role: 'ST', shirtNumber: 9, position: { x: 42, y: 34 } },
  { role: 'LW', shirtNumber: 11, position: { x: 46, y: 10 } },
];

export const HOME_TEAM: TeamInfo = { id: 'north-city', name: 'NORTH CITY', side: 'home' };
export const AWAY_TEAM: TeamInfo = { id: 'south-united', name: 'SOUTH UNITED', side: 'away' };

/** Point reflection through the centre spot: keeps each team's left/right consistent. */
function mirrorThroughCentre(position: Vector2): Vector2 {
  return { x: FIELD_LENGTH - position.x, y: FIELD_WIDTH - position.y };
}

/** Role baselines for movement attributes (prototype tuning values). */
const ROLE_MOVEMENT: Readonly<Record<FormationRole, PlayerMovementAttributes>> = {
  GK: {
    maxSpeed: 6.0,
    acceleration: 2.6,
    deceleration: 4.6,
    agility: 0.7,
    turningSpeed: 240,
    stamina: 0.7,
  },
  RB: {
    maxSpeed: 7.8,
    acceleration: 3.4,
    deceleration: 4.8,
    agility: 0.8,
    turningSpeed: 290,
    stamina: 0.9,
  },
  RCB: {
    maxSpeed: 7.0,
    acceleration: 2.8,
    deceleration: 4.4,
    agility: 0.65,
    turningSpeed: 230,
    stamina: 0.8,
  },
  LCB: {
    maxSpeed: 7.0,
    acceleration: 2.8,
    deceleration: 4.4,
    agility: 0.65,
    turningSpeed: 230,
    stamina: 0.8,
  },
  LB: {
    maxSpeed: 7.8,
    acceleration: 3.4,
    deceleration: 4.8,
    agility: 0.8,
    turningSpeed: 290,
    stamina: 0.9,
  },
  RCM: {
    maxSpeed: 7.3,
    acceleration: 3.1,
    deceleration: 5.0,
    agility: 0.8,
    turningSpeed: 300,
    stamina: 0.95,
  },
  CM: {
    maxSpeed: 7.1,
    acceleration: 3.0,
    deceleration: 5.0,
    agility: 0.85,
    turningSpeed: 310,
    stamina: 0.95,
  },
  LCM: {
    maxSpeed: 7.3,
    acceleration: 3.1,
    deceleration: 5.0,
    agility: 0.8,
    turningSpeed: 300,
    stamina: 0.95,
  },
  RW: {
    maxSpeed: 8.3,
    acceleration: 3.8,
    deceleration: 5.4,
    agility: 0.95,
    turningSpeed: 340,
    stamina: 0.8,
  },
  ST: {
    maxSpeed: 8.0,
    acceleration: 3.6,
    deceleration: 5.2,
    agility: 0.85,
    turningSpeed: 310,
    stamina: 0.75,
  },
  LW: {
    maxSpeed: 8.3,
    acceleration: 3.8,
    deceleration: 5.4,
    agility: 0.95,
    turningSpeed: 340,
    stamina: 0.8,
  },
};

/** Deterministic value in [-1, 1] derived from a string (FNV-1a). */
function hashUnit(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash / 0xffffffff) * 2 - 1;
}

const clampTo = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Role baseline with a small, deterministic per-player variation, kept inside spec ranges. */
export function createMovementAttributes(
  role: FormationRole,
  playerId: string,
): PlayerMovementAttributes {
  const base = ROLE_MOVEMENT[role];
  const vary = (field: string, spread: number) => 1 + hashUnit(`${playerId}:${field}`) * spread;
  return {
    maxSpeed: clampTo(base.maxSpeed * vary('speed', 0.04), 5.5, 8.5),
    acceleration: clampTo(base.acceleration * vary('accel', 0.05), 2, 4),
    deceleration: clampTo(base.deceleration * vary('decel', 0.05), 3, 6),
    agility: clampTo(base.agility * vary('agility', 0.05), 0.5, 1),
    turningSpeed: clampTo(base.turningSpeed * vary('turn', 0.05), 180, 360),
    stamina: clampTo(base.stamina * vary('stamina', 0.05), 0, 1),
  };
}

function createLineup(team: TeamInfo, formation: readonly FormationSlot[]): MatchPlayer[] {
  const isHome = team.side === 'home';
  return formation.map((slot) => {
    const id = `${team.id}-${slot.shirtNumber}`;
    return {
      id,
      teamId: team.id,
      shirtNumber: slot.shirtNumber,
      role: slot.role,
      position: isHome ? { ...slot.position } : mirrorThroughCentre(slot.position),
      velocity: { x: 0, y: 0 },
      facing: isHome ? 0 : Math.PI,
      movement: createMovementAttributes(slot.role, id),
      staminaCurrent: 1,
      activeCommandId: null,
    };
  });
}

export function createInitialMatch(): MatchSnapshot {
  return {
    tick: 0,
    phase: 'planning',
    clockSeconds: 0,
    score: { home: 0, away: 0 },
    home: HOME_TEAM,
    away: AWAY_TEAM,
    players: [
      ...createLineup(HOME_TEAM, FORMATION_4_3_3),
      ...createLineup(AWAY_TEAM, FORMATION_4_3_3),
    ],
    ball: {
      position: { x: FIELD_LENGTH / 2, y: FIELD_WIDTH / 2, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    },
  };
}

export function getTeamSide(snapshot: MatchSnapshot, teamId: string): TeamSide | null {
  if (teamId === snapshot.home.id) return 'home';
  if (teamId === snapshot.away.id) return 'away';
  return null;
}
