import {
  AWAY_TEAM,
  CENTRE_CIRCLE_RADIUS,
  createInitialMatch,
  FIELD_LENGTH,
  FIELD_WIDTH,
  FORMATION_4_3_3,
  HOME_TEAM,
  type FormationRole,
  type MatchPlayer,
} from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const DEFENDERS: readonly FormationRole[] = ['RB', 'RCB', 'LCB', 'LB'];
const MIDFIELDERS: readonly FormationRole[] = ['RCM', 'CM', 'LCM'];
const FORWARDS: readonly FormationRole[] = ['RW', 'ST', 'LW'];

const match = createInitialMatch();
const homePlayers = match.players.filter((p) => p.teamId === HOME_TEAM.id);
const awayPlayers = match.players.filter((p) => p.teamId === AWAY_TEAM.id);

function countRoles(players: readonly MatchPlayer[], roles: readonly FormationRole[]) {
  return players.filter((p) => (roles as readonly string[]).includes(p.role)).length;
}

describe('initial match fixture', () => {
  it('has 22 players, 11 per team', () => {
    expect(match.players).toHaveLength(22);
    expect(homePlayers).toHaveLength(11);
    expect(awayPlayers).toHaveLength(11);
  });

  it('has exactly 2 goalkeepers, one per team', () => {
    expect(match.players.filter((p) => p.role === 'GK')).toHaveLength(2);
    expect(countRoles(homePlayers, ['GK'])).toBe(1);
    expect(countRoles(awayPlayers, ['GK'])).toBe(1);
  });

  it.each([
    ['home', homePlayers],
    ['away', awayPlayers],
  ] as const)('lines the %s team up in a 4-3-3', (_side, players) => {
    expect(countRoles(players, DEFENDERS)).toBe(4);
    expect(countRoles(players, MIDFIELDERS)).toBe(3);
    expect(countRoles(players, FORWARDS)).toBe(3);
  });

  it('uses unique ids and shirt numbers 1–11 per team', () => {
    expect(new Set(match.players.map((p) => p.id)).size).toBe(22);
    for (const players of [homePlayers, awayPlayers]) {
      expect(players.map((p) => p.shirtNumber).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
      ]);
    }
  });

  it('places every player on the pitch, in their own half, outside the centre circle', () => {
    for (const player of match.players) {
      const { x, y } = player.position;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(FIELD_LENGTH);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(FIELD_WIDTH);
      expect(Math.hypot(x - FIELD_LENGTH / 2, y - FIELD_WIDTH / 2)).toBeGreaterThan(
        CENTRE_CIRCLE_RADIUS,
      );
    }
    for (const player of homePlayers) expect(player.position.x).toBeLessThan(FIELD_LENGTH / 2);
    for (const player of awayPlayers) expect(player.position.x).toBeGreaterThan(FIELD_LENGTH / 2);
  });

  it('mirrors the teams symmetrically through the centre spot', () => {
    for (const home of homePlayers) {
      const away = awayPlayers.find((p) => p.role === home.role);
      expect(away).toBeDefined();
      expect(away?.shirtNumber).toBe(home.shirtNumber);
      expect(away?.position.x).toBeCloseTo(FIELD_LENGTH - home.position.x, 9);
      expect(away?.position.y).toBeCloseTo(FIELD_WIDTH - home.position.y, 9);
    }
  });

  it('faces each team towards the opponent goal', () => {
    for (const player of homePlayers) expect(player.facing).toBe(0);
    for (const player of awayPlayers) expect(player.facing).toBeCloseTo(Math.PI, 9);
  });

  it('starts with the ball on the centre spot, 0–0 at 00:00', () => {
    expect(match.ball.position).toEqual({ x: FIELD_LENGTH / 2, y: FIELD_WIDTH / 2, z: 0 });
    expect(match.score).toEqual({ home: 0, away: 0 });
    expect(match.clockSeconds).toBe(0);
    expect(match.home.name).toBe('NORTH CITY');
    expect(match.away.name).toBe('SOUTH UNITED');
  });

  it('returns independent snapshots so consumers cannot corrupt the fixture', () => {
    const a = createInitialMatch();
    const b = createInitialMatch();
    const first = a.players[0];
    expect(first).toBeDefined();
    if (first) first.position.x = 999;
    expect(b.players[0]?.position.x).not.toBe(999);
    expect(FORMATION_4_3_3[0]?.position.x).not.toBe(999);
  });

  it('gives every player movement attributes inside the documented ranges', () => {
    for (const { movement } of match.players) {
      expect(movement.maxSpeed).toBeGreaterThanOrEqual(5.5);
      expect(movement.maxSpeed).toBeLessThanOrEqual(8.5);
      expect(movement.acceleration).toBeGreaterThanOrEqual(2);
      expect(movement.acceleration).toBeLessThanOrEqual(4);
      expect(movement.deceleration).toBeGreaterThanOrEqual(3);
      expect(movement.deceleration).toBeLessThanOrEqual(6);
      expect(movement.agility).toBeGreaterThanOrEqual(0.5);
      expect(movement.agility).toBeLessThanOrEqual(1);
      expect(movement.turningSpeed).toBeGreaterThanOrEqual(180);
      expect(movement.turningSpeed).toBeLessThanOrEqual(360);
      expect(movement.stamina).toBeGreaterThanOrEqual(0);
      expect(movement.stamina).toBeLessThanOrEqual(1);
    }
  });

  it('derives movement attributes deterministically, with wingers faster than goalkeepers', () => {
    expect(createInitialMatch().players.map((p) => p.movement)).toEqual(
      match.players.map((p) => p.movement),
    );
    const speedOf = (role: FormationRole) =>
      homePlayers.find((p) => p.role === role)!.movement.maxSpeed;
    expect(speedOf('RW')).toBeGreaterThan(speedOf('GK'));
  });
});
