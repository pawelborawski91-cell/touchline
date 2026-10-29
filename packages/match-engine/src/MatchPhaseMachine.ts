import type { MatchPhase } from '@touchline/shared';

/**
 * Legal match phase transitions:
 *
 * ```
 * planning ──commit──► execution ──turn ends──► planning
 *    │                     │
 *    │ finish              │ stoppage
 *    ▼                     ▼
 * finished            stoppage ──resume──► planning
 * ```
 *
 * `finished` is terminal and reserved (no match-ending rules yet).
 */
export const PHASE_TRANSITIONS: Readonly<Record<MatchPhase, readonly MatchPhase[]>> = Object.freeze(
  {
    planning: ['execution', 'finished'],
    execution: ['planning', 'stoppage'],
    stoppage: ['planning'],
    finished: [],
  },
);

export function canTransitionPhase(from: MatchPhase, to: MatchPhase): boolean {
  return PHASE_TRANSITIONS[from].includes(to);
}

/** An action was requested in a phase that does not allow it. */
export class MatchStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatchStateError';
  }
}

export class PhaseTransitionError extends MatchStateError {
  constructor(
    readonly from: MatchPhase,
    readonly to: MatchPhase,
    action: string,
  ) {
    super(`Cannot ${action}: the match cannot go from ${from} to ${to}.`);
    this.name = 'PhaseTransitionError';
  }
}

/** Throws `PhaseTransitionError` unless `from → to` is legal; `action` names the request. */
export function assertPhaseTransition(from: MatchPhase, to: MatchPhase, action: string): void {
  if (!canTransitionPhase(from, to)) throw new PhaseTransitionError(from, to, action);
}

/** Throws `MatchStateError` unless the match is in `expected`. */
export function assertPhase(actual: MatchPhase, expected: MatchPhase, action: string): void {
  if (actual !== expected) {
    throw new MatchStateError(`Cannot ${action} during ${actual}; only during ${expected}.`);
  }
}
