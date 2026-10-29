import {
  activateLiveCommands,
  CommandTransitionError,
  FIELD_LENGTH,
  FIELD_WIDTH,
  getCommand,
  getLiveMovementCommands,
  isFinishedCommand,
  pauseActiveCommands,
  pruneFinishedCommands,
  replaceMovementCommand,
  transitionCommand,
  type CommandBook,
  type MatchPhase,
  type MatchPlayer,
  type MovementMode,
  type PlayerCommand,
  type Vector2,
} from '@touchline/shared';

import { assertPhase, assertPhaseTransition, MatchStateError } from './MatchPhaseMachine';
import {
  DEFAULT_SIMULATION_CONFIG,
  ticksPerTurn,
  type SimulationConfig,
  type SimulationState,
  type TeamCommitState,
} from './SimulationState';
import { stepPlayers } from './SimulationStep';

/** Read-only view of turn timing, derived from integer ticks (never accumulated seconds). */
export interface TurnSnapshot {
  turn: number;
  phase: MatchPhase;
  tick: number;
  turnTick: number;
  ticksPerTurn: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  /** 0–1 through the current execution window. */
  progress: number;
  teamCommits: readonly TeamCommitState[];
}

export function getTurnSnapshot(
  state: SimulationState,
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
): TurnSnapshot {
  const total = ticksPerTurn(config);
  const dt = config.match.fixedDeltaTime;
  return {
    turn: state.turn,
    phase: state.phase,
    tick: state.tick,
    turnTick: state.turnTick,
    ticksPerTurn: total,
    elapsedSeconds: state.turnTick * dt,
    remainingSeconds: (total - state.turnTick) * dt,
    progress: state.turnTick / total,
    teamCommits: state.teamCommits,
  };
}

// ── Planning ────────────────────────────────────────────────────────────────────────────────

const PATH_BOUNDS_MARGIN = 0.5;

/** A problem with a planned command that blocks committing. */
export interface PlanIssue {
  commandId: string;
  playerId: string;
  message: string;
}

export class PlanValidationError extends MatchStateError {
  constructor(readonly issues: readonly PlanIssue[]) {
    super(`Cannot commit plans: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'PlanValidationError';
  }
}

function pathProblem(path: readonly Vector2[]): string | null {
  if (path.length < 2) return 'path needs at least two points';
  for (const { x, y } of path) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 'path has a non-finite point';
    if (
      x < -PATH_BOUNDS_MARGIN ||
      y < -PATH_BOUNDS_MARGIN ||
      x > FIELD_LENGTH + PATH_BOUNDS_MARGIN ||
      y > FIELD_WIDTH + PATH_BOUNDS_MARGIN
    ) {
      return 'path leaves the pitch';
    }
  }
  return null;
}

function findPlayer(state: SimulationState, playerId: string): MatchPlayer {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new MatchStateError(`Unknown player ${playerId}.`);
  return player;
}

/** Sets `activeCommandId` to null for any player whose command is no longer running. */
function releaseEndedCommands(players: readonly MatchPlayer[], book: CommandBook): MatchPlayer[] {
  return players.map((player) => {
    if (!player.activeCommandId) return player;
    const command = getCommand(book, player.activeCommandId);
    return command && !isFinishedCommand(command) ? player : { ...player, activeCommandId: null };
  });
}

export interface PlanMovementOptions {
  movementMode?: MovementMode;
}

export interface PlanMovementResult {
  state: SimulationState;
  command: PlayerCommand;
}

/**
 * Plans a movement command for a player during planning. Any live command the player already has
 * is superseded (queued → cancelled, active/paused → interrupted). The player's position and
 * velocity are untouched; the new command is queued and starts at the next commit from wherever
 * the player actually is.
 */
export function planMovement(
  state: SimulationState,
  playerId: string,
  path: readonly Vector2[],
  options: PlanMovementOptions = {},
): PlanMovementResult {
  assertPhase(state.phase, 'planning', 'edit plans');
  findPlayer(state, playerId);
  const problem = pathProblem(path);
  if (problem) throw new MatchStateError(`Cannot plan movement for ${playerId}: ${problem}.`);
  const { book, command } = replaceMovementCommand(state.commands, playerId, path, {
    movementMode: options.movementMode,
    createdAtTick: state.tick,
    turn: state.turn,
  });
  return {
    state: { ...state, commands: book, players: releaseEndedCommands(state.players, book) },
    command,
  };
}

/** Replaces a specific live command (queued, active or paused) with a new path. */
export function replaceCommand(
  state: SimulationState,
  commandId: string,
  path: readonly Vector2[],
  options: PlanMovementOptions = {},
): PlanMovementResult {
  assertPhase(state.phase, 'planning', 'replace commands');
  const existing = getCommand(state.commands, commandId);
  if (!existing) throw new CommandTransitionError(commandId, null, 'cancelled');
  if (isFinishedCommand(existing) || existing.status === 'draft') {
    throw new CommandTransitionError(commandId, existing.status, 'interrupted', 'not live');
  }
  return planMovement(state, existing.playerId, path, {
    movementMode: options.movementMode ?? existing.movementMode,
  });
}

/** Cancels a queued, active or paused command during planning. The player keeps its momentum. */
export function cancelPlannedCommand(state: SimulationState, commandId: string): SimulationState {
  assertPhase(state.phase, 'planning', 'cancel commands');
  const commands = transitionCommand(state.commands, commandId, 'cancelled', { turn: state.turn });
  return { ...state, commands, players: releaseEndedCommands(state.players, commands) };
}

/** Checks every live command of a team (all teams when `teamId` is omitted). */
export function validatePlans(state: SimulationState, teamId?: string): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const seen = new Set<string>();
  for (const command of getLiveMovementCommands(state.commands)) {
    const player = state.players.find((p) => p.id === command.playerId);
    if (teamId !== undefined && player?.teamId !== teamId) continue;
    const add = (message: string) =>
      issues.push({ commandId: command.id, playerId: command.playerId, message });
    if (!player) add(`${command.id} targets unknown player ${command.playerId}`);
    if (seen.has(command.playerId)) add(`${command.playerId} has more than one live command`);
    seen.add(command.playerId);
    const problem = command.status === 'queued' ? pathProblem(command.path) : null;
    if (problem) add(`${command.id}: ${problem}`);
  }
  return issues;
}

// ── Commit and execution ───────────────────────────────────────────────────────────────────

/** Starts a queued command at the player's actual position (no teleport to the drawn start). */
function anchorToPlayer(command: PlayerCommand, player: MatchPlayer | undefined): PlayerCommand {
  if (!player) return command;
  const [first, ...rest] = command.path;
  if (first && first.x === player.position.x && first.y === player.position.y) return command;
  return { ...command, path: [{ ...player.position }, ...rest] };
}

function beginExecution(state: SimulationState): SimulationState {
  assertPhaseTransition(state.phase, 'execution', 'start execution');
  const context = { turn: state.turn };
  const pruned = pruneFinishedCommands(state.commands, state.turn);
  const anchored: CommandBook = {
    ...pruned,
    commands: pruned.commands.map((command) =>
      command.status === 'queued'
        ? anchorToPlayer(
            command,
            state.players.find((p) => p.id === command.playerId),
          )
        : command,
    ),
  };
  const commands = activateLiveCommands(anchored, context);
  const kept = new Set(commands.commands.map((command) => command.id));
  const pathStates = Object.fromEntries(
    Object.entries(state.pathStates).filter(([id]) => kept.has(id)),
  );
  const players = state.players.map((player) => {
    const active = commands.commands.find((c) => c.playerId === player.id && c.status === 'active');
    const activeCommandId = active?.id ?? null;
    return player.activeCommandId === activeCommandId ? player : { ...player, activeCommandId };
  });
  return { ...state, phase: 'execution', turnTick: 0, commands, players, pathStates };
}

/**
 * Commits one team's plan. Execution starts once every team has committed. Throws
 * `MatchStateError` outside planning and `PlanValidationError` if the team's plan is invalid.
 */
export function commitTeam(
  state: SimulationState,
  teamId: string,
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
): SimulationState {
  assertPhase(state.phase, 'planning', 'commit plans');
  if (!state.teamCommits.some((team) => team.teamId === teamId)) {
    throw new MatchStateError(`Unknown team ${teamId}.`);
  }
  const issues = validatePlans(state, teamId);
  if (issues.length > 0) throw new PlanValidationError(issues);
  ticksPerTurn(config);
  const teamCommits = state.teamCommits.map((team) =>
    team.teamId === teamId ? { ...team, committed: true } : team,
  );
  const committed = { ...state, teamCommits };
  return teamCommits.every((team) => team.committed) ? beginExecution(committed) : committed;
}

/**
 * Commits every team and starts execution. The prototype has one local planning controller for
 * both teams, so this is what the COMMIT PLANS button calls.
 */
export function commitPlans(
  state: SimulationState,
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
): SimulationState {
  assertPhase(state.phase, 'planning', 'commit plans');
  const issues = validatePlans(state);
  if (issues.length > 0) throw new PlanValidationError(issues);
  return state.teamCommits
    .filter((team) => !team.committed)
    .reduce((next, team) => commitTeam(next, team.teamId, config), state);
}

function returnToPlanning(state: SimulationState, action: string): SimulationState {
  assertPhaseTransition(state.phase, 'planning', action);
  return {
    ...state,
    phase: 'planning',
    turn: state.turn + 1,
    turnTick: 0,
    teamCommits: state.teamCommits.map((team) => ({ ...team, committed: false })),
  };
}

/**
 * One fixed simulation step. Throws outside execution (the simulation never advances during
 * planning). After the last tick of the window the match returns to planning for the next turn;
 * commands, positions, velocities, stamina and path progress are carried over untouched.
 */
export function stepExecution(
  state: SimulationState,
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
): SimulationState {
  assertPhase(state.phase, 'execution', 'advance the simulation');
  const stepped = stepPlayers(state, config);
  const advanced = { ...stepped, tick: state.tick + 1, turnTick: state.turnTick + 1 };
  return advanced.turnTick >= ticksPerTurn(config)
    ? returnToPlanning(advanced, 'end the turn')
    : advanced;
}

/** Stops play mid-execution. Running commands are paused and resume at the next commit. */
export function callStoppage(state: SimulationState): SimulationState {
  assertPhaseTransition(state.phase, 'stoppage', 'call a stoppage');
  return { ...state, phase: 'stoppage', commands: pauseActiveCommands(state.commands) };
}

/** Leaves a stoppage for the next turn's planning. */
export function endStoppage(state: SimulationState): SimulationState {
  return returnToPlanning(state, 'end the stoppage');
}

/** Ends the match (reserved; no match-ending rules yet). Only allowed from planning. */
export function finishMatch(state: SimulationState): SimulationState {
  assertPhaseTransition(state.phase, 'finished', 'finish the match');
  return { ...state, phase: 'finished' };
}

/** Commits and runs one whole execution window; for tests and headless simulation. */
export function simulateTurn(
  state: SimulationState,
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
): SimulationState {
  let current = commitPlans(state, config);
  while (current.phase === 'execution') current = stepExecution(current, config);
  return current;
}
