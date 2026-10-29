/**
 * Visual variants for movement paths. Sizes are screen pixels and are converted to world units
 * with the camera's inverse scale, so paths keep their weight at every zoom.
 */
export type MovementPathVariant = 'draft' | 'selected' | 'queued' | 'active' | 'completed';

export interface MovementPathStyle {
  color: string;
  width: number;
  glowColor: string | null;
  glowWidth: number;
  arrowLength: number;
  arrowHalfWidth: number;
  endpointRadius: number;
  endpointFill: string;
  /** Spacing of direction chevrons along the path; 0 disables them. */
  chevronSpacing: number;
}

export const MOVEMENT_PATH_STYLES: Readonly<Record<MovementPathVariant, MovementPathStyle>> = {
  draft: {
    color: '#5CE1FF',
    width: 3.5,
    glowColor: 'rgba(92, 225, 255, 0.45)',
    glowWidth: 11,
    arrowLength: 13,
    arrowHalfWidth: 7.5,
    endpointRadius: 8,
    endpointFill: 'rgba(92, 225, 255, 0.22)',
    chevronSpacing: 46,
  },
  selected: {
    color: '#8FE6FF',
    width: 3,
    glowColor: 'rgba(92, 225, 255, 0.25)',
    glowWidth: 8,
    arrowLength: 11,
    arrowHalfWidth: 6.5,
    endpointRadius: 6.5,
    endpointFill: 'rgba(143, 230, 255, 0.2)',
    chevronSpacing: 0,
  },
  queued: {
    color: 'rgba(170, 222, 240, 0.55)',
    width: 2,
    glowColor: null,
    glowWidth: 0,
    arrowLength: 8,
    arrowHalfWidth: 4.5,
    endpointRadius: 4,
    endpointFill: 'rgba(170, 222, 240, 0.18)',
    chevronSpacing: 0,
  },
  /** Being executed right now. */
  active: {
    color: '#B8F36B',
    width: 2.5,
    glowColor: 'rgba(184, 243, 107, 0.3)',
    glowWidth: 7,
    arrowLength: 9,
    arrowHalfWidth: 5,
    endpointRadius: 5,
    endpointFill: 'rgba(184, 243, 107, 0.2)',
    chevronSpacing: 0,
  },
  /** Finished this turn; kept as a faint trace. */
  completed: {
    color: 'rgba(200, 225, 235, 0.22)',
    width: 1.5,
    glowColor: null,
    glowWidth: 0,
    arrowLength: 0,
    arrowHalfWidth: 0,
    endpointRadius: 3,
    endpointFill: 'rgba(200, 225, 235, 0.12)',
    chevronSpacing: 0,
  },
};

/** Dark under-stroke that keeps cyan paths legible over the light pitch lines. */
export const PATH_OUTLINE_COLOR = 'rgba(6, 18, 26, 0.55)';
