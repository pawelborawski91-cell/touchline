import {
  computeTeamShape,
  createTeamTactics,
  DEFAULT_FORMATION_ID,
  DEFAULT_TEAM_TACTICS,
  FORMATIONS,
  formationToPitch,
  lateralOf,
  lineOf,
  positionForSlot,
  TEAM_PLAY_STATES,
  type AttackDirection,
  type FormationId,
} from '@touchline/player-ai';
import { createInitialMatch, FIELD_LENGTH, FIELD_WIDTH, type Vector2 } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];
const DIRECTIONS: AttackDirection[] = [1, -1];
const LINEUP_SLOTS = [...new Set(createInitialMatch().players.map((p) => p.role))].sort();
const mirror = (p: Vector2): Vector2 => ({ x: FIELD_LENGTH - p.x, y: FIELD_WIDTH - p.y });

describe('formations', () => {
  it('defaults to 4-3-3 and offers 4-4-2 and 4-2-3-1', () => {
    expect(DEFAULT_FORMATION_ID).toBe('4-3-3');
    expect(DEFAULT_TEAM_TACTICS.formationId).toBe('4-3-3');
    expect(FORMATION_IDS.sort()).toEqual(['4-2-3-1', '4-3-3', '4-4-2']);
  });

  it.each(FORMATION_IDS)('%s has 11 positions covering every lineup slot once', (id) => {
    const { positions } = FORMATIONS[id];
    expect(positions).toHaveLength(11);
    expect(positions.map((p) => p.slot).sort()).toEqual(LINEUP_SLOTS);
    expect(positions.filter((p) => p.role === 'GK')).toHaveLength(1);
    expect(positions.filter((p) => p.role === 'CB')).toHaveLength(2);
    expect(positions.filter((p) => p.role === 'FB')).toHaveLength(2);
  });

  it.each(FORMATION_IDS)('%s uses normalised coordinates and is left–right symmetric', (id) => {
    const { positions } = FORMATIONS[id];
    for (const p of positions) {
      expect(p.line).toBeGreaterThanOrEqual(0);
      expect(p.line).toBeLessThanOrEqual(1);
      expect(Math.abs(p.horizontalPosition)).toBeLessThanOrEqual(1);
    }
    const lateral = positions.map((p) => `${p.line}|${p.horizontalPosition}`).sort();
    const mirrored = positions.map((p) => `${p.line}|${-p.horizontalPosition || 0}`).sort();
    expect(lateral).toEqual(mirrored);
  });

  it('maps normalised coordinates for both attacking directions', () => {
    expect(formationToPitch(0, 0, 1)).toEqual({ x: 0, y: FIELD_WIDTH / 2 });
    expect(formationToPitch(0, 0, -1)).toEqual({ x: FIELD_LENGTH, y: FIELD_WIDTH / 2 });
    // A team's right is +y attacking +x and −y attacking −x.
    expect(formationToPitch(0.5, 1, 1).y).toBe(FIELD_WIDTH);
    expect(formationToPitch(0.5, 1, -1).y).toBe(0);
    for (const direction of DIRECTIONS) {
      const p = formationToPitch(0.3, -0.4, direction);
      expect(lineOf(p.x, direction)).toBeCloseTo(0.3);
      expect(lateralOf(p.y, direction)).toBeCloseTo(-0.4);
      expect(mirror(formationToPitch(0.3, -0.4, 1))).toEqual(formationToPitch(0.3, -0.4, -1));
    }
  });

  it('finds positions by slot, with an index fallback', () => {
    expect(positionForSlot(FORMATIONS['4-3-3'], 'ST', 0)?.role).toBe('ST');
    expect(positionForSlot(FORMATIONS['4-2-3-1'], 'LCM', 0)?.role).toBe('AM');
    expect(positionForSlot(FORMATIONS['4-4-2'], 'LCM', 0)?.role).toBe('ST');
    expect(positionForSlot(FORMATIONS['4-3-3'], 'XX', 3)?.slot).toBe('LCB');
  });
});

describe('team shape', () => {
  const balls: Vector2[] = [];
  for (let x = 0; x <= FIELD_LENGTH; x += 15) {
    for (let y = 0; y <= FIELD_WIDTH; y += 17) balls.push({ x, y });
  }

  it('keeps every anchor inside the pitch for all formations, states, directions and balls', () => {
    for (const id of FORMATION_IDS) {
      const tactics = createTeamTactics({ formationId: id });
      for (const state of TEAM_PLAY_STATES) {
        for (const direction of DIRECTIONS) {
          for (const ball of balls) {
            const shape = computeTeamShape(FORMATIONS[id], tactics, state, ball, direction);
            for (const anchor of Object.values(shape.anchors)) {
              expect(anchor.x).toBeGreaterThan(0);
              expect(anchor.x).toBeLessThan(FIELD_LENGTH);
              expect(anchor.y).toBeGreaterThan(0);
              expect(anchor.y).toBeLessThan(FIELD_WIDTH);
            }
          }
        }
      }
    }
  });

  it('mirrors exactly between the two attacking directions', () => {
    for (const id of FORMATION_IDS) {
      for (const state of TEAM_PLAY_STATES) {
        const ball = { x: 40, y: 20 };
        const home = computeTeamShape(FORMATIONS[id], DEFAULT_TEAM_TACTICS, state, ball, 1);
        const away = computeTeamShape(
          FORMATIONS[id],
          DEFAULT_TEAM_TACTICS,
          state,
          mirror(ball),
          -1,
        );
        for (const [slot, anchor] of Object.entries(home.anchors)) {
          expect(mirror(anchor).x).toBeCloseTo(away.anchors[slot]!.x, 6);
          expect(mirror(anchor).y).toBeCloseTo(away.anchors[slot]!.y, 6);
        }
        expect(home.width).toBeCloseTo(away.width, 6);
        expect(home.depth).toBeCloseTo(away.depth, 6);
      }
    }
  });

  it('is compact without the ball and stretched with it', () => {
    const formation = FORMATIONS['4-3-3'];
    const ball = { x: 52.5, y: 34 };
    const attacking = computeTeamShape(formation, DEFAULT_TEAM_TACTICS, 'attacking', ball, 1);
    const defending = computeTeamShape(formation, DEFAULT_TEAM_TACTICS, 'defending', ball, 1);
    expect(attacking.width).toBeGreaterThan(defending.width + 10);
    expect(attacking.depth).toBeGreaterThan(defending.depth + 8);
    expect(attacking.defensiveLineX).toBeGreaterThan(defending.defensiveLineX);
  });

  it('shifts towards the ball, laterally and up the pitch', () => {
    const formation = FORMATIONS['4-3-3'];
    const centre = (ball: Vector2) => {
      const shape = computeTeamShape(formation, DEFAULT_TEAM_TACTICS, 'defending', ball, 1);
      const outfield = Object.entries(shape.anchors).filter(([slot]) => slot !== 'GK');
      return {
        x: outfield.reduce((sum, [, a]) => sum + a.x, 0) / outfield.length,
        y: outfield.reduce((sum, [, a]) => sum + a.y, 0) / outfield.length,
        line: shape.defensiveLineX,
      };
    };
    expect(centre({ x: 52, y: 60 }).y).toBeGreaterThan(centre({ x: 52, y: 8 }).y + 5);
    expect(centre({ x: 80, y: 34 }).line).toBeGreaterThan(centre({ x: 25, y: 34 }).line + 5);
  });

  it('keeps the back four and the holding midfielder goal-side of the ball when defending', () => {
    for (const direction of DIRECTIONS) {
      for (const ball of balls) {
        const shape = computeTeamShape(
          FORMATIONS['4-3-3'],
          DEFAULT_TEAM_TACTICS,
          'defending',
          ball,
          direction,
        );
        const ballLine = lineOf(Math.round(ball.x), direction);
        for (const slot of ['RB', 'RCB', 'LCB', 'LB', 'CM']) {
          const anchorLine = lineOf(shape.anchors[slot]!.x, direction);
          // The back line never drops below `minLine`, even for a ball on the goal line.
          expect(anchorLine).toBeLessThanOrEqual(
            Math.max(ballLine, DEFAULT_TEAM_TACTICS.minLine) + 1e-9,
          );
        }
      }
    }
  });

  it('keeps width and depth: wingers wide, the striker highest in possession', () => {
    const shape = computeTeamShape(
      FORMATIONS['4-3-3'],
      DEFAULT_TEAM_TACTICS,
      'attacking',
      { x: 60, y: 34 },
      1,
    );
    expect(Math.abs(shape.anchors.RW!.y - FIELD_WIDTH / 2)).toBeGreaterThan(22);
    expect(Math.abs(shape.anchors.LW!.y - FIELD_WIDTH / 2)).toBeGreaterThan(22);
    const outfieldX = Object.entries(shape.anchors)
      .filter(([slot]) => slot !== 'ST' && slot !== 'GK')
      .map(([, a]) => a.x);
    expect(shape.anchors.ST!.x).toBeGreaterThan(Math.max(...outfieldX));
    expect(shape.anchors.GK!.x).toBeLessThan(Math.min(...outfieldX));
  });

  it('is a pure function of its inputs', () => {
    const args = [
      FORMATIONS['4-2-3-1'],
      DEFAULT_TEAM_TACTICS,
      'neutral',
      { x: 33, y: 21 },
      -1,
    ] as const;
    expect(computeTeamShape(...args)).toEqual(computeTeamShape(...args));
  });
});
