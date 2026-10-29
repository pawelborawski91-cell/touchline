import type { MatchEngine, EngineView } from '@touchline/match-engine';
import { StyleSheet, Text, View } from 'react-native';

import { useEngineTicker } from '../hooks/useMatchEngine';
import { colors } from '../theme/colors';
import { ControlButton } from './PlanningControls';

interface ExecutionBarProps {
  engine: MatchEngine;
  view: EngineView;
  onNextTurn: () => void;
}

/** Bottom strip while a turn runs (progress) and once it has finished (NEXT TURN). */
export function ExecutionBar({ engine, view, onNextTurn }: ExecutionBarProps) {
  const info = useEngineTicker(engine, view);
  const progress = Math.min(info.turnTick / info.ticksPerTurn, 1);
  const executing = view.phase === 'executing';
  const turnLength = info.ticksPerTurn * engine.config.match.fixedDeltaTime;
  const count = (status: string) => info.players.filter((p) => p.commandStatus === status).length;

  return (
    <View style={styles.row}>
      <Text style={[styles.title, executing && styles.titleLive]}>
        {executing ? `EXECUTING TURN ${view.turn}` : `TURN ${view.turn} COMPLETE`}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.time}>
        {info.turnSeconds.toFixed(1)} / {turnLength.toFixed(1)} s
      </Text>
      <Text style={styles.summary} numberOfLines={1}>
        {executing
          ? `${count('active')} moving · ${count('completed')} arrived`
          : `${count('completed')} arrived · ${count('paused')} continue next turn`}
      </Text>
      {!executing && <ControlButton label="NEXT TURN" onPress={onNextTurn} tone="go" />}
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
  titleLive: {
    color: colors.accent,
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
  time: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 70,
    textAlign: 'right',
  },
  summary: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
