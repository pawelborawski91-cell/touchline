import type { MovementMode, PlanningMode } from '@touchline/planning';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

export interface PlanningControlActions {
  confirm: () => void;
  undoPoint: () => void;
  clearPath: () => void;
  cancelDraft: () => void;
  cycleMovementMode: () => void;
  editCommand: () => void;
  cancelCommand: () => void;
  startExecution: () => void;
}

interface PlanningControlsProps {
  mode: PlanningMode;
  hasCommand: boolean;
  /** Only queued commands can be redrawn; a paused one can only be cancelled. */
  canEdit: boolean;
  canConfirm: boolean;
  canUndo: boolean;
  movementMode: MovementMode;
  actions: PlanningControlActions;
}

type Tone = 'primary' | 'neutral' | 'danger' | 'go';

export function ControlButton({
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
        tone === 'go' && styles.go,
        tone === 'danger' && styles.danger,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[styles.label, (tone === 'primary' || tone === 'go') && styles.primaryLabel]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Context-sensitive planning actions for the selected player, plus starting the turn. */
export function PlanningControls({
  mode,
  hasCommand,
  canEdit,
  canConfirm,
  canUndo,
  movementMode,
  actions,
}: PlanningControlsProps) {
  if (mode === 'previewing_path') {
    return (
      <View style={styles.row}>
        <ControlButton label="Undo" onPress={actions.undoPoint} disabled={!canUndo} />
        <ControlButton label="Clear" onPress={actions.clearPath} />
        <ControlButton label="Cancel" onPress={actions.cancelDraft} tone="danger" />
        <ControlButton
          label={`Pace: ${movementMode.toUpperCase()}`}
          onPress={actions.cycleMovementMode}
        />
        <ControlButton
          label="Confirm"
          onPress={actions.confirm}
          tone="primary"
          disabled={!canConfirm}
        />
      </View>
    );
  }
  if (mode === 'drawing_path') return null;
  return (
    <View style={styles.row}>
      {mode === 'player_selected' && hasCommand && (
        <>
          {canEdit && <ControlButton label="Edit" onPress={actions.editCommand} />}
          <ControlButton label="Cancel cmd" onPress={actions.cancelCommand} tone="danger" />
        </>
      )}
      <ControlButton label="START EXECUTION" onPress={actions.startExecution} tone="go" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    minWidth: 60,
    height: 36,
    paddingHorizontal: 12,
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
  go: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
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
