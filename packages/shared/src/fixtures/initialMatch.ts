import { FIELD_LENGTH, FIELD_WIDTH } from '../field';
import type { Vector2 } from '../math';
import type { MatchPlayer, MatchSnapshot, TeamInfo, TeamSide } from '../match';

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

function createLineup(team: TeamInfo, formation: readonly FormationSlot[]): MatchPlayer[] {
  const isHome = team.side === 'home';
  return formation.map((slot) => ({
    id: `${team.id}-${slot.shirtNumber}`,
    teamId: team.id,
    shirtNumber: slot.shirtNumber,
    role: slot.role,
    position: isHome ? { ...slot.position } : mirrorThroughCentre(slot.position),
    velocity: { x: 0, y: 0 },
    facing: isHome ? 0 : Math.PI,
    staminaCurrent: 1,
    activeCommandId: null,
  }));
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
