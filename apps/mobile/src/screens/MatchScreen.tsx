import {
  canConfirmDraft,
  canStartDrawing,
  getLiveMovementCommands,
  getMovementCommand,
  type PlanningMode,
} from '@touchline/planning';
import { MatchView, useCameraController, type WorldLayerContext } from '@touchline/renderer';
import { createInitialMatch } from '@touchline/shared';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { MatchInfoBar } from '../components/MatchInfoBar';
import { PlanningControls, type PlanningControlActions } from '../components/PlanningControls';
import { PlanningLayer } from '../components/PlanningLayer';
import { PlayerInfoPanel } from '../components/PlayerInfoPanel';
import { useCommandBook } from '../hooks/useCommandBook';
import { usePlanningGestures } from '../hooks/usePlanningGestures';
import { usePlanningStore } from '../stores/planningStore';
import { colors } from '../theme/colors';

const BOTTOM_STRIP_HEIGHT = 44;

export function MatchScreen() {
  const snapshot = useMemo(createInitialMatch, []);
  const camera = useCameraController();
  const [book, dispatchCommand] = useCommandBook();

  const planning = usePlanningStore(
    useShallow((state) => ({
      selectedPlayerId: state.selectedPlayerId,
      planningMode: state.planningMode,
      currentDraftPath: state.currentDraftPath,
      isDrawing: state.isDrawing,
      activeCommandPreview: state.activeCommandPreview,
      editingCommandId: state.editingCommandId,
      notice: state.notice,
    })),
  );
  const dispatch = usePlanningStore((state) => state.dispatch);

  const selectedPlayer = useMemo(
    () => snapshot.players.find((player) => player.id === planning.selectedPlayerId) ?? null,
    [planning.selectedPlayerId, snapshot.players],
  );
  const drawAnchor = canStartDrawing(planning) && selectedPlayer ? selectedPlayer.position : null;
  const { gesture, livePoints } = usePlanningGestures(snapshot, camera, drawAnchor);

  const liveCommands = useMemo(() => getLiveMovementCommands(book), [book]);
  const selectedCommand = selectedPlayer ? getMovementCommand(book, selectedPlayer.id) : undefined;

  const actions = useMemo<PlanningControlActions>(
    () => ({
      confirm: () => {
        const { activeCommandPreview, selectedPlayerId } = usePlanningStore.getState();
        if (!activeCommandPreview || !selectedPlayerId) return;
        if (!canConfirmDraft(usePlanningStore.getState())) return;
        dispatchCommand({
          type: 'replaceMovement',
          playerId: selectedPlayerId,
          path: activeCommandPreview.path,
        });
        dispatch({ type: 'confirmed' });
      },
      undoPoint: () => dispatch({ type: 'undoPoint' }),
      clearPath: () => dispatch({ type: 'clearPath' }),
      cancelDraft: () => dispatch({ type: 'cancelDraft' }),
      editCommand: () => {
        if (selectedCommand) dispatch({ type: 'editCommand', command: selectedCommand });
      },
      cancelCommand: () => {
        if (selectedCommand) dispatchCommand({ type: 'cancel', commandId: selectedCommand.id });
      },
    }),
    [dispatch, dispatchCommand, selectedCommand],
  );

  const renderUnderlay = useCallback(
    (context: WorldLayerContext) => (
      <PlanningLayer
        context={context}
        commands={liveCommands}
        selectedPlayer={selectedPlayer}
        preview={planning.activeCommandPreview}
        livePoints={livePoints}
      />
    ),
    [liveCommands, livePoints, planning.activeCommandPreview, selectedPlayer],
  );

  const hint = planning.notice ?? hintFor(planning.planningMode, Boolean(selectedCommand));

  return (
    <View style={styles.container}>
      <MatchInfoBar snapshot={snapshot} />
      <MatchView
        snapshot={snapshot}
        camera={camera}
        gesture={gesture}
        renderUnderlay={renderUnderlay}
        style={styles.pitch}
      />
      <View style={styles.bottomStrip}>
        {selectedPlayer ? (
          <PlayerInfoPanel
            snapshot={snapshot}
            player={selectedPlayer}
            command={selectedCommand}
            mode={planning.planningMode}
            editing={planning.editingCommandId !== null}
          />
        ) : (
          <Text style={styles.status}>MATCH VIEW — PLANNING PROTOTYPE</Text>
        )}
        <Text style={[styles.hint, planning.notice && styles.notice]} numberOfLines={1}>
          {hint}
        </Text>
        <PlanningControls
          mode={planning.planningMode}
          hasCommand={Boolean(selectedCommand)}
          canConfirm={canConfirmDraft(planning)}
          canUndo={planning.currentDraftPath.length > 2}
          actions={actions}
        />
      </View>
    </View>
  );
}

function hintFor(mode: PlanningMode, hasCommand: boolean): string {
  switch (mode) {
    case 'idle':
      return 'Tap a player to select';
    case 'player_selected':
      return hasCommand ? 'Drag from the player to redraw' : 'Drag from the player to draw a path';
    case 'drawing_path':
      return 'Release to preview';
    default:
      return 'Drag to redraw';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 44,
    paddingTop: 8,
    paddingBottom: 6,
  },
  pitch: {
    flex: 1,
    borderRadius: 10,
  },
  bottomStrip: {
    height: BOTTOM_STRIP_HEIGHT,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  status: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
  },
  hint: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  notice: {
    color: colors.danger,
  },
});
