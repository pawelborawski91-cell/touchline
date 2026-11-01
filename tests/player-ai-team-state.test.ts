import type { PossessionSnapshot } from '@touchline/ball-engine';
import {
  DEFAULT_AI_CONFIG,
  INITIAL_POSSESSION_MEMORY,
  interceptPoint,
  possessingTeam,
  predictBallPosition,
  resolvePlayState,
  SpatialGrid,
  updatePossessionMemory,
  type BallPerception,
  type PossessionMemory,
} from '@touchline/player-ai';
import { createInitialMatch } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

import { AWAY, HOME } from './ai-fixtures';

const cfg = DEFAULT_AI_CONFIG;

const ball = (overrides: Partial<BallPerception> = {}): BallPerception => ({
  position: { x: 50, y: 34 },
  velocity: { x: 0, y: 0 },
  height: 0,
  speed: 0,
  airborne: false,
  heading: null,
  isFree: false,
  isOutOfPlay: false,
  ...overrides,
});

const controlledBy = (teamId: string): PossessionSnapshot => ({
  state: 'controlled',
  controllerPlayerId: `${teamId}-9`,
  controllerTeamId: teamId,
  contenderIds: [],
  lastTouchPlayerId: `${teamId}-9`,
  lastTouchTeamId: teamId,
});

const free = (lastTouchTeamId: string | null): PossessionSnapshot => ({
  state: 'free',
  controllerPlayerId: null,
  controllerTeamId: null,
  contenderIds: [],
  lastTouchPlayerId: lastTouchTeamId ? `${lastTouchTeamId}-9` : null,
  lastTouchTeamId,
});

/** Feeds the same possession for `ticks` ticks starting at `from`. */
function hold(
  memory: PossessionMemory,
  possession: PossessionSnapshot,
  from: number,
  ticks: number,
  perception: BallPerception = ball(),
): PossessionMemory {
  let current = memory;
  for (let tick = from; tick < from + ticks; tick += 1) {
    current = updatePossessionMemory(current, possession, perception, tick, cfg);
  }
  return current;
}

describe('possession and team play state', () => {
  it('reads possession from the controller, or from a travelling ball', () => {
    expect(possessingTeam(controlledBy(HOME), ball(), cfg)).toBe(HOME);
    expect(
      possessingTeam(free(HOME), ball({ speed: cfg.loosePassSpeed + 1, isFree: true }), cfg),
    ).toBe(HOME);
    expect(possessingTeam(free(HOME), ball({ speed: 0.5, isFree: true }), cfg)).toBeNull();
    expect(possessingTeam({ ...free(HOME), state: 'out_of_play' }, ball(), cfg)).toBeNull();
  });

  it('starts neutral; the first possession is attacking, not a transition', () => {
    expect(resolvePlayState(HOME, INITIAL_POSSESSION_MEMORY, 0)).toBe('neutral');
    const memory = hold(INITIAL_POSSESSION_MEMORY, controlledBy(HOME), 0, 3);
    expect(memory.possessingTeamId).toBe(HOME);
    expect(resolvePlayState(HOME, memory, 3)).toBe('attacking');
    expect(resolvePlayState(AWAY, memory, 3)).toBe('defending');
  });

  it('opens a transition only after a confirmed turnover, then settles', () => {
    let memory = hold(INITIAL_POSSESSION_MEMORY, controlledBy(HOME), 0, 10);
    memory = hold(memory, controlledBy(AWAY), 10, cfg.turnoverConfirmTicks);
    expect(memory.possessingTeamId).toBe(HOME);
    memory = hold(memory, controlledBy(AWAY), 10 + cfg.turnoverConfirmTicks, 1);
    expect(memory.possessingTeamId).toBe(AWAY);
    const changed = memory.changedAtTick;
    expect(resolvePlayState(AWAY, memory, changed)).toBe('transition_attack');
    expect(resolvePlayState(HOME, memory, changed)).toBe('transition_defense');
    const settled = changed + cfg.transitionTicks;
    expect(resolvePlayState(AWAY, memory, settled)).toBe('attacking');
    expect(resolvePlayState(HOME, memory, settled)).toBe('defending');
  });

  it('ignores a tackle that is won straight back', () => {
    let memory = hold(INITIAL_POSSESSION_MEMORY, controlledBy(HOME), 0, 10);
    memory = hold(memory, controlledBy(AWAY), 10, cfg.turnoverConfirmTicks - 2);
    memory = hold(memory, controlledBy(HOME), 20, 5);
    expect(memory.possessingTeamId).toBe(HOME);
    expect(memory.transitionTeamId).toBeNull();
  });

  it('keeps possession with the holder during a contest and a short loose ball', () => {
    let memory = hold(INITIAL_POSSESSION_MEMORY, controlledBy(HOME), 0, 10);
    const contested: PossessionSnapshot = {
      ...controlledBy(HOME),
      state: 'contested',
      contenderIds: [`${HOME}-9`, `${AWAY}-4`],
    };
    memory = hold(memory, contested, 10, 30);
    expect(memory.possessingTeamId).toBe(HOME);
    memory = hold(memory, free(AWAY), 40, cfg.looseBallGraceTicks, ball({ isFree: true }));
    expect(memory.possessingTeamId).toBe(HOME);
    memory = hold(memory, free(AWAY), 40 + cfg.looseBallGraceTicks, 1, ball({ isFree: true }));
    expect(memory.possessingTeamId).toBeNull();
    expect(resolvePlayState(HOME, memory, 60)).toBe('neutral');
  });

  it('a pass in flight keeps the passing team in possession', () => {
    let memory = hold(INITIAL_POSSESSION_MEMORY, controlledBy(HOME), 0, 10);
    memory = hold(memory, free(HOME), 10, 40, ball({ isFree: true, speed: 12 }));
    expect(memory.possessingTeamId).toBe(HOME);
    expect(memory).toBe(hold(memory, free(HOME), 50, 1, ball({ isFree: true, speed: 12 })));
  });
});

describe('ball and spatial perception', () => {
  const players = createInitialMatch().players;

  it('spatial grid queries match a brute-force search', () => {
    const grid = new SpatialGrid(players);
    for (const point of [
      { x: 10, y: 10 },
      { x: 52.5, y: 34 },
      { x: 90, y: 50 },
    ]) {
      for (const radius of [5, 15, 40]) {
        const found: string[] = [];
        grid.forEachWithin(point, radius, (p) => found.push(p.id));
        const expected = players
          .filter((p) => Math.hypot(p.position.x - point.x, p.position.y - point.y) <= radius)
          .map((p) => p.id);
        expect(found.sort()).toEqual(expected.sort());
      }
    }
  });

  it('nearest() honours the radius and the filter', () => {
    const grid = new SpatialGrid(players);
    const nearest = grid.nearest({ x: 42, y: 34 }, 30, (p) => p.teamId === AWAY);
    expect(nearest?.player.id).toBe('south-united-9');
    expect(grid.nearest({ x: 42, y: 34 }, 1, (p) => p.teamId === AWAY)).toBeNull();
  });

  it('predicts a rolling ball and finds the intercept point', () => {
    const rolling = ball({ velocity: { x: 10, y: 0 }, speed: 10, heading: 0, isFree: true });
    const later = predictBallPosition(rolling, 1);
    expect(later.x).toBeGreaterThan(55);
    expect(later.x).toBeLessThan(60);
    expect(later.y).toBe(34);
    const still = ball({ isFree: true });
    expect(interceptPoint(still, { position: { x: 40, y: 34 } }, 5).point).toEqual({
      x: 50,
      y: 34,
    });
    const ahead = interceptPoint(rolling, { position: { x: 60, y: 34 } }, 6);
    expect(ahead.point.x).toBeGreaterThan(50);
    expect(ahead.point.x).toBeLessThanOrEqual(60.8);
  });
});
