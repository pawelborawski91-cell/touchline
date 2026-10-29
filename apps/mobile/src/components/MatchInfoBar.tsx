import { TEAM_KITS } from '@touchline/renderer';
import type { MatchSnapshot } from '@touchline/shared';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface MatchInfoBarProps {
  snapshot: MatchSnapshot;
  /** Live clock override while the simulation runs; defaults to the snapshot's clock. */
  clockSeconds?: number;
  /** Optional element shown at the right end of the bar. */
  accessory?: ReactNode;
}

export function MatchInfoBar({ snapshot, clockSeconds, accessory }: MatchInfoBarProps) {
  return (
    <View style={styles.bar}>
      <View style={[styles.team, styles.homeTeam]}>
        <View style={[styles.swatch, { backgroundColor: TEAM_KITS.home.fill }]} />
        <Text style={styles.teamName} numberOfLines={1}>
          {snapshot.home.name}
        </Text>
      </View>
      <View style={styles.centre}>
        <Text style={styles.score}>
          {snapshot.score.home}–{snapshot.score.away}
        </Text>
        <Text style={styles.clock}>{formatClock(clockSeconds ?? snapshot.clockSeconds)}</Text>
      </View>
      <View style={[styles.team, styles.awayTeam]}>
        <Text style={styles.teamName} numberOfLines={1}>
          {snapshot.away.name}
        </Text>
        <View style={[styles.swatch, { backgroundColor: TEAM_KITS.away.fill }]} />
      </View>
      {accessory && <View style={styles.accessory}>{accessory}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  accessory: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    marginBottom: 6,
  },
  team: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  homeTeam: {
    justifyContent: 'flex-end',
  },
  awayTeam: {
    justifyContent: 'flex-start',
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  teamName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  centre: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginHorizontal: 18,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  score: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  clock: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
