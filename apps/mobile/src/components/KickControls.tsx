import type { KickType } from '@touchline/shared';
import { StyleSheet, View } from 'react-native';

import { ControlButton } from './PlanningControls';

export const KICK_LABELS: Readonly<Record<KickType, string>> = {
  pass: 'PASS',
  shot: 'SHOT',
  clearance: 'CLEAR',
  lob: 'LOB',
};

export interface KickControlActions {
  startAim: () => void;
  cycleType: () => void;
  cancelAim: () => void;
  cancelKick: () => void;
}

interface KickControlsProps {
  /** Kick type being aimed, or null when not aiming. */
  aiming: KickType | null;
  /** The selected player already has a kick order. */
  hasKick: boolean;
  actions: KickControlActions;
}

/** Kick orders for the selected player: aim (tap the pitch), choose the type, or cancel. */
export function KickControls({ aiming, hasKick, actions }: KickControlsProps) {
  if (aiming) {
    return (
      <View style={styles.row}>
        <ControlButton label={`Kick: ${KICK_LABELS[aiming]}`} onPress={actions.cycleType} />
        <ControlButton label="Cancel aim" onPress={actions.cancelAim} tone="danger" />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <ControlButton label={hasKick ? 'Re-aim' : 'Kick'} onPress={actions.startAim} />
      {hasKick && <ControlButton label="Cancel kick" onPress={actions.cancelKick} tone="danger" />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
