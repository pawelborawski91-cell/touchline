import {
  MatchEngine,
  type EngineAIDebugInfo,
  type EngineDebugInfo,
  type EngineView,
  type TurnSnapshot,
} from '@touchline/match-engine';
import { createInitialMatch, type Vector3 } from '@touchline/shared';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

export interface MatchEngineHandle {
  engine: MatchEngine;
  /** Low-frequency engine view: plan, phase, turn, suspension. */
  view: EngineView;
  /** Interpolated frame (players, then the ball at `ballFrameOffset`), written every frame. */
  playerFrame: SharedValue<readonly number[]>;
}

/**
 * Owns the screen's single MatchEngine and drives its fixed-timestep loop with
 * requestAnimationFrame, only while executing and not suspended. The loop feeds real frame time
 * to the engine and copies the interpolated frame to the UI thread; it never touches simulation
 * state. Leaving the foreground suspends execution, which then needs an explicit RESUME.
 */
export function useMatchEngine(): MatchEngineHandle {
  const engineRef = useRef<MatchEngine | null>(null);
  engineRef.current ??= new MatchEngine(createInitialMatch());
  const engine = engineRef.current;

  const view = useSyncExternalStore(engine.subscribe, engine.getView);
  const playerFrame = useSharedValue<readonly number[]>(engine.writeFrame([]));

  useEffect(() => {
    playerFrame.value = engine.writeFrame([]);
  }, [engine, playerFrame, view]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') engine.suspend();
    });
    return () => subscription.remove();
  }, [engine]);

  const running = view.phase === 'execution' && !view.suspended;
  useEffect(() => {
    if (!running) return undefined;
    let frameId = 0;
    let last: number | null = null;
    const loop = (now: number) => {
      // The first frame only sets the baseline, so the time before it is never simulated.
      const dt = last === null ? 0 : (now - last) / 1000;
      last = now;
      engine.advanceFrame(dt);
      playerFrame.value = engine.writeFrame([]);
      if (engine.getState().phase === 'execution' && !engine.isSuspended) {
        frameId = requestAnimationFrame(loop);
      }
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [engine, playerFrame, running]);

  return { engine, view, playerFrame };
}

/** Turn timing, re-rendering once per simulated tick (the countdown follows simulation time). */
export function useTurnSnapshot(engine: MatchEngine): TurnSnapshot {
  return useSyncExternalStore(engine.subscribeTicks, engine.getTurnSnapshot);
}

/** Free-flight ball prediction for the debug visualisation, refreshed every tick while enabled. */
export function useBallTrajectory(
  engine: MatchEngine,
  view: EngineView,
  enabled: boolean,
): Vector3[] | null {
  const turn = useTurnSnapshot(engine);
  return useMemo(
    () => (enabled ? engine.predictBallTrajectory(3) : null),
    [enabled, engine, turn, view],
  );
}

/** Engine debug readout, refreshed with every simulated tick and every view change. */
export function useEngineDebug(
  engine: MatchEngine,
  view: EngineView,
  selectedPlayerId: string | null,
): EngineDebugInfo {
  const turn = useTurnSnapshot(engine);
  // `turn` and `view` are new objects whenever the engine state changes.
  return useMemo(
    () => engine.getDebugInfo(selectedPlayerId),
    [engine, selectedPlayerId, turn, view],
  );
}

/** Player AI debug readout, refreshed every tick while enabled (null when disabled). */
export function useAIDebug(
  engine: MatchEngine,
  view: EngineView,
  enabled: boolean,
): EngineAIDebugInfo | null {
  const turn = useTurnSnapshot(engine);
  return useMemo(() => (enabled ? engine.getAIDebugInfo() : null), [enabled, engine, turn, view]);
}
