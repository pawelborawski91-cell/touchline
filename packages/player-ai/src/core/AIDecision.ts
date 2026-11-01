import type { MovementMode, Vector2 } from '@touchline/shared';

/**
 * Who drives a player's movement. `manual`: an active user command (the AI never touches it).
 * `autonomous`: no command, the AI chooses. `inactive`: out of normal play (reserved for future
 * match events; no AI and no intent).
 */
export type PlayerControlMode = 'manual' | 'autonomous' | 'inactive';

/** A team's phase of play, derived from actual possession changes. */
export type TeamPlayState =
  'attacking' | 'defending' | 'transition_attack' | 'transition_defense' | 'neutral';

export const TEAM_PLAY_STATES: readonly TeamPlayState[] = [
  'attacking',
  'defending',
  'transition_attack',
  'transition_defense',
  'neutral',
];

/** Tactical archetype a player performs in the current formation. */
export type PlayerRole = 'GK' | 'CB' | 'FB' | 'DM' | 'CM' | 'AM' | 'WG' | 'ST';

export const PLAYER_ROLES: readonly PlayerRole[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'WG', 'ST'];

export type BehaviorCategory = 'attacking' | 'defending' | 'transition' | 'general';

export type BehaviorId =
  // general
  | 'carry_ball'
  | 'chase_loose_ball'
  | 'protect_goal'
  | 'hold_position'
  // attacking
  | 'support_carrier'
  | 'find_space'
  | 'offer_pass'
  | 'forward_run'
  | 'hold_width'
  | 'hold_depth'
  | 'attack_box'
  | 'defensive_cover'
  // defending
  | 'press_carrier'
  | 'mark_opponent'
  | 'protect_centre'
  | 'track_runner'
  | 'recover_position'
  | 'hold_line'
  | 'cover_teammate'
  | 'intercept_lane'
  | 'hold_defensive_position'
  // transition
  | 'counter_press'
  | 'recover_shape'
  | 'counter_run'
  | 'support_forward';

/** The behavior a player has chosen, with its score. */
export interface AIDecision {
  playerId: string;
  behaviorId: BehaviorId;
  targetPosition: Vector2 | null;
  /** Final weighted utility, 0–1. */
  utility: number;
  /** Behavior tier: 3 urgent (ball), 2 tactical, 1 positional. */
  priority: number;
  movementMode: MovementMode;
  /** Player the behavior is about (pressed carrier, marked opponent…), if any. */
  focusPlayerId: string | null;
}

/**
 * What an autonomous player wants to do; the match engine's movement physics executes it.
 * Separate from user `PlayerCommand`s: the AI never creates or edits commands.
 */
export interface MovementIntent {
  playerId: string;
  targetPosition: Vector2;
  movementMode: MovementMode;
  behaviorId: BehaviorId;
  priority: number;
  /** Within this distance of the target the player settles (brakes to a stop), m. */
  arrivalRadius: number;
  /** Speed to keep when reaching the target (> 0 to run onto a ball), m/s. */
  exitSpeed: number;
}
