import type { PlayerState } from '@touchline/shared';

import {
  INITIAL_POSSESSION_MEMORY,
  type PossessionMemory,
  type TeamAIState,
} from '../perception/TeamPerception';
import type { AttackDirection } from '../tactics/Formation';
import type { AIDecision, MovementIntent, PlayerControlMode, PlayerRole } from './AIDecision';

/** Per-player AI memory, carried across ticks, planning phases and turns. */
export interface PlayerAIState {
  playerId: string;
  teamId: string;
  /** Lineup slot (`MatchPlayer.role`) and the archetype it plays in the team's formation. */
  slot: string;
  role: PlayerRole;
  controlMode: PlayerControlMode;
  decision: AIDecision | null;
  /** Movement intent for the physics; null unless autonomous. */
  intent: MovementIntent | null;
  decidedAtTick: number | null;
  switchedAtTick: number | null;
  targetSetAtTick: number | null;
  nextDecisionTick: number;
}

/** What the AI saw last tick, to detect events that force re-evaluation. */
export interface AIObservation {
  controllerPlayerId: string | null;
  ballHeading: number | null;
  ballSpeed: number;
  /** Opponents inside each team's own penalty area. */
  opponentsInBox: Readonly<Record<string, number>>;
}

export interface AITeamInfo {
  teamId: string;
  direction: AttackDirection;
}

/** All AI state. Immutable: each update returns a new object (unchanged parts are shared). */
export interface AIState {
  readonly teamInfo: readonly AITeamInfo[];
  readonly teams: Readonly<Record<string, TeamAIState>>;
  readonly players: Readonly<Record<string, PlayerAIState>>;
  readonly possession: PossessionMemory;
  readonly observed: AIObservation | null;
  /** Players excluded from normal behavior (reserved for future match events). */
  readonly inactivePlayerIds: readonly string[];
  /** Last tick the AI ran (null before the first execution tick). */
  readonly lastUpdateTick: number | null;
}

export function createAIState(
  players: readonly PlayerState[],
  teamInfo: readonly AITeamInfo[],
): AIState {
  const memory: Record<string, PlayerAIState> = {};
  for (const player of players) {
    memory[player.id] = {
      playerId: player.id,
      teamId: player.teamId,
      slot: player.role,
      role: 'CM',
      controlMode: player.activeCommandId ? 'manual' : 'autonomous',
      decision: null,
      intent: null,
      decidedAtTick: null,
      switchedAtTick: null,
      targetSetAtTick: null,
      nextDecisionTick: 0,
    };
  }
  return {
    teamInfo,
    teams: {},
    players: memory,
    possession: INITIAL_POSSESSION_MEMORY,
    observed: null,
    inactivePlayerIds: [],
    lastUpdateTick: null,
  };
}

/** Marks a player inactive (or active again). The next AI tick re-evaluates him. */
export function setPlayerInactive(state: AIState, playerId: string, inactive: boolean): AIState {
  const has = state.inactivePlayerIds.includes(playerId);
  if (has === inactive) return state;
  return {
    ...state,
    inactivePlayerIds: inactive
      ? [...state.inactivePlayerIds, playerId].sort()
      : state.inactivePlayerIds.filter((id) => id !== playerId),
  };
}
