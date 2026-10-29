/**
 * Visual variants for movement paths. Sizes are screen pixels and are converted to world units
 * with the camera's inverse scale, so paths keep their weight at every zoom.
 */
export type MovementPathVariant =
  'draft' | 'selected' | 'queued' | 'active' | 'paused' | 'completed' | 'cancelled';

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
  /** Being drawn or previewed. */
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
  /** The selected player's queued command. */
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
  /** Queued for the next execution. */
  queued: {
    color: 'rgba(92, 225, 255, 0.8)',
    width: 2.25,
    glowColor: null,
    glowWidth: 0,
    arrowLength: 9,
    arrowHalfWidth: 5,
    endpointRadius: 5.5,
    endpointFill: 'rgba(92, 225, 255, 0.28)',
    chevronSpacing: 0,
  },
  /** Running (or carried over to the next turn): drawn from the player onwards only. */
  active: {
    color: '#B8F36B',
    width: 3,
    glowColor: 'rgba(184, 243, 107, 0.3)',
    glowWidth: 8,
    arrowLength: 10,
    arrowHalfWidth: 5.5,
    endpointRadius: 5.5,
    endpointFill: 'rgba(184, 243, 107, 0.22)',
    chevronSpacing: 0,
  },
  /** Paused by a stoppage; resumes at the next commit. */
  paused: {
    color: 'rgba(232, 176, 82, 0.8)',
    width: 2.5,
    glowColor: null,
    glowWidth: 0,
    arrowLength: 9,
    arrowHalfWidth: 5,
    endpointRadius: 5,
    endpointFill: 'rgba(232, 176, 82, 0.22)',
    chevronSpacing: 0,
  },
  /** Finished; a faint trace of where the player went. */
  completed: {
    color: 'rgba(196, 204, 210, 0.45)',
    width: 1.5,
    glowColor: null,
    glowWidth: 0,
    arrowLength: 0,
    arrowHalfWidth: 0,
    endpointRadius: 3,
    endpointFill: 'rgba(196, 204, 210, 0.2)',
    chevronSpacing: 0,
  },
  /** Cancelled or interrupted; only drawn in debug mode. */
  cancelled: {
    color: 'rgba(226, 102, 92, 0.45)',
    width: 1.25,
    glowColor: null,
    glowWidth: 0,
    arrowLength: 0,
    arrowHalfWidth: 0,
    endpointRadius: 3,
    endpointFill: 'rgba(226, 102, 92, 0.15)',
    chevronSpacing: 0,
  },
};

/** Marker for the waypoint a running command is heading for. */
export const CURRENT_WAYPOINT_STYLE = {
  radius: 3.5,
  color: '#F2F5F7',
  outline: 'rgba(6, 18, 26, 0.7)',
} as const;

/** Dark under-stroke that keeps cyan paths legible over the light pitch lines. */
export const PATH_OUTLINE_COLOR = 'rgba(6, 18, 26, 0.55)';
