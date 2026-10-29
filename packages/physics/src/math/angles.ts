const TAU = Math.PI * 2;

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Wraps an angle to (-π, π]. */
export function normalizeAngle(angle: number): number {
  let a = angle % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

/** Signed shortest rotation from `from` to `to`, in (-π, π]. */
export function angleDifference(from: number, to: number): number {
  return normalizeAngle(to - from);
}

/** Rotates `from` towards `to` by at most `maxStep` radians. */
export function rotateTowards(from: number, to: number, maxStep: number): number {
  const diff = angleDifference(from, to);
  if (Math.abs(diff) <= maxStep) return normalizeAngle(to);
  return normalizeAngle(from + Math.sign(diff) * maxStep);
}

/** Interpolates along the shortest arc. */
export function lerpAngle(from: number, to: number, t: number): number {
  return normalizeAngle(from + angleDifference(from, to) * t);
}

export function moveTowards(value: number, target: number, maxDelta: number): number {
  if (Math.abs(target - value) <= maxDelta) return target;
  return value + Math.sign(target - value) * maxDelta;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
