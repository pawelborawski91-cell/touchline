import type { Behavior } from '../core/Behavior';
import type { BehaviorId } from '../core/AIDecision';
import { ATTACKING_BEHAVIORS } from './attacking/AttackingBehaviors';
import { DEFENDING_BEHAVIORS } from './defending/DefendingBehaviors';
import { GENERAL_BEHAVIORS } from './general/GeneralBehaviors';
import { TRANSITION_BEHAVIORS } from './transition/TransitionBehaviors';

export { ATTACKING_BEHAVIORS } from './attacking/AttackingBehaviors';
export { DEFENDING_BEHAVIORS } from './defending/DefendingBehaviors';
export { GENERAL_BEHAVIORS } from './general/GeneralBehaviors';
export { TRANSITION_BEHAVIORS } from './transition/TransitionBehaviors';

/** Every behavior, in a fixed order. */
export const ALL_BEHAVIORS: readonly Behavior[] = [
  ...GENERAL_BEHAVIORS,
  ...ATTACKING_BEHAVIORS,
  ...DEFENDING_BEHAVIORS,
  ...TRANSITION_BEHAVIORS,
];

export const BEHAVIORS_BY_ID: Readonly<Record<BehaviorId, Behavior>> = Object.fromEntries(
  ALL_BEHAVIORS.map((behavior) => [behavior.id, behavior]),
) as Record<BehaviorId, Behavior>;
