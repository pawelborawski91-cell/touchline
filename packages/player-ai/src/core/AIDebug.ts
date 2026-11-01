import type { MovementMode, Vector2 } from '@touchline/shared';

import type { BehaviorId, PlayerControlMode, PlayerRole, TeamPlayState } from './AIDecision';
import type { AIState } from './AIState';

export interface AIPlayerDebug {
  playerId: string;
  teamId: string;
  slot: string;
  role: PlayerRole;
  controlMode: PlayerControlMode;
  behaviorId: BehaviorId | null;
  target: Vector2 | null;
  utility: number | null;
  priority: number | null;
  movementMode: MovementMode | null;
  focusPlayerId: string | null;
  decidedAtTick: number | null;
  anchor: Vector2 | null;
}

export interface AITeamDebug {
  teamId: string;
  playState: TeamPlayState;
  playStateSinceTick: number;
  formationId: string;
  defensiveLineX: number;
  width: number;
  depth: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  carrierId: string | null;
  presserId: string | null;
  supportPresserId: string | null;
  chaserId: string | null;
  coverId: string | null;
  marks: Readonly<Record<string, string>>;
  opponentLastLineX: number;
}

export interface AIDebugInfo {
  lastUpdateTick: number | null;
  possessingTeamId: string | null;
  teams: AITeamDebug[];
  players: AIPlayerDebug[];
}

/** Read-only summary of the AI for debug views. Building it never changes the AI state. */
export function describeAI(state: AIState): AIDebugInfo {
  const teams = state.teamInfo
    .map((info) => state.teams[info.teamId])
    .filter((team) => team !== undefined)
    .map((team): AITeamDebug => ({
      teamId: team.teamId,
      playState: team.playState,
      playStateSinceTick: team.playStateSinceTick,
      formationId: team.shape.formationId,
      defensiveLineX: team.shape.defensiveLineX,
      width: team.shape.width,
      depth: team.shape.depth,
      bounds: team.shape.bounds,
      carrierId: team.carrierId,
      presserId: team.presserId,
      supportPresserId: team.supportPresserId,
      chaserId: team.chaserId,
      coverId: team.coverId,
      marks: team.marks,
      opponentLastLineX: team.opponentLastLineX,
    }));
  const players = Object.values(state.players).map((memory): AIPlayerDebug => {
    const team = state.teams[memory.teamId];
    const decision = memory.decision;
    return {
      playerId: memory.playerId,
      teamId: memory.teamId,
      slot: memory.slot,
      role: memory.role,
      controlMode: memory.controlMode,
      behaviorId: decision?.behaviorId ?? null,
      target: decision?.targetPosition ?? null,
      utility: decision?.utility ?? null,
      priority: decision?.priority ?? null,
      movementMode: decision?.movementMode ?? null,
      focusPlayerId: decision?.focusPlayerId ?? null,
      decidedAtTick: memory.decidedAtTick,
      anchor: team?.shape.anchors[memory.slot] ?? null,
    };
  });
  return {
    lastUpdateTick: state.lastUpdateTick,
    possessingTeamId: state.possession.possessingTeamId,
    teams,
    players,
  };
}

/** Short labels for drawing behaviors next to players. */
export const BEHAVIOR_LABELS: Readonly<Record<BehaviorId, string>> = Object.freeze({
  carry_ball: 'CARRY',
  chase_loose_ball: 'CHASE',
  protect_goal: 'GOAL',
  hold_position: 'HOLD',
  support_carrier: 'SUPP',
  find_space: 'SPACE',
  offer_pass: 'SHOW',
  forward_run: 'RUN',
  hold_width: 'WIDTH',
  hold_depth: 'DEPTH',
  attack_box: 'BOX',
  defensive_cover: 'REST',
  press_carrier: 'PRESS',
  mark_opponent: 'MARK',
  protect_centre: 'CNTR',
  track_runner: 'TRACK',
  recover_position: 'RECOV',
  hold_line: 'LINE',
  cover_teammate: 'COVER',
  intercept_lane: 'LANE',
  hold_defensive_position: 'BLOCK',
  counter_press: 'CPRES',
  recover_shape: 'BACK',
  counter_run: 'BREAK',
  support_forward: 'JOIN',
});
