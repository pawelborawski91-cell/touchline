import type { PlayerState, PossessionState } from '@touchline/shared';

import type { BallConfig } from './BallConfig';
import {
  setRollingSpin,
  type BallBody,
  type BallSimulationState,
  type PossessionSnapshot,
} from './BallState';

/** Fastest ball (relative to the player) this player can bring under control, m/s. */
export function controlSpeedLimit(player: PlayerState, config: BallConfig): number {
  return config.controlSpeedBase + config.controlSpeedPerSkill * player.technical.ballControl;
}

export function relativeSpeed(body: BallBody, player: PlayerState): number {
  return Math.hypot(body.vx - player.velocity.x, body.vy - player.velocity.y);
}

/**
 * Whether a touch at the given ball underside height can become control: the ball must be low
 * enough for a grounded player (no headers or chest control yet) and slow enough relative to
 * them for their first touch.
 */
export function canControl(
  body: BallBody,
  height: number,
  player: PlayerState,
  config: BallConfig,
): boolean {
  return (
    height <= config.controlHeight &&
    relativeSpeed(body, player) <= controlSpeedLimit(player, config)
  );
}

/**
 * First touch: the player absorbs most of the ball's velocity relative to them (more with better
 * ball control) and kills its bounce. The ball keeps its own position and velocity afterwards;
 * nothing ties it to the player.
 */
export function cushionBall(body: BallBody, player: PlayerState, config: BallConfig): void {
  const keep =
    1 - Math.min(0.98, config.cushionBase + config.cushionPerSkill * player.technical.ballControl);
  body.vx = player.velocity.x + (body.vx - player.velocity.x) * keep;
  body.vy = player.velocity.y + (body.vy - player.velocity.y) * keep;
  body.vz = Math.min(body.vz, 0) * 0.3;
  setRollingSpin(body);
  body.wz = 0;
}

/**
 * Deterministic challenge score: closer is better (dominant term), then agility, technique and
 * ball control; a large velocity mismatch with the ball counts against. The current controller
 * gets a small bonus so control does not flicker between equal players.
 */
export function contestScore(
  player: PlayerState,
  distance: number,
  body: BallBody,
  isController: boolean,
  config: BallConfig,
): number {
  const closeness = 1 - Math.min(distance / config.contestRadius, 1);
  return (
    0.4 * closeness +
    0.2 * player.movement.agility +
    0.15 * player.technical.technique +
    0.25 * player.technical.ballControl -
    0.02 * Math.min(relativeSpeed(body, player), 10) +
    (isController ? config.incumbentBonus : 0)
  );
}

export interface Contender {
  player: PlayerState;
  distance: number;
  score: number;
}

/** Best contender: highest score, ties broken by player id so the result never depends on order. */
export function strongestContender(contenders: readonly Contender[]): Contender | null {
  let best: Contender | null = null;
  for (const contender of contenders) {
    if (
      !best ||
      contender.score > best.score ||
      (contender.score === best.score && contender.player.id < best.player.id)
    ) {
      best = contender;
    }
  }
  return best;
}

export function possessionStateFor(
  controllerPlayerId: string | null,
  contested: boolean,
  isOutOfPlay: boolean,
): PossessionState {
  if (isOutOfPlay) return 'out_of_play';
  if (contested) return 'contested';
  return controllerPlayerId ? 'controlled' : 'free';
}

export function getPossessionSnapshot(
  state: BallSimulationState,
  players: readonly PlayerState[],
): PossessionSnapshot {
  const { ball } = state;
  const controller = ball.controllerPlayerId
    ? players.find((p) => p.id === ball.controllerPlayerId)
    : undefined;
  return {
    state: ball.possessionState,
    controllerPlayerId: ball.controllerPlayerId,
    controllerTeamId: controller?.teamId ?? null,
    contenderIds: state.contenderIds,
    lastTouchPlayerId: ball.lastTouchPlayerId,
    lastTouchTeamId: ball.lastTouchTeamId,
  };
}
