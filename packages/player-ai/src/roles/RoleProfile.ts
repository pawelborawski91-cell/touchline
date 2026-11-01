import type { BehaviorId, PlayerRole } from '../core/AIDecision';

/** Utility multipliers per behavior, 0–1. A behavior missing from the map is not available. */
export type BehaviorWeights = Readonly<Partial<Record<BehaviorId, number>>>;

/** Role-specific preferences. Behaviors are shared; roles decide which apply and how much. */
export interface RoleProfile {
  role: PlayerRole;
  weights: BehaviorWeights;
  /** Furthest the ball may be from this player's anchor for them to press or chase it, m. */
  pressRange: number;
  /** Positional targets stay within this distance of the formation anchor, m. */
  leash: number;
}
