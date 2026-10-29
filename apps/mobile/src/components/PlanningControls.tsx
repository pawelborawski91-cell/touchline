import type { PlanningMode } from '@touchline/planning';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

export interface PlanningControlActions {
  confirm: () => void;
  undoPoint: () => void;
  clearPath: () => void;
  cancelDraft: () => void;
  editCommand: () => void;
  cancelCommand: () => void;
}

interface PlanningControlsProps {
  mode: PlanningMode;
  hasCommand: boolean;
  canConfirm: boolean;
  canUndo: boolean;
  actions: PlanningControlActions;
}

type Tone = 'primary' | 'neutral' | 'danger';

function ControlButton({
  label,
  onPress,
  tone = 'neutral',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        tone === 'primary' && styles.primary,
        tone === 'danger' && styles.danger,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, tone === 'primary' && styles.primaryLabel]}>{label}</Text>
    </Pressable>
  );
}

/** Context-sensitive planning actions for the selected player. */
export function PlanningControls({
  mode,
  hasCommand,
  canConfirm,
  canUndo,
  actions,
}: PlanningControlsProps) {
  if (mode === 'previewing_path') {
    return (
      <View style={styles.row}>
        <ControlButton label="Undo point" onPress={actions.undoPoint} disabled={!canUndo} />
        <ControlButton label="Clear" onPress={actions.clearPath} />
        <ControlButton label="Cancel" onPress={actions.cancelDraft} tone="danger" />
        <ControlButton
          label="Confirm"
          onPress={actions.confirm}
          tone="primary"
          disabled={!canConfirm}
        />
      </View>
    );
  }
  if (mode === 'player_selected' && hasCommand) {
    return (
      <View style={styles.row}>
        <ControlButton label="Edit command" onPress={actions.editCommand} />
        <ControlButton label="Cancel command" onPress={actions.cancelCommand} tone="danger" />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    minWidth: 64,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primary: {
    backgroundColor: colors.path,
    borderColor: colors.path,
  },
  danger: {
    borderColor: colors.danger,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.35,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  primaryLabel: {
    color: '#04212B',
  },
});
