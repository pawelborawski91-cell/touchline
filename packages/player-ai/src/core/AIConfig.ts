import type { BehaviorId, PlayerRole } from './AIDecision';
import { DEFAULT_GOALKEEPER_POSITIONING, type GoalkeeperPositioning } from '../roles/GoalkeeperAI';
import { ROLE_PROFILES } from '../roles';
import type { RoleProfile } from '../roles/RoleProfile';
import { DEFAULT_TEAM_TACTICS, type TeamTactics } from '../tactics/TeamTactics';

/** Tuning for the autonomous AI. Prototype gameplay values. */
export interface AIConfig {
  /** When false the match engine skips the AI entirely: uncommanded players just brake. */
  enabled: boolean;
  /** Ticks between routine decisions per player (5 at 20 Hz = 4 Hz). Players are staggered. */
  decisionIntervalTicks: number;
  /** Minimum ticks between behavior switches (urgent behaviors and forced events excepted). */
  switchCooldownTicks: number;
  /** Utility bonus for keeping the current behavior. */
  hysteresis: number;
  /** Candidates within this utility are tied; the higher priority (then id) wins. */
  tieEpsilon: number;
  /** Behaviors at or above this priority may switch in despite the cooldown. */
  urgentPriority: number;
  /** A new target only replaces the current one when it moved at least this far, m... */
  retargetDistance: number;
  /** ...or this far for behaviors that follow the ball or an opponent, m... */
  trackingRetargetDistance: number;
  /** ...or once the current target is this old (ticks). */
  maxTargetAgeTicks: number;
  /** How long a team stays in transition after an actual possession change, ticks. */
  transitionTicks: number;
  /** A free ball moving faster than this still belongs to the team that last touched it, m/s. */
  loosePassSpeed: number;
  /** A slow loose ball keeps belonging to the last team for this many ticks. */
  looseBallGraceTicks: number;
  /** The other team must control the ball this long before possession changes, ticks. */
  turnoverConfirmTicks: number;
  /** Ball heading change that forces re-evaluation, rad. */
  ballDirectionChange: number;
  /** A new presser/chaser must be this much closer than the current one, m. */
  assignmentHysteresis: number;
  /** Opponents within this distance of a marker's anchor may be marked, m. */
  markRadius: number;
  /** Second pressers only engage within this distance of the ball after a turnover, m. */
  counterPressRadius: number;
  /** Teammates assigned to support the ball carrier. */
  supporterCount: number;
  /** Positional targets are pushed apart from teammates closer than this, m. */
  minTeammateSpacing: number;
  /** Settling radius for positional targets, m. */
  arrivalRadius: number;
  /** Global multipliers per behavior (default 1). */
  behaviorWeights: Readonly<Partial<Record<BehaviorId, number>>>;
  roles: Readonly<Record<PlayerRole, RoleProfile>>;
  /** Tactics per team id; teams without an entry use `defaultTactics`. */
  teamTactics: Readonly<Record<string, TeamTactics>>;
  defaultTactics: TeamTactics;
  goalkeeper: GoalkeeperPositioning;
}

export const DEFAULT_AI_CONFIG: Readonly<AIConfig> = Object.freeze({
  enabled: true,
  decisionIntervalTicks: 5,
  switchCooldownTicks: 15,
  hysteresis: 0.1,
  tieEpsilon: 0.01,
  urgentPriority: 3,
  retargetDistance: 2,
  trackingRetargetDistance: 0.75,
  maxTargetAgeTicks: 40,
  transitionTicks: 60,
  loosePassSpeed: 3,
  looseBallGraceTicks: 20,
  turnoverConfirmTicks: 8,
  ballDirectionChange: Math.PI / 4,
  assignmentHysteresis: 3,
  markRadius: 14,
  counterPressRadius: 15,
  supporterCount: 2,
  minTeammateSpacing: 5,
  arrivalRadius: 0.75,
  behaviorWeights: Object.freeze({}),
  roles: ROLE_PROFILES,
  teamTactics: Object.freeze({}),
  defaultTactics: DEFAULT_TEAM_TACTICS,
  goalkeeper: DEFAULT_GOALKEEPER_POSITIONING,
});

export function tacticsFor(config: AIConfig, teamId: string): TeamTactics {
  return config.teamTactics[teamId] ?? config.defaultTactics;
}
