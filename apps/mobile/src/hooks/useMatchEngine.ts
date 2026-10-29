import { MatchEngine, type EngineDebugInfo, type EngineView } from '@touchline/match-engine';
import { createInitialMatch } from '@touchline/shared';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

export interface MatchEngineHandle {
  engine: MatchEngine;
  /** Low-frequency engine view: plan, phase and turn. Re-renders only when they change. */
  view: EngineView;
  /** Interpolated `[x, y, facing]` per player, written every frame while executing. */
  playerFrame: SharedValue<readonly number[]>;
}

/**
 * Owns one MatchEngine for the screen and drives its fixed-timestep loop with
 * requestAnimationFrame while a turn is executing. The loop only feeds real frame time to the
 * engine and copies interpolated positions to the UI thread; it never touches simulation state.
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
    if (view.phase !== 'executing') return undefined;
    let frameId = 0;
    let last: number | null = null;
    const loop = (now: number) => {
      // The first frame (and the first after returning from background) only sets the baseline.
      const dt = last === null ? 0 : (now - last) / 1000;
      last = now;
      engine.advanceFrame(dt);
      playerFrame.value = engine.writeFrame([]);
      if (engine.getState().phase === 'executing') frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') last = null;
    });
    return () => {
      cancelAnimationFrame(frameId);
      subscription.remove();
    };
  }, [engine, playerFrame, view.phase]);

  return { engine, view, playerFrame };
}

const TICKER_INTERVAL_MS = 100;

/**
 * Engine debug info for HUD text (clock, progress, debug overlay). Polls at 10 Hz while
 * executing so only the components that use it re-render, never the pitch.
 */
export function useEngineTicker(engine: MatchEngine, view: EngineView): EngineDebugInfo {
  const [info, setInfo] = useState(() => engine.getDebugInfo());

  useEffect(() => {
    setInfo(engine.getDebugInfo());
    if (view.phase !== 'executing') return undefined;
    const id = setInterval(() => setInfo(engine.getDebugInfo()), TICKER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [engine, view]);

  return info;
}
