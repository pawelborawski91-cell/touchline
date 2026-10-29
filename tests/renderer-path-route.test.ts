import { remainingRoute } from '@touchline/renderer/core';
import { describe, expect, it } from 'vitest';

const PATH = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 20, y: 10 },
];

describe('remainingRoute', () => {
  it('draws the whole path before the command has started', () => {
    expect(remainingRoute(PATH, { x: 3, y: 1 }, -1)).toEqual(PATH);
    expect(remainingRoute(PATH, null, 2)).toEqual(PATH);
  });

  it('starts at the player and continues from the current waypoint', () => {
    expect(remainingRoute(PATH, { x: 10, y: 4 }, 2)).toEqual([
      { x: 10, y: 4 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ]);
  });

  it('keeps only the final leg when heading for the last waypoint', () => {
    expect(remainingRoute(PATH, { x: 15, y: 10 }, 3)).toEqual([
      { x: 15, y: 10 },
      { x: 20, y: 10 },
    ]);
    expect(remainingRoute(PATH, { x: 15, y: 10 }, 99)).toEqual([
      { x: 15, y: 10 },
      { x: 20, y: 10 },
    ]);
  });

  it('never mutates the command path', () => {
    const copy = PATH.map((p) => ({ ...p }));
    remainingRoute(PATH, { x: 5, y: 0 }, 1).push({ x: 99, y: 99 });
    expect(PATH).toEqual(copy);
  });
});
