import type { EngineView, MatchEngine, PlayerDebugInfo } from '@touchline/match-engine';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { useEngineDebug } from '../hooks/useMatchEngine';

interface DebugOverlayProps {
  engine: MatchEngine;
  view: EngineView;
  selectedPlayerId: string | null;
}

function describeCommand(p: PlayerDebugInfo): string {
  if (!p.commandStatus) return 'no command';
  const waypoint =
    p.waypointIndex !== null && p.waypointCount !== null
      ? ` wp ${p.waypointIndex}/${p.waypointCount - 1}`
      : '';
  const progress = p.progress !== null ? ` ${(p.progress * 100).toFixed(0)}%` : '';
  return `${p.commandStatus} ${p.movementMode ?? '-'}${waypoint}${progress}`;
}

/** Developer readout of the simulation: turn, phase, tick, command counts and movement state. */
export function DebugOverlay({ engine, view, selectedPlayerId }: DebugOverlayProps) {
  const info = useEngineDebug(engine, view, selectedPlayerId);
  const { counts, selected } = info;
  const others = info.players.filter((p) => p.playerId !== selectedPlayerId);

  return (
    <View style={styles.panel} pointerEvents="none">
      <Text style={styles.header}>
        turn {info.turn} · {info.phase}
        {info.suspended ? ' (suspended)' : ''} · tick {info.tick}
      </Text>
      <Text style={styles.line}>
        turn tick {info.turnTick}/{info.ticksPerTurn} · elapsed {info.turnSeconds.toFixed(2)} s
      </Text>
      <Text style={styles.line}>
        active {counts.active} · queued {counts.queued} · paused {counts.paused} · done{' '}
        {counts.completed} · cancelled {counts.cancelled + counts.interrupted}
      </Text>
      {selected && (
        <Text style={[styles.line, styles.selected]}>
          ▶ #{selected.shirtNumber} {selected.role} {selected.speed.toFixed(2)} m/s ·{' '}
          {describeCommand(selected)} · st {selected.staminaCurrent.toFixed(3)}
        </Text>
      )}
      {others.slice(0, 6).map((p) => (
        <Text key={p.playerId} style={styles.line}>
          #{String(p.shirtNumber).padEnd(2)} {p.role.padEnd(3)} {p.speed.toFixed(2)} m/s ·{' '}
          {describeCommand(p)}
        </Text>
      ))}
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
  selected: {
    color: '#8FE6FF',
  },
});
