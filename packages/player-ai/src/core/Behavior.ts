import type { MovementMode, Vector2 } from '@touchline/shared';

import type { AIContext } from './AIContext';
import type { BehaviorCategory, BehaviorId, TeamPlayState } from './AIDecision';

/** A behavior's answer for one player at one moment. */
export interface BehaviorProposal {
  /** Raw situational utility, 0–1 (role and global weights are applied afterwards). */
  utility: number;
  target: Vector2;
  movementMode: MovementMode;
  focusPlayerId?: string | null;
  /**
   * The target follows the ball or a player, so it is refreshed more eagerly and approached
   * without settling early.
   */
  tracking?: boolean;
  /** Speed to keep on arrival (running onto the ball), m/s. */
  exitSpeed?: number;
  /**
   * Positional targets are kept near the formation anchor (`leashScale` × the role's leash; null
   * for no leash), pushed apart from teammates, and their pace is capped by distance.
   */
  positional?: boolean;
  leashScale?: number | null;
}

/**
 * A reusable football action. Availability is layered: the team's play state (`states`), the
 * player's role (a weight in the role profile), then the situation (`eligible`).
 */
export interface Behavior {
  id: BehaviorId;
  category: BehaviorCategory;
  states: readonly TeamPlayState[];
  /** 3 urgent (ball), 2 tactical, 1 positional. Breaks utility ties; urgent ones skip cooldowns. */
  priority: number;
  eligible(context: AIContext): boolean;
  evaluate(context: AIContext): BehaviorProposal | null;
}
