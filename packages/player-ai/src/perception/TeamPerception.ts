import type { PossessionSnapshot } from '@touchline/ball-engine';
import type { PlayerState, Vector2 } from '@touchline/shared';

import type { AIConfig } from '../core/AIConfig';
import type { BehaviorId, PlayerControlMode, PlayerRole, TeamPlayState } from '../core/AIDecision';
import { inOwnPenaltyArea } from '../roles/GoalkeeperAI';
import type { RoleProfile } from '../roles/RoleProfile';
import { distance, towards } from '../navigation/vector';
import { lineOf, ownGoalCentre, type AttackDirection } from '../tactics/Formation';
import type { TeamShapeSnapshot } from '../tactics/TeamShape';
import { interceptPoint, type BallPerception } from './BallPerception';

/** Which team (if any) has the ball, and the transition that a change of possession opened. */
export interface PossessionMemory {
  /** Team in possession now (null while the ball is loose or out of play). */
  possessingTeamId: string | null;
  /** Last team that had possession (kept through loose-ball moments). */
  lastPossessingTeamId: string | null;
  /** Team that won the ball in the latest turnover, while its transition lasts. */
  transitionTeamId: string | null;
  transitionUntilTick: number;
  /** Tick of the latest change of `possessingTeamId`. */
  changedAtTick: number;
  /** First tick of the current loose-ball moment (null while someone has the ball). */
  looseSinceTick: number | null;
  /** Other team that has controlled the ball since `challengerSinceTick`, not yet confirmed. */
  challengerTeamId: string | null;
  challengerSinceTick: number;
}

export const INITIAL_POSSESSION_MEMORY: Readonly<PossessionMemory> = Object.freeze({
  possessingTeamId: null,
  lastPossessingTeamId: null,
  transitionTeamId: null,
  transitionUntilTick: -1,
  changedAtTick: 0,
  looseSinceTick: null,
  challengerTeamId: null,
  challengerSinceTick: -1,
});

/**
 * Team in possession according to the ball alone: the controller's team; for a free ball, the
 * team that last touched it while it is still travelling (a pass or clearance in flight);
 * nobody for a slow loose ball or a ball out of play.
 */
export function possessingTeam(
  possession: PossessionSnapshot,
  ball: BallPerception,
  config: Pick<AIConfig, 'loosePassSpeed'>,
): string | null {
  if (possession.state === 'out_of_play') return null;
  if (possession.controllerTeamId) return possession.controllerTeamId;
  if (possession.lastTouchTeamId && (ball.speed >= config.loosePassSpeed || ball.airborne)) {
    return possession.lastTouchTeamId;
  }
  return null;
}

/**
 * Advances the possession memory from the ball's possession. A transition starts only when
 * possession actually moves to the other team (directly, or after a loose ball). Two things do
 * not count as a change, so team states do not flicker during a challenge:
 * - a contested ball still belongs to the team that had it until the contest is decided;
 * - a ball loose for less than `looseBallGraceTicks` still belongs to the last team;
 * - the other team must keep the ball for `turnoverConfirmTicks` before it is theirs, so a
 *   tackle that is immediately won back does not flip both teams' shapes twice.
 * Unchanged possession returns `previous`.
 */
export function updatePossessionMemory(
  previous: PossessionMemory,
  possession: PossessionSnapshot,
  ball: BallPerception,
  tick: number,
  config: Pick<
    AIConfig,
    'transitionTicks' | 'loosePassSpeed' | 'looseBallGraceTicks' | 'turnoverConfirmTicks'
  >,
): PossessionMemory {
  const raw = possessingTeam(possession, ball, config);
  const held = previous.possessingTeamId;
  let next = raw;
  let looseSinceTick: number | null = null;
  let challengerTeamId: string | null = null;
  let challengerSinceTick = -1;
  if (held !== null && possession.state === 'contested') {
    next = held;
    // The other team's confirmation runs through a challenge it leads, but never ends in one.
    const leader = possession.controllerTeamId;
    if (leader !== null && leader !== held) {
      challengerTeamId = leader;
      challengerSinceTick =
        previous.challengerTeamId === leader ? previous.challengerSinceTick : tick;
    }
  } else if (raw === null && held !== null && possession.state !== 'out_of_play') {
    looseSinceTick = previous.looseSinceTick ?? tick;
    if (tick - looseSinceTick < config.looseBallGraceTicks) next = held;
  } else if (raw !== null && held !== null && raw !== held) {
    challengerTeamId = raw;
    challengerSinceTick = previous.challengerTeamId === raw ? previous.challengerSinceTick : tick;
    if (tick - challengerSinceTick < config.turnoverConfirmTicks) next = held;
  }
  if (next === held) {
    if (
      looseSinceTick === previous.looseSinceTick &&
      challengerTeamId === previous.challengerTeamId &&
      challengerSinceTick === previous.challengerSinceTick
    ) {
      return previous;
    }
    return { ...previous, looseSinceTick, challengerTeamId, challengerSinceTick };
  }
  const turnover =
    next !== null &&
    previous.lastPossessingTeamId !== null &&
    next !== previous.lastPossessingTeamId;
  return {
    possessingTeamId: next,
    lastPossessingTeamId: next ?? previous.lastPossessingTeamId,
    transitionTeamId: turnover ? next : previous.transitionTeamId,
    transitionUntilTick: turnover ? tick + config.transitionTicks : previous.transitionUntilTick,
    changedAtTick: tick,
    looseSinceTick: next === null ? looseSinceTick : null,
    challengerTeamId: null,
    challengerSinceTick: -1,
  };
}

export function resolvePlayState(
  teamId: string,
  memory: PossessionMemory,
  tick: number,
): TeamPlayState {
  const { possessingTeamId, transitionTeamId } = memory;
  if (possessingTeamId === null) return 'neutral';
  const inTransition = transitionTeamId !== null && tick < memory.transitionUntilTick;
  if (possessingTeamId === teamId) {
    return inTransition && transitionTeamId === teamId ? 'transition_attack' : 'attacking';
  }
  return inTransition && transitionTeamId !== teamId ? 'transition_defense' : 'defending';
}

/** Team-level view and assignments, recomputed every AI tick (cheap: one team, 11 players). */
export interface TeamAIState {
  teamId: string;
  opponentTeamId: string;
  direction: AttackDirection;
  playState: TeamPlayState;
  playStateSinceTick: number;
  shape: TeamShapeSnapshot;
  /** Ball carrier when a teammate controls the ball. */
  carrierId: string | null;
  /** Player sent to pressure the opposing ball carrier. */
  presserId: string | null;
  /** Second presser right after losing the ball. */
  supportPresserId: string | null;
  /** Player going for a loose or travelling ball. */
  chaserId: string | null;
  /** Player covering behind the presser. */
  coverId: string | null;
  /** Teammates closest to our ball carrier, offering short support. */
  supporterIds: readonly string[];
  /** Marker id → marked opponent id (one-to-one). */
  marks: Readonly<Record<string, string>>;
  /** Pitch x of the deepest opposing outfield player (their last line). */
  opponentLastLineX: number;
}

/** What team perception needs to know about one of the team's players. */
export interface TeamMember {
  player: PlayerState;
  role: PlayerRole;
  profile: RoleProfile;
  anchor: Vector2;
  controlMode: PlayerControlMode;
}

const weightOf = (member: TeamMember, behavior: BehaviorId): number =>
  member.profile.weights[behavior] ?? 0;

/** Only autonomous players take part in assignments; manual and inactive ones are left alone. */
const available = (member: TeamMember, behavior: BehaviorId): boolean =>
  member.controlMode === 'autonomous' && weightOf(member, behavior) > 0;

interface Ranked {
  member: TeamMember;
  cost: number;
}

/** Lowest cost, ties by player id; the incumbent keeps the job unless beaten by `margin`. */
function pickWithHysteresis(
  ranked: readonly Ranked[],
  incumbentId: string | null,
  margin: number,
): TeamMember | null {
  let best: Ranked | null = null;
  for (const entry of ranked) {
    const cost = entry.member.player.id === incumbentId ? entry.cost - margin : entry.cost;
    if (
      !best ||
      cost < best.cost ||
      (cost === best.cost && entry.member.player.id < best.member.player.id)
    ) {
      best = { member: entry.member, cost };
    }
  }
  return best?.member ?? null;
}

export interface TeamPerceptionInput {
  teamId: string;
  opponentTeamId: string;
  direction: AttackDirection;
  playState: TeamPlayState;
  playStateSinceTick: number;
  shape: TeamShapeSnapshot;
  members: readonly TeamMember[];
  opponents: readonly PlayerState[];
  ball: BallPerception;
  possession: PossessionSnapshot;
  previous: TeamAIState | null;
  config: AIConfig;
}

/**
 * Team assignments: one presser (nearest eligible to the carrier), a second counter-presser after
 * a turnover, a cover player behind the presser, one-to-one marks, one chaser per loose ball and
 * the carrier's nearest supporters. Every pick is deterministic and sticky (hysteresis), so
 * players are not swapped back and forth, and no two defenders mark the same opponent.
 */
export function perceiveTeam(input: TeamPerceptionInput): TeamAIState {
  const { members, opponents, ball, possession, previous, config, direction, playState } = input;
  const hysteresis = config.assignmentHysteresis;
  const ownGoal = ownGoalCentre(direction);
  const controller = possession.controllerPlayerId;
  const carrierIsOurs = controller !== null && possession.controllerTeamId === input.teamId;
  const carrierIsTheirs =
    controller !== null && possession.controllerTeamId === input.opponentTeamId;
  const carrierPlayer = carrierIsTheirs
    ? (opponents.find((p) => p.id === controller) ?? null)
    : null;
  const outOfPossession = playState === 'defending' || playState === 'transition_defense';

  // Chaser for a free (loose or travelling) ball: shortest time to an intercept point.
  let chaserId: string | null = null;
  if (ball.isFree && !ball.isOutOfPlay) {
    const ranked: Ranked[] = [];
    for (const member of members) {
      if (!available(member, 'chase_loose_ball')) continue;
      const speed = member.player.movement.maxSpeed;
      const intercept = interceptPoint(ball, member.player, speed);
      if (member.role === 'GK' && !inOwnPenaltyArea(intercept.point, direction)) continue;
      ranked.push({ member, cost: intercept.time * speed });
    }
    chaserId =
      pickWithHysteresis(ranked, previous?.chaserId ?? null, hysteresis)?.player.id ?? null;
  }

  // Presser on the opposing carrier: nearest eligible player whose zone reaches the ball.
  let presserId: string | null = null;
  let supportPresserId: string | null = null;
  let coverId: string | null = null;
  if (carrierPlayer) {
    const target = carrierPlayer.position;
    const candidates: Ranked[] = [];
    for (const member of members) {
      if (!available(member, 'press_carrier') && !available(member, 'counter_press')) continue;
      if (member.role === 'GK') continue;
      candidates.push({ member, cost: distance(member.player.position, target) });
    }
    const inZone = candidates.filter(
      ({ member }) => distance(member.anchor, target) <= member.profile.pressRange,
    );
    const presser = pickWithHysteresis(
      inZone.length > 0 ? inZone : candidates,
      previous?.presserId ?? null,
      hysteresis,
    );
    presserId = presser?.player.id ?? null;

    if (playState === 'transition_defense') {
      const second = pickWithHysteresis(
        candidates.filter(
          ({ member, cost }) =>
            member.player.id !== presserId &&
            available(member, 'counter_press') &&
            cost <= config.counterPressRadius,
        ),
        previous?.supportPresserId ?? null,
        hysteresis,
      );
      supportPresserId = second?.player.id ?? null;
    }

    if (presser && outOfPossession) {
      const coverPoint = towards(presser.player.position, ownGoal, 7);
      const cover = pickWithHysteresis(
        members
          .filter(
            (member) =>
              available(member, 'cover_teammate') &&
              member.player.id !== presserId &&
              member.player.id !== supportPresserId,
          )
          .map((member) => ({ member, cost: distance(member.player.position, coverPoint) })),
        previous?.coverId ?? null,
        hysteresis,
      );
      coverId = cover?.player.id ?? null;
    }
  }

  // One-to-one marking of opponents in our half of the pitch, greedy by anchor distance.
  const marks: Record<string, string> = {};
  if (outOfPossession) {
    const busy = new Set([presserId, supportPresserId, coverId]);
    const markers = members.filter(
      (member) =>
        available(member, 'mark_opponent') && member.role !== 'GK' && !busy.has(member.player.id),
    );
    const targets = opponents.filter(
      (opponent) =>
        opponent.role !== 'GK' &&
        opponent.id !== controller &&
        lineOf(opponent.position.x, direction) < 0.6,
    );
    const pairs: { marker: string; opponent: string; cost: number }[] = [];
    for (const member of markers) {
      for (const opponent of targets) {
        const d = distance(member.anchor, opponent.position);
        if (d > config.markRadius) continue;
        const sticky = previous?.marks[member.player.id] === opponent.id ? hysteresis : 0;
        pairs.push({ marker: member.player.id, opponent: opponent.id, cost: d - sticky });
      }
    }
    pairs.sort(
      (a, b) =>
        a.cost - b.cost ||
        (a.marker < b.marker ? -1 : a.marker > b.marker ? 1 : 0) ||
        (a.opponent < b.opponent ? -1 : a.opponent > b.opponent ? 1 : 0),
    );
    const taken = new Set<string>();
    for (const pair of pairs) {
      if (marks[pair.marker] || taken.has(pair.opponent)) continue;
      marks[pair.marker] = pair.opponent;
      taken.add(pair.opponent);
    }
  }

  // Nearest teammates support our ball carrier.
  let supporterIds: string[] = [];
  if (carrierIsOurs) {
    const carrier = members.find((member) => member.player.id === controller);
    if (carrier) {
      supporterIds = members
        .filter(
          (member) =>
            member.player.id !== controller &&
            member.role !== 'GK' &&
            (available(member, 'support_carrier') || available(member, 'support_forward')),
        )
        .map((member) => ({
          id: member.player.id,
          d: distance(member.player.position, carrier.player.position),
        }))
        .filter(({ d }) => d <= 35)
        .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1))
        .slice(0, config.supporterCount)
        .map(({ id }) => id);
    }
  }

  let opponentLastLineX = direction === 1 ? 0 : Infinity;
  for (const opponent of opponents) {
    if (opponent.role === 'GK') continue;
    opponentLastLineX =
      direction === 1
        ? Math.max(opponentLastLineX, opponent.position.x)
        : Math.min(opponentLastLineX, opponent.position.x);
  }
  if (!Number.isFinite(opponentLastLineX)) opponentLastLineX = input.shape.defensiveLineX;

  return {
    teamId: input.teamId,
    opponentTeamId: input.opponentTeamId,
    direction,
    playState,
    playStateSinceTick: input.playStateSinceTick,
    shape: input.shape,
    carrierId: carrierIsOurs ? controller : null,
    presserId,
    supportPresserId,
    chaserId,
    coverId,
    supporterIds,
    marks,
    opponentLastLineX,
  };
}
