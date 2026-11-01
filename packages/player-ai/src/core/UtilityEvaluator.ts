import type { MovementMode, Vector2 } from '@touchline/shared';

import {
  clampToPitch,
  leash,
  paceForDistance,
  separateFromTeammates,
} from '../navigation/PositionTargeting';
import { clamp01, distance } from '../navigation/vector';
import type { AIConfig } from './AIConfig';
import type { AIContext } from './AIContext';
import type { AIDecision, BehaviorId } from './AIDecision';
import type { Behavior } from './Behavior';

/** Positional targets stay this far inside the lines; ball-related ones may go closer, m. */
const POSITIONAL_MARGIN = 2.5;
const BALL_MARGIN = 0.3;

/** One scored, available behavior for a player. */
export interface ScoredCandidate {
  behaviorId: BehaviorId;
  utility: number;
  priority: number;
  target: Vector2;
  movementMode: MovementMode;
  focusPlayerId: string | null;
  tracking: boolean;
  exitSpeed: number;
}

/**
 * Scores every available behavior. A behavior is available when the team's play state is in its
 * `states`, the player's role weights it above zero and its situational check passes. Final
 * utility = raw utility × role weight × global weight, clamped to 0–1. Positional targets are
 * leashed to the anchor, separated from teammates and paced by distance.
 */
export function evaluateBehaviors(
  context: AIContext,
  behaviors: readonly Behavior[],
): ScoredCandidate[] {
  const { config, profile, team } = context;
  const candidates: ScoredCandidate[] = [];
  for (const behavior of behaviors) {
    if (!behavior.states.includes(team.playState)) continue;
    const roleWeight = profile.weights[behavior.id] ?? 0;
    if (roleWeight <= 0) continue;
    if (!behavior.eligible(context)) continue;
    const proposal = behavior.evaluate(context);
    if (!proposal) continue;
    const utility = clamp01(
      clamp01(proposal.utility) * roleWeight * (config.behaviorWeights[behavior.id] ?? 1),
    );
    if (utility <= 0) continue;
    let target = proposal.target;
    let movementMode = proposal.movementMode;
    if (proposal.positional) {
      const scale = proposal.leashScale === undefined ? 1 : proposal.leashScale;
      if (scale !== null) target = leash(target, context.me.anchor, profile.leash * scale);
      target = separateFromTeammates(
        target,
        context.player,
        context.grid,
        config.minTeammateSpacing,
      );
      movementMode = paceForDistance(distance(context.player.position, target), movementMode);
    }
    candidates.push({
      behaviorId: behavior.id,
      utility,
      priority: behavior.priority,
      target: clampToPitch(target, proposal.positional ? POSITIONAL_MARGIN : BALL_MARGIN),
      movementMode,
      focusPlayerId: proposal.focusPlayerId ?? null,
      tracking: proposal.tracking ?? false,
      exitSpeed: proposal.exitSpeed ?? 0,
    });
  }
  return candidates;
}

/** What the evaluator remembers about a player's last choice. */
export interface DecisionMemory {
  decision: AIDecision | null;
  /** Tick the current behavior was chosen. */
  switchedAtTick: number | null;
  /** Tick the current target was set. */
  targetSetAtTick: number | null;
}

export interface Selection {
  candidate: ScoredCandidate;
  /** Score used for the choice (utility plus hysteresis for the incumbent). */
  score: number;
  switched: boolean;
}

function better(
  a: { score: number; candidate: ScoredCandidate },
  b: { score: number; candidate: ScoredCandidate },
  epsilon: number,
): boolean {
  if (a.score > b.score + epsilon) return true;
  if (a.score < b.score - epsilon) return false;
  if (a.candidate.priority !== b.candidate.priority) {
    return a.candidate.priority > b.candidate.priority;
  }
  return a.candidate.behaviorId < b.candidate.behaviorId;
}

/**
 * Picks the highest-scoring candidate. Stability rules:
 * - hysteresis: the current behavior scores `hysteresis` extra while it is still available;
 * - ties (within `tieEpsilon`): higher priority, then behavior id;
 * - cooldown: no switch within `switchCooldownTicks` of the last one, unless the challenger is
 *   urgent (priority ≥ `urgentPriority`), the current behavior is no longer available, or the
 *   evaluation was forced by an important event.
 */
export function selectCandidate(
  candidates: readonly ScoredCandidate[],
  memory: DecisionMemory,
  tick: number,
  config: AIConfig,
  forced: boolean,
): Selection | null {
  const currentId = memory.decision?.behaviorId ?? null;
  let best: { score: number; candidate: ScoredCandidate } | null = null;
  let incumbent: { score: number; candidate: ScoredCandidate } | null = null;
  for (const candidate of candidates) {
    const isCurrent = candidate.behaviorId === currentId;
    const entry = { candidate, score: candidate.utility + (isCurrent ? config.hysteresis : 0) };
    if (isCurrent) incumbent = entry;
    if (!best || better(entry, best, config.tieEpsilon)) best = entry;
  }
  if (!best) return null;
  if (incumbent && best.candidate.behaviorId !== currentId) {
    const cooling =
      memory.switchedAtTick !== null && tick - memory.switchedAtTick < config.switchCooldownTicks;
    if (cooling && !forced && best.candidate.priority < config.urgentPriority) {
      return { ...incumbent, switched: false };
    }
  }
  return { ...best, switched: best.candidate.behaviorId !== currentId };
}

/**
 * Keeps the current target when the behavior is unchanged and the new target is only a small
 * move away (and the current one is not stale), so players do not re-steer every evaluation.
 */
export function persistTarget(
  candidate: ScoredCandidate,
  memory: DecisionMemory,
  tick: number,
  config: AIConfig,
): { target: Vector2; refreshed: boolean } {
  const previous = memory.decision;
  if (
    previous &&
    previous.behaviorId === candidate.behaviorId &&
    previous.targetPosition &&
    memory.targetSetAtTick !== null &&
    tick - memory.targetSetAtTick < config.maxTargetAgeTicks
  ) {
    const threshold = candidate.tracking
      ? config.trackingRetargetDistance
      : config.retargetDistance;
    if (distance(previous.targetPosition, candidate.target) < threshold) {
      return { target: previous.targetPosition, refreshed: false };
    }
  }
  return { target: candidate.target, refreshed: true };
}
