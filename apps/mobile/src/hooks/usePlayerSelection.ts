import { findMarkerAt, type CameraController, type HitTarget } from '@touchline/renderer';
import type { MatchSnapshot } from '@touchline/shared';
import { useCallback, useMemo } from 'react';

import { usePlanningStore } from '../stores/planningStore';

/**
 * Tap handling for selection. Runs on the JS thread: it reads the current camera transform,
 * hit-tests markers in screen space (closest wins), and feeds the planning reducer, which
 * ignores taps while a path is being drawn or previewed.
 */
export function usePlayerSelection(snapshot: MatchSnapshot, camera: CameraController) {
  const dispatch = usePlanningStore((state) => state.dispatch);
  const targets = useMemo<HitTarget[]>(
    () => snapshot.players.map((player) => ({ id: player.id, position: player.position })),
    [snapshot.players],
  );

  return useCallback(
    (x: number, y: number) => {
      const playerId = findMarkerAt(targets, { x, y }, camera.transform.value);
      dispatch(playerId ? { type: 'tapPlayer', playerId } : { type: 'tapEmpty' });
    },
    [camera.transform, dispatch, targets],
  );
}
