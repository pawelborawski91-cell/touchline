import type { PlayerCommand, PlanningMode } from '@touchline/planning';
import { TEAM_KITS } from '@touchline/renderer';
import { getTeamSide, type MatchPlayer, type MatchSnapshot } from '@touchline/shared';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

interface PlayerInfoPanelProps {
  snapshot: MatchSnapshot;
  player: MatchPlayer;
  command: PlayerCommand | undefined;
  /** Path progress of the command, 0–1, once it has started. */
  progress: number | null;
  mode: PlanningMode;
  editing: boolean;
}

const STATUS_TONES: Partial<Record<PlayerCommand['status'], string>> = {
  queued: colors.path,
  active: colors.accent,
  paused: colors.amber,
  completed: colors.textMuted,
};

function describeStatus(
  mode: PlanningMode,
  command: PlayerCommand | undefined,
  progress: number | null,
  editing: boolean,
) {
  if (mode === 'drawing_path') return { label: 'DRAWING', tone: colors.path };
  if (mode === 'previewing_path') {
    const replacing = command !== undefined && command.status !== 'completed';
    const label = editing ? 'EDITING' : replacing ? 'REPLACING' : 'DRAFT';
    return { label, tone: colors.path };
  }
  if (command) {
    const parts = [command.status.toUpperCase(), command.movementMode.toUpperCase()];
    if (progress !== null && command.status !== 'queued') {
      parts.push(`${Math.round(progress * 100)}%`);
    }
    return { label: parts.join(' · '), tone: STATUS_TONES[command.status] ?? colors.textMuted };
  }
  return { label: 'NO COMMAND', tone: colors.textMuted };
}

/** Compact one-line player card shown in the bottom strip, outside the pitch. */
export function PlayerInfoPanel({
  snapshot,
  player,
  command,
  progress,
  mode,
  editing,
}: PlayerInfoPanelProps) {
  const side = getTeamSide(snapshot, player.teamId) ?? 'home';
  const team = side === 'home' ? snapshot.home : snapshot.away;
  const status = describeStatus(mode, command, progress, editing);
  const { x, y } = player.position;

  return (
    <View style={styles.panel}>
      <View style={[styles.badge, { backgroundColor: TEAM_KITS[side].fill }]}>
        <Text style={styles.badgeNumber}>{player.shirtNumber}</Text>
      </View>
      <View style={styles.identity}>
        <Text style={styles.role}>{player.role}</Text>
        <Text style={styles.team} numberOfLines={1}>
          {team.name}
        </Text>
      </View>
      <Text style={styles.coords}>
        {x.toFixed(1)}, {y.toFixed(1)} m
      </Text>
      <View style={[styles.status, { borderColor: status.tone }]}>
        <Text style={[styles.statusText, { color: status.tone }]}>{status.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 4,
    paddingRight: 12,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  badgeNumber: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  role: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  team: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  coords: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  status: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
});
