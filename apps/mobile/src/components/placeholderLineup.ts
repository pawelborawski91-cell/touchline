import { DEFAULT_MATCH_CONFIG, type Vector2 } from '@touchline/shared';

import type { TokenKit, TokenNumber } from '../assets/tokens';

export interface LineupToken {
  kit: TokenKit;
  number: TokenNumber;
  /** Pitch position in metres; x along the length, y across the width. */
  position: Vector2;
}

// Display-only kickoff shape for the placeholder screen; not simulation state.
const BLUE_HALF: ReadonlyArray<Omit<LineupToken, 'kit'>> = [
  { number: 'gk', position: { x: 4, y: 34 } },
  { number: '02', position: { x: 20, y: 57 } },
  { number: '04', position: { x: 16, y: 41 } },
  { number: '05', position: { x: 16, y: 27 } },
  { number: '03', position: { x: 20, y: 11 } },
  { number: '06', position: { x: 30, y: 34 } },
  { number: '08', position: { x: 41, y: 47 } },
  { number: '10', position: { x: 45, y: 23 } },
];

const { fieldLength, fieldWidth } = DEFAULT_MATCH_CONFIG;

export const PLACEHOLDER_LINEUP: readonly LineupToken[] = [
  ...BLUE_HALF.map((token) => ({ ...token, kit: 'blue' as const })),
  ...BLUE_HALF.map((token) => ({
    ...token,
    kit: 'red' as const,
    position: { x: fieldLength - token.position.x, y: fieldWidth - token.position.y },
  })),
];
