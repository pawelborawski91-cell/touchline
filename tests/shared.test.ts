import { DEFAULT_MATCH_CONFIG, getTicksPerTurn, type MatchConfig } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

describe('@touchline/shared', () => {
  it('matches the technical-spec targets', () => {
    const expected: MatchConfig = {
      turnDuration: 5,
      fixedDeltaTime: 0.05,
      fieldWidth: 68,
      fieldLength: 105,
    };
    expect(DEFAULT_MATCH_CONFIG).toEqual(expected);
  });

  it('derives 100 ticks per turn at 20 Hz', () => {
    expect(getTicksPerTurn(DEFAULT_MATCH_CONFIG)).toBe(100);
    expect(1 / DEFAULT_MATCH_CONFIG.fixedDeltaTime).toBeCloseTo(20);
  });

  it('freezes the default config', () => {
    expect(Object.isFrozen(DEFAULT_MATCH_CONFIG)).toBe(true);
  });
});
