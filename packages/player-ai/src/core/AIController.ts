import type { PossessionSnapshot } from '@touchline/ball-engine';
import type { BallState, MatchPhase, PlayerState } from '@touchline/shared';

import { ALL_BEHAVIORS } from '../behaviors';
import { perceiveBall, type BallPerception } from '../perception/BallPerception';
import { perceivePlayer } from '../perception/PlayerPerception';
import { SpatialGrid } from '../perception/SpatialGrid';
import {
  perceiveTeam,
  resolvePlayState,
  updatePossessionMemory,
  type TeamAIState,
  type TeamMember,
} from '../perception/TeamPerception';
import { inOwnPenaltyArea } from '../roles/GoalkeeperAI';
import { angleBetween } from '../navigation/vector';
import { FORMATIONS, positionForSlot } from '../tactics/Formation';
import { updateTeamShape } from '../tactics/TeamShape';
import { tacticsFor, type AIConfig } from './AIConfig';
import type { AIContext } from './AIContext';
import type { AIDecision, MovementIntent, PlayerControlMode } from './AIDecision';
import type { AIObservation, AIState, PlayerAIState } from './AIState';
import type { Behavior } from './Behavior';
import {
  evaluateBehaviors,
  persistTarget,
  selectCandidate,
  type ScoredCandidate,
} from './UtilityEvaluator';

/** Read-only inputs for one AI tick. */
export interface AIWorld {
  tick: number;
  deltaTime: number;
  phase: MatchPhase;
  players: readonly PlayerState[];
  ball: BallState;
  possession: PossessionSnapshot;
  /** Players with an active user command this tick (manual control). */
  manualPlayerIds: ReadonlySet<string>;
}

/** Tracking targets (ball, opponents) are approached closely instead of settling early, m. */
const TRACKING_ARRIVAL_RADIUS = 0.3;
/** Ball speeds (m/s) above which heading changes and jumps count as events. */
const EVENT_BALL_SPEED = 2;
const KICK_SPEED_JUMP = 3;

function controlModeOf(
  player: PlayerState,
  manual: ReadonlySet<string>,
  inactive: ReadonlySet<string>,
): PlayerControlMode {
  if (inactive.has(player.id)) return 'inactive';
  return manual.has(player.id) ? 'manual' : 'autonomous';
}

function observe(world: AIWorld, ball: BallPerception, state: AIState): AIObservation {
  const opponentsInBox: Record<string, number> = {};
  for (const info of state.teamInfo) {
    let count = 0;
    for (const player of world.players) {
      if (player.teamId !== info.teamId && inOwnPenaltyArea(player.position, info.direction)) {
        count += 1;
      }
    }
    opponentsInBox[info.teamId] = count;
  }
  return {
    // Control flickering inside a challenge is not an event; its outcome is.
    controllerPlayerId:
      world.possession.state === 'contested'
        ? (state.observed?.controllerPlayerId ?? null)
        : world.possession.controllerPlayerId,
    ballHeading: ball.heading,
    ballSpeed: ball.speed,
    opponentsInBox,
  };
}

/** Events that make every player re-evaluate now: possession, kicks, sharp ball deflections. */
function globalEvent(
  previous: AIObservation | null,
  current: AIObservation,
  possessionChanged: boolean,
  config: AIConfig,
): boolean {
  if (!previous || possessionChanged) return true;
  if (previous.controllerPlayerId !== current.controllerPlayerId) return true;
  if (current.ballSpeed - previous.ballSpeed > KICK_SPEED_JUMP) return true;
  return (
    previous.ballHeading !== null &&
    current.ballHeading !== null &&
    previous.ballSpeed > EVENT_BALL_SPEED &&
    current.ballSpeed > EVENT_BALL_SPEED &&
    angleBetween(previous.ballHeading, current.ballHeading) > config.ballDirectionChange
  );
}

/** Players who gained or lost a team job (chaser, presser, cover, mark…) this tick. */
function reassignedPlayers(previous: TeamAIState, next: TeamAIState): string[] {
  const ids: string[] = [];
  const compare = (a: string | null, b: string | null) => {
    if (a === b) return;
    if (a) ids.push(a);
    if (b) ids.push(b);
  };
  compare(previous.chaserId, next.chaserId);
  compare(previous.presserId, next.presserId);
  compare(previous.supportPresserId, next.supportPresserId);
  compare(previous.coverId, next.coverId);
  if (previous.marks !== next.marks) {
    const markers = new Set([...Object.keys(previous.marks), ...Object.keys(next.marks)]);
    for (const id of markers) {
      if (previous.marks[id] !== next.marks[id]) ids.push(id);
    }
  }
  return ids;
}

function toIntent(
  playerId: string,
  decision: AIDecision,
  candidate: ScoredCandidate | null,
  config: AIConfig,
): MovementIntent | null {
  if (!decision.targetPosition) return null;
  const tracking = candidate?.tracking ?? false;
  return {
    playerId,
    targetPosition: decision.targetPosition,
    movementMode: decision.movementMode,
    behaviorId: decision.behaviorId,
    priority: decision.priority,
    arrivalRadius: tracking ? TRACKING_ARRIVAL_RADIUS : config.arrivalRadius,
    exitSpeed: candidate?.exitSpeed ?? 0,
  };
}

/**
 * One AI tick. Runs only during execution (planning and stoppages return `state` untouched, so
 * every decision survives turn boundaries). Order:
 * 1. possession memory and team play states (from actual possession changes);
 * 2. event detection (possession, kicks, deflections, opponents entering the box, players
 *    released from manual control) to force immediate re-evaluation;
 * 3. per team: formation shape (cached) and assignments (presser, cover, marks, chaser…);
 * 4. per player, when due (every `decisionIntervalTicks`, staggered) or forced: perception,
 *    behavior scoring, stable selection, target persistence and a movement intent.
 * Manual players are evaluated in the background but never get an intent; the AI never reads
 * or writes user commands. Pure and deterministic: identical inputs give identical outputs.
 */
export function updateAI(
  state: AIState,
  world: AIWorld,
  config: AIConfig,
  behaviors: readonly Behavior[] = ALL_BEHAVIORS,
): AIState {
  if (!config.enabled || world.phase !== 'execution') return state;
  const { tick } = world;
  const ballInfo = perceiveBall(world.ball);
  const possession = updatePossessionMemory(
    state.possession,
    world.possession,
    ballInfo,
    tick,
    config,
  );
  const observed = observe(world, ballInfo, state);
  const forceAll = globalEvent(
    state.observed,
    observed,
    possession.possessingTeamId !== state.possession.possessingTeamId,
    config,
  );
  const inactive = new Set(state.inactivePlayerIds);
  const grid = new SpatialGrid(world.players);
  const byId = new Map(world.players.map((player) => [player.id, player]));
  const controller = world.possession.controllerPlayerId
    ? (byId.get(world.possession.controllerPlayerId) ?? null)
    : null;

  const teams: Record<string, TeamAIState> = {};
  const members = new Map<string, TeamMember>();
  const forcedTeams = new Set<string>();
  const restructuredTeams = new Set<string>();
  const reassigned = new Set<string>();
  for (const info of state.teamInfo) {
    const opponentInfo = state.teamInfo.find((other) => other.teamId !== info.teamId);
    if (!opponentInfo) continue;
    const tactics = tacticsFor(config, info.teamId);
    const formation = FORMATIONS[tactics.formationId];
    const playState = resolvePlayState(info.teamId, possession, tick);
    const previous = state.teams[info.teamId] ?? null;
    if (previous && previous.playState !== playState) restructuredTeams.add(info.teamId);
    const before = state.observed?.opponentsInBox[info.teamId] ?? 0;
    if ((observed.opponentsInBox[info.teamId] ?? 0) > before) forcedTeams.add(info.teamId);
    const shape = updateTeamShape(
      previous?.shape ?? null,
      formation,
      tactics,
      playState,
      ballInfo.position,
      info.direction,
    );
    const teamMembers: TeamMember[] = [];
    const teamPlayers = world.players.filter((player) => player.teamId === info.teamId);
    teamPlayers.forEach((player, index) => {
      const position = positionForSlot(formation, player.role, index);
      const role = position?.role ?? 'CM';
      const member: TeamMember = {
        player,
        role,
        profile: config.roles[role],
        anchor: (position && shape.anchors[position.slot]) ?? player.position,
        controlMode: controlModeOf(player, world.manualPlayerIds, inactive),
      };
      teamMembers.push(member);
      members.set(player.id, member);
    });
    teams[info.teamId] = perceiveTeam({
      teamId: info.teamId,
      opponentTeamId: opponentInfo.teamId,
      direction: info.direction,
      playState,
      playStateSinceTick:
        previous && previous.playState === playState ? previous.playStateSinceTick : tick,
      shape,
      members: teamMembers,
      opponents: world.players.filter((player) => player.teamId === opponentInfo.teamId),
      ball: ballInfo,
      possession: world.possession,
      previous,
      config,
    });
    if (previous) {
      for (const id of reassignedPlayers(previous, teams[info.teamId]!)) reassigned.add(id);
    }
  }

  const players: Record<string, PlayerAIState> = {};
  const interval = Math.max(1, config.decisionIntervalTicks);
  world.players.forEach((player, index) => {
    const previous = state.players[player.id];
    const member = members.get(player.id);
    const team = teams[player.teamId];
    if (!previous || !member || !team) {
      if (previous) players[player.id] = previous;
      return;
    }
    const { controlMode, role } = member;
    const slot = player.role;
    if (controlMode === 'inactive') {
      players[player.id] =
        previous.controlMode === 'inactive'
          ? previous
          : { ...previous, slot, role, controlMode, intent: null };
      return;
    }
    const released = previous.controlMode !== 'autonomous' && controlMode === 'autonomous';
    // Structural changes (possession, play state, release from manual control) may override the
    // switch cooldown; ball events only make the player re-evaluate now.
    const restructured =
      !state.observed ||
      possession.possessingTeamId !== state.possession.possessingTeamId ||
      restructuredTeams.has(player.teamId) ||
      released;
    const forced =
      restructured || forceAll || forcedTeams.has(player.teamId) || reassigned.has(player.id);
    if (!forced && tick < previous.nextDecisionTick) {
      players[player.id] =
        previous.controlMode === controlMode && previous.role === role
          ? previous
          : {
              ...previous,
              slot,
              role,
              controlMode,
              intent: controlMode === 'autonomous' ? previous.intent : null,
            };
      return;
    }

    const opponentTeam = teams[team.opponentTeamId]!;
    const teammates = world.players.filter((p) => p.teamId === player.teamId && p.id !== player.id);
    const opponents = world.players.filter((p) => p.teamId === team.opponentTeamId);
    const context: AIContext = {
      tick,
      deltaTime: world.deltaTime,
      matchPhase: world.phase,
      player,
      role,
      profile: member.profile,
      teammates,
      opponents,
      ball: world.ball,
      ballInfo,
      possession: world.possession,
      carrier: controller,
      team,
      opponentTeam,
      teamTactics: tacticsFor(config, player.teamId),
      direction: team.direction,
      me: perceivePlayer(
        player,
        member.anchor,
        team,
        ballInfo,
        grid,
        team.direction,
        (id) => byId.get(id) ?? null,
      ),
      grid,
      config,
    };
    const candidates = evaluateBehaviors(context, behaviors);
    const selection = selectCandidate(candidates, previous, tick, config, restructured);
    const candidate: ScoredCandidate = selection?.candidate ?? {
      behaviorId: 'hold_position',
      utility: 0,
      priority: 0,
      target: member.anchor,
      movementMode: 'jog',
      focusPlayerId: null,
      tracking: false,
      exitSpeed: 0,
    };
    const switched = selection
      ? selection.switched
      : previous.decision?.behaviorId !== 'hold_position';
    const { target, refreshed } = persistTarget(candidate, previous, tick, config);
    const decision: AIDecision = {
      playerId: player.id,
      behaviorId: candidate.behaviorId,
      targetPosition: target,
      utility: candidate.utility,
      priority: candidate.priority,
      movementMode: candidate.movementMode,
      focusPlayerId: candidate.focusPlayerId,
    };
    players[player.id] = {
      playerId: player.id,
      teamId: player.teamId,
      slot,
      role,
      controlMode,
      decision,
      intent:
        controlMode === 'autonomous' ? toIntent(player.id, decision, candidate, config) : null,
      decidedAtTick: tick,
      switchedAtTick: switched || previous.switchedAtTick === null ? tick : previous.switchedAtTick,
      targetSetAtTick: refreshed || switched ? tick : previous.targetSetAtTick,
      nextDecisionTick: tick + interval + (forced ? index % interval : 0),
    };
  });

  return {
    ...state,
    teams,
    players,
    possession,
    observed,
    lastUpdateTick: tick,
  };
}
