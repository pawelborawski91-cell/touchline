import type { EngineView, MatchEngine } from '@touchline/match-engine';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { useEngineTicker } from '../hooks/useMatchEngine';

interface DebugOverlayProps {
  engine: MatchEngine;
  view: EngineView;
}

/** Developer readout of the simulation: tick, turn, phase and per-player movement state. */
export function DebugOverlay({ engine, view }: DebugOverlayProps) {
  const info = useEngineTicker(engine, view);
  const players = info.players.filter((p) => p.commandStatus !== null || p.speed > 0.01);

  return (
    <View style={styles.panel} pointerEvents="none">
      <Text style={styles.header}>
        tick {info.tick} · turn {info.turn} · {info.phase} · {info.turnTick}/{info.ticksPerTurn}
      </Text>
      {players.length === 0 ? (
        <Text style={styles.line}>no moving players</Text>
      ) : (
        players.slice(0, 8).map((p) => (
          <Text key={p.playerId} style={styles.line}>
            #{String(p.shirtNumber).padEnd(2)} {p.role.padEnd(3)} {p.speed.toFixed(2)} m/s{' '}
            {(p.movementMode ?? '-').padEnd(6)} {(p.commandStatus ?? '-').padEnd(9)} st{' '}
            {p.staminaCurrent.toFixed(3)}
          </Text>
        ))
      )}
    </View>
  );
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 8,
    top: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(6, 10, 14, 0.78)',
    gap: 2,
  },
  header: {
    color: '#C8F560',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MONO,
  },
  line: {
    color: '#E6ECEF',
    fontSize: 10,
    fontFamily: MONO,
  },
});
