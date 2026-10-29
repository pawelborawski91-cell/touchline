export interface SimulationClockConfig {
  /** Fixed simulation step in seconds (0.05 = 20 Hz). */
  fixedDeltaTime: number;
  /** Real frame time above this is clamped (e.g. after the app was backgrounded). */
  maxFrameDelta: number;
  /** At most this many steps run per frame; leftover time is dropped (no spiral of death). */
  maxStepsPerFrame: number;
}

export const DEFAULT_CLOCK_CONFIG: Readonly<SimulationClockConfig> = Object.freeze({
  fixedDeltaTime: 0.05,
  maxFrameDelta: 0.25,
  maxStepsPerFrame: 5,
});

/** Tolerance so sums like 3 × (1/60) still count as one full 0.05 s step. */
const EPSILON = 1e-9;

/**
 * Accumulator for a fixed-timestep loop. Real frame time is added, whole steps are taken out,
 * and the remainder becomes the interpolation factor between the last two simulation states.
 */
export class SimulationClock {
  private accumulator = 0;

  constructor(readonly config: SimulationClockConfig = DEFAULT_CLOCK_CONFIG) {}

  /** Adds real time and returns how many fixed steps to run now. */
  advance(realDeltaSeconds: number): number {
    const dt = Number.isFinite(realDeltaSeconds)
      ? Math.min(Math.max(realDeltaSeconds, 0), this.config.maxFrameDelta)
      : 0;
    this.accumulator += dt;
    const { fixedDeltaTime, maxStepsPerFrame } = this.config;
    let steps = 0;
    while (this.accumulator + EPSILON >= fixedDeltaTime && steps < maxStepsPerFrame) {
      this.accumulator = Math.max(0, this.accumulator - fixedDeltaTime);
      steps += 1;
    }
    if (
      this.accumulator < EPSILON ||
      (steps === maxStepsPerFrame && this.accumulator >= fixedDeltaTime)
    ) {
      this.accumulator = 0;
    }
    return steps;
  }

  /** Fraction of a step accumulated since the last one, in [0, 1). */
  get alpha(): number {
    return Math.min(this.accumulator / this.config.fixedDeltaTime, 1);
  }

  reset(): void {
    this.accumulator = 0;
  }
}
