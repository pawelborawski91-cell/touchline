import type { TeamPlayState } from '../core/AIDecision';
import { DEFAULT_FORMATION_ID, type FormationId } from './Formation';

/**
 * How the formation is deformed in one play state. All values are in normalised team
 * coordinates (see `FormationPosition`).
 */
export interface ShapeParameters {
  /** Back line height when the ball is at the halfway line. */
  defensiveLine: number;
  /** How far the whole block moves up/down per unit of ball progress. */
  ballFollowLine: number;
  /** Stretch (> 1) or compress (< 1) of the distances between lines. */
  depthScale: number;
  /** Stretch (> 1) or compress (< 1) of lateral positions. */
  widthScale: number;
  /** Lateral shift towards the ball per unit of ball lateral position. */
  ballFollowLateral: number;
  /** Defenders and the holding midfielder stay at least this far goal-side of the ball. */
  goalSideMargin: number | null;
}

export interface TeamTactics {
  formationId: FormationId;
  shape: Readonly<Record<TeamPlayState, ShapeParameters>>;
  /** Back line never drops below / pushes above these lines. */
  minLine: number;
  maxLine: number;
  /** Players inside this lateral band are "central". */
  centralBand: number;
}

export const DEFAULT_SHAPE: Readonly<Record<TeamPlayState, ShapeParameters>> = Object.freeze({
  attacking: {
    defensiveLine: 0.3,
    ballFollowLine: 0.3,
    depthScale: 1.05,
    widthScale: 1.08,
    ballFollowLateral: 0.16,
    goalSideMargin: null,
  },
  transition_attack: {
    defensiveLine: 0.26,
    ballFollowLine: 0.3,
    depthScale: 1.1,
    widthScale: 1.0,
    ballFollowLateral: 0.2,
    goalSideMargin: null,
  },
  neutral: {
    defensiveLine: 0.22,
    ballFollowLine: 0.3,
    depthScale: 0.95,
    widthScale: 0.94,
    ballFollowLateral: 0.22,
    goalSideMargin: 0.02,
  },
  defending: {
    defensiveLine: 0.17,
    ballFollowLine: 0.28,
    depthScale: 0.8,
    widthScale: 0.78,
    ballFollowLateral: 0.3,
    goalSideMargin: 0.03,
  },
  transition_defense: {
    defensiveLine: 0.2,
    ballFollowLine: 0.28,
    depthScale: 0.88,
    widthScale: 0.85,
    ballFollowLateral: 0.28,
    goalSideMargin: 0.03,
  },
});

export const DEFAULT_TEAM_TACTICS: Readonly<TeamTactics> = Object.freeze({
  formationId: DEFAULT_FORMATION_ID,
  shape: DEFAULT_SHAPE,
  minLine: 0.06,
  maxLine: 0.9,
  centralBand: 0.4,
});

export function createTeamTactics(overrides: Partial<TeamTactics> = {}): TeamTactics {
  return { ...DEFAULT_TEAM_TACTICS, ...overrides };
}
