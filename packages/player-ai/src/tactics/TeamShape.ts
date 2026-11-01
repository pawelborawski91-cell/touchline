import { FIELD_LENGTH, FIELD_WIDTH, type Vector2 } from '@touchline/shared';

import type { PlayerRole, TeamPlayState } from '../core/AIDecision';
import { clamp } from '../navigation/vector';
import {
  formationToPitch,
  lateralOf,
  lineOf,
  type AttackDirection,
  type FormationDefinition,
} from './Formation';
import type { TeamTactics } from './TeamTactics';

/** Anchors stay this far inside the lines, m. */
export const SHAPE_MARGIN_X = 1.5;
export const SHAPE_MARGIN_Y = 2;
/** Widest lateral position an outfield anchor may take. */
const MAX_LATERAL = 0.93;
/** Line of the back four in the reference formations. */
const REFERENCE_BACK_LINE = 0.16;
/** Ball position is quantised to this grid for the shape cache, m. */
const SHAPE_CACHE_CELL = 1;

const GOAL_SIDE_ROLES: ReadonlySet<PlayerRole> = new Set(['CB', 'FB', 'DM']);

/** The team's target structure for one play state and ball position. */
export interface TeamShapeSnapshot {
  /** Cache key: identical keys give identical shapes. */
  key: string;
  playState: TeamPlayState;
  formationId: string;
  /** Formation anchor per lineup slot, pitch metres. */
  anchors: Readonly<Record<string, Vector2>>;
  roles: Readonly<Record<string, PlayerRole>>;
  /** Pitch x of the back line. */
  defensiveLineX: number;
  /** Lateral span of the outfield anchors, m. */
  width: number;
  /** Goal-to-goal span of the outfield anchors, m. */
  depth: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

function quantise(ball: Vector2): Vector2 {
  return {
    x: Math.round(ball.x / SHAPE_CACHE_CELL) * SHAPE_CACHE_CELL,
    y: Math.round(ball.y / SHAPE_CACHE_CELL) * SHAPE_CACHE_CELL,
  };
}

/** The shape is computed from the ball's cache cell, so equal keys mean equal shapes. */
export function shapeKey(
  formation: FormationDefinition,
  playState: TeamPlayState,
  ball: Vector2,
  direction: AttackDirection,
): string {
  const cell = quantise(ball);
  return `${formation.id}|${playState}|${direction}|${cell.x}|${cell.y}`;
}

function clampToPitch(point: Vector2): Vector2 {
  return {
    x: clamp(point.x, SHAPE_MARGIN_X, FIELD_LENGTH - SHAPE_MARGIN_X),
    y: clamp(point.y, SHAPE_MARGIN_Y, FIELD_WIDTH - SHAPE_MARGIN_Y),
  };
}

/**
 * Deforms the reference formation for a play state:
 * - the block moves up and down with the ball (`ballFollowLine`) from a back-line height;
 * - distances between lines stretch in possession and compress out of it (`depthScale`);
 * - width opens in possession and narrows out of it, and the whole team slides towards the ball
 *   side (`widthScale`, `ballFollowLateral`), so the far side tucks in instead of following;
 * - out of possession, defenders and the holding midfielder stay goal-side of the ball.
 * Every anchor is clamped inside the pitch. The result depends only on the inputs.
 */
export function computeTeamShape(
  formation: FormationDefinition,
  tactics: TeamTactics,
  playState: TeamPlayState,
  ball: Vector2,
  direction: AttackDirection,
): TeamShapeSnapshot {
  const params = tactics.shape[playState];
  const cell = quantise(ball);
  const ballLine = clamp(lineOf(cell.x, direction), 0, 1);
  const ballLateral = clamp(lateralOf(cell.y, direction), -1, 1);
  const backLine = clamp(
    params.defensiveLine + params.ballFollowLine * (ballLine - 0.5),
    tactics.minLine,
    tactics.maxLine,
  );

  const anchors: Record<string, Vector2> = {};
  const roles: Record<string, PlayerRole> = {};
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const position of formation.positions) {
    roles[position.slot] = position.role;
    let line: number;
    let lateral: number;
    if (position.role === 'GK') {
      line = position.line;
      lateral = clamp(ballLateral * 0.08, -0.08, 0.08);
    } else {
      line = backLine + (position.line - REFERENCE_BACK_LINE) * params.depthScale;
      if (params.goalSideMargin !== null && GOAL_SIDE_ROLES.has(position.role)) {
        line = Math.min(line, ballLine - params.goalSideMargin);
      }
      line = clamp(line, tactics.minLine, tactics.maxLine);
      // Wide players on the far side shift less, so the team narrows towards the ball.
      const follow = params.ballFollowLateral * (1 - 0.3 * Math.abs(position.horizontalPosition));
      lateral = clamp(
        position.horizontalPosition * params.widthScale + follow * ballLateral,
        -MAX_LATERAL,
        MAX_LATERAL,
      );
    }
    const anchor = clampToPitch(formationToPitch(line, lateral, direction));
    anchors[position.slot] = anchor;
    if (position.role !== 'GK') {
      minX = Math.min(minX, anchor.x);
      maxX = Math.max(maxX, anchor.x);
      minY = Math.min(minY, anchor.y);
      maxY = Math.max(maxY, anchor.y);
    }
  }

  return {
    key: shapeKey(formation, playState, ball, direction),
    playState,
    formationId: formation.id,
    anchors,
    roles,
    defensiveLineX: formationToPitch(backLine, 0, direction).x,
    width: maxY - minY,
    depth: maxX - minX,
    bounds: { minX, maxX, minY, maxY },
  };
}

/** Reuses `previous` when nothing that shapes the team has changed. */
export function updateTeamShape(
  previous: TeamShapeSnapshot | null,
  formation: FormationDefinition,
  tactics: TeamTactics,
  playState: TeamPlayState,
  ball: Vector2,
  direction: AttackDirection,
): TeamShapeSnapshot {
  if (previous && previous.key === shapeKey(formation, playState, ball, direction)) return previous;
  return computeTeamShape(formation, tactics, playState, ball, direction);
}
