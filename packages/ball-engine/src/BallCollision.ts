import type { PlayerState } from '@touchline/shared';

import type { BallConfig } from './BallConfig';
import type { BallBody } from './BallState';

/**
 * Time (0–1) at which a point moving from `s0` by `d` during the step first enters a circle of
 * radius `r` around the origin, or -1 if it does not. Starting inside counts as 0.
 */
export function sweptCircleEntry(
  s0x: number,
  s0y: number,
  dx: number,
  dy: number,
  r: number,
): number {
  const c = s0x * s0x + s0y * s0y - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return -1;
  const b = 2 * (s0x * dx + s0y * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/** Geometry of one player's contact with the ball during a step. */
export interface PlayerContact {
  playerIndex: number;
  /** Entry time into the player's reach circle, or -1. 0 when the ball starts within reach. */
  reachTime: number;
  /** Entry time into the body circle, or -1 (also -1 when overlapping but separating). */
  bodyTime: number;
  /** Underside height of the ball at the reach and body contact times, m. */
  reachHeight: number;
  bodyHeight: number;
  /** Ball position relative to the player at the start of the step, and its relative travel. */
  s0x: number;
  s0y: number;
  dx: number;
  dy: number;
}

/**
 * Finds every player the ball touches during a step. Motion is tested relative to each player
 * (ball path minus player path), so a fast ball cannot tunnel through a player and a running
 * player cannot run through a still ball. Players further than reach plus the step's relative
 * travel are rejected with a squared-distance test before any root solving.
 *
 * `start`/`end` are the ball's free-motion positions at the start and end of the step;
 * `previous`/`players` the players at the start and end (same order).
 */
export function findPlayerContacts(
  start: BallBody,
  end: BallBody,
  previous: readonly PlayerState[],
  players: readonly PlayerState[],
  config: BallConfig,
  out: PlayerContact[] = [],
): PlayerContact[] {
  out.length = 0;
  const reach = config.controlReach;
  const body = config.playerBodyRadius + start.radius;
  for (let i = 0; i < players.length; i += 1) {
    const player = players[i]!;
    const before = previous[i]?.id === player.id ? previous[i]! : player;
    const s0x = start.px - before.position.x;
    const s0y = start.py - before.position.y;
    const dx = end.px - player.position.x - s0x;
    const dy = end.py - player.position.y - s0y;
    const travel = Math.abs(dx) + Math.abs(dy);
    const limit = reach + travel;
    if (s0x * s0x + s0y * s0y > limit * limit) continue;

    const reachTime = sweptCircleEntry(s0x, s0y, dx, dy, reach);
    if (reachTime < 0) continue;
    let bodyTime = sweptCircleEntry(s0x, s0y, dx, dy, body);
    if (bodyTime === 0) {
      // Already overlapping: only a contact if the ball is still moving into the player.
      const vrx = end.vx - player.velocity.x;
      const vry = end.vy - player.velocity.y;
      if (s0x * vrx + s0y * vry >= 0) bodyTime = -1;
    }
    const heightAt = (t: number) => Math.max(0, start.pz + (end.pz - start.pz) * t - start.radius);
    out.push({
      playerIndex: i,
      reachTime,
      bodyTime,
      reachHeight: heightAt(reachTime),
      bodyHeight: bodyTime >= 0 ? heightAt(bodyTime) : Infinity,
      s0x,
      s0y,
      dx,
      dy,
    });
  }
  return out;
}

/**
 * Places the ball where the contact happened, relative to the player's end-of-step position, so
 * the contact geometry (distance and direction from the player) is exact. Height is interpolated.
 */
export function placeAtContact(
  body: BallBody,
  start: BallBody,
  end: BallBody,
  contact: PlayerContact,
  player: PlayerState,
  t: number,
): void {
  body.px = player.position.x + contact.s0x + contact.dx * t;
  body.py = player.position.y + contact.s0y + contact.dy * t;
  body.pz = Math.max(start.radius, start.pz + (end.pz - start.pz) * t);
}

/**
 * Bounces the ball off a player's body (an infinitely heavy vertical cylinder moving with the
 * player). Only the approaching part of the relative velocity is reflected, so a resting contact
 * never produces repeated impulses. The ball is moved out to the body surface along the normal,
 * so it can never be left inside a player.
 */
export function deflectOffPlayer(body: BallBody, player: PlayerState, config: BallConfig): void {
  const surface = config.playerBodyRadius + body.radius;
  let nx = body.px - player.position.x;
  let ny = body.py - player.position.y;
  let dist = Math.hypot(nx, ny);
  if (dist < 1e-9) {
    // Dead centre: push out against the ball's own motion (deterministic fallback).
    nx = -body.vx || 1;
    ny = -body.vy;
    dist = Math.hypot(nx, ny);
  }
  nx /= dist;
  ny /= dist;
  const vn = (body.vx - player.velocity.x) * nx + (body.vy - player.velocity.y) * ny;
  if (vn < 0) {
    const impulse = -(1 + config.bodyRestitution) * vn;
    body.vx += impulse * nx;
    body.vy += impulse * ny;
    body.vz *= 0.6;
    body.wx *= 0.5;
    body.wy *= 0.5;
    body.wz *= 0.5;
  }
  if (dist < surface) {
    body.px = player.position.x + nx * surface;
    body.py = player.position.y + ny * surface;
  }
}

/**
 * Removes any part of the ball's velocity (relative to the player) that points into the player's
 * body, so a ball resting against a player stays put instead of being pushed into them each step.
 */
export function stopAtBody(body: BallBody, player: PlayerState): void {
  const nx = body.px - player.position.x;
  const ny = body.py - player.position.y;
  const dist = Math.hypot(nx, ny);
  if (dist < 1e-9) return;
  const vn = ((body.vx - player.velocity.x) * nx + (body.vy - player.velocity.y) * ny) / dist;
  if (vn >= 0) return;
  body.vx -= (vn * nx) / dist;
  body.vy -= (vn * ny) / dist;
}
