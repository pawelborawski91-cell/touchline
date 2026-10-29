import type { Vector2 } from '@touchline/shared';

export const ZERO: Readonly<Vector2> = Object.freeze({ x: 0, y: 0 });

export function vec(x: number, y: number): Vector2 {
  return { x, y };
}

export function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vector2, s: number): Vector2 {
  return { x: v.x * s, y: v.y * s };
}

export function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

export function length(v: Vector2): number {
  return Math.hypot(v.x, v.y);
}

export function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function normalize(v: Vector2): Vector2 {
  const len = length(v);
  return len > 1e-12 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
}

export function lerp(a: Vector2, b: Vector2, t: number): Vector2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Unit vector for a heading in radians. */
export function fromAngle(angle: number): Vector2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function angleOf(v: Vector2): number {
  return Math.atan2(v.y, v.x);
}
