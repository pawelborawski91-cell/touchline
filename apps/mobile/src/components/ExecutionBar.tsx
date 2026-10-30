import type { EngineView, MatchEngine } from '@touchline/match-engine';
import { StyleSheet, Text, View } from 'react-native';

import { useTurnSnapshot } from '../hooks/useMatchEngine';
import { colors } from '../theme/colors';
import { ControlButton } from './PlanningControls';

interface ExecutionBarProps {
  engine: MatchEngine;
  view: EngineView;
  /** Shows the developer-only stoppage control. */
  debug: boolean;
}

/**
 * Bottom strip outside planning: execution countdown and progress (both from simulation ticks),
 * the background-suspension notice, stoppage and the finished state. No editing controls.
 */
export function ExecutionBar({ engine, view, debug }: ExecutionBarProps) {
  const turn = useTurnSnapshot(engine);

  if (view.phase === 'stoppage') {
    return (
      <View style={styles.row}>
        <Text style={[styles.title, styles.amber]}>STOPPAGE</Text>
        <Text style={styles.summary}>
          {view.ball.isOutOfPlay
            ? 'Ball out of play. Running commands are paused; drop the ball in planning.'
            : 'Play stopped; running commands are paused.'}
        </Text>
        <View style={styles.spacer} />
        <ControlButton label="RETURN TO PLANNING" onPress={() => engine.endStoppage()} />
      </View>
    );
  }
  if (view.phase === 'finished') {
    return (
      <View style={styles.row}>
        <Text style={styles.title}>MATCH FINISHED</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={[styles.title, view.suspended ? styles.amber : styles.live]}>
        {view.suspended ? 'PAUSED' : 'EXECUTING'}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${turn.progress * 100}%` }]} />
      </View>
      <Text style={styles.countdown}>{turn.remainingSeconds.toFixed(1)} s</Text>
      {view.suspended ? (
        <ControlButton label="RESUME" onPress={() => engine.resume()} tone="go" />
      ) : (
        debug && <ControlButton label="Stoppage" onPress={() => engine.callStoppage()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  live: {
    color: colors.accent,
  },
  amber: {
    color: colors.amber,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  countdown: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 48,
    textAlign: 'right',
  },
  summary: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  spacer: {
    flex: 1,
  },
});
