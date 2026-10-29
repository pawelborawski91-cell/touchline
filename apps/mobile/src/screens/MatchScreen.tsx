import {
  canConfirmDraft,
  canStartDrawing,
  getMovementCommand,
  MOVEMENT_MODES,
  DEFAULT_MOVEMENT_MODE,
  type PlanningMode,
} from '@touchline/planning';
import { MatchView, useCameraController, type WorldLayerContext } from '@touchline/renderer';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { DebugOverlay } from '../components/DebugOverlay';
import { ExecutionBar } from '../components/ExecutionBar';
import { MatchInfoBar } from '../components/MatchInfoBar';
import { PlanningControls, type PlanningControlActions } from '../components/PlanningControls';
import { PlanningLayer } from '../components/PlanningLayer';
import { PlayerInfoPanel } from '../components/PlayerInfoPanel';
import { useEngineTicker, useMatchEngine } from '../hooks/useMatchEngine';
import { usePlanningGestures } from '../hooks/usePlanningGestures';
import { usePlanningStore } from '../stores/planningStore';
import { colors } from '../theme/colors';

const BOTTOM_STRIP_HEIGHT = 44;

export function MatchScreen() {
  const camera = useCameraController();
  const { engine, view, playerFrame } = useMatchEngine();
  const { snapshot, commands: book } = view;
  const isPlanning = view.phase === 'planning';
  const [debugVisible, setDebugVisible] = useState(false);

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
    () =>
      isPlanning
        ? (snapshot.players.find((player) => player.id === planning.selectedPlayerId) ?? null)
        : null,
    [isPlanning, planning.selectedPlayerId, snapshot.players],
  );
  const drawAnchor = canStartDrawing(planning) && selectedPlayer ? selectedPlayer.position : null;
  const { gesture, livePoints } = usePlanningGestures(snapshot, camera, drawAnchor, isPlanning);

  const selectedCommand = selectedPlayer ? getMovementCommand(book, selectedPlayer.id) : undefined;
  const movementMode = planning.activeCommandPreview?.movementMode ?? DEFAULT_MOVEMENT_MODE;

  const actions = useMemo<PlanningControlActions>(
    () => ({
      confirm: () => {
        const state = usePlanningStore.getState();
        const { activeCommandPreview, selectedPlayerId } = state;
        if (!activeCommandPreview || !selectedPlayerId || !canConfirmDraft(state)) return;
        engine.dispatchCommand({
          type: 'replaceMovement',
          playerId: selectedPlayerId,
          path: activeCommandPreview.path,
          movementMode: activeCommandPreview.movementMode,
          createdAtTick: engine.getState().tick,
        });
        dispatch({ type: 'confirmed' });
      },
      undoPoint: () => dispatch({ type: 'undoPoint' }),
      clearPath: () => dispatch({ type: 'clearPath' }),
      cancelDraft: () => dispatch({ type: 'cancelDraft' }),
      cycleMovementMode: () => {
        const current =
          usePlanningStore.getState().activeCommandPreview?.movementMode ?? DEFAULT_MOVEMENT_MODE;
        const next = MOVEMENT_MODES[(MOVEMENT_MODES.indexOf(current) + 1) % MOVEMENT_MODES.length]!;
        dispatch({ type: 'setMovementMode', mode: next });
      },
      editCommand: () => {
        if (selectedCommand) dispatch({ type: 'editCommand', command: selectedCommand });
      },
      cancelCommand: () => {
        if (selectedCommand)
          engine.dispatchCommand({ type: 'cancel', commandId: selectedCommand.id });
      },
      startExecution: () => {
        usePlanningStore.getState().reset();
        engine.startExecution();
      },
    }),
    [dispatch, engine, selectedCommand],
  );

  const nextTurn = useCallback(() => {
    engine.nextTurn();
  }, [engine]);

  const renderUnderlay = useCallback(
    (context: WorldLayerContext) => (
      <PlanningLayer
        context={context}
        commands={book.commands}
        selectedPlayer={selectedPlayer}
        preview={planning.activeCommandPreview}
        livePoints={livePoints}
      />
    ),
    [book.commands, livePoints, planning.activeCommandPreview, selectedPlayer],
  );

  const hint = planning.notice ?? hintFor(planning.planningMode, Boolean(selectedCommand));

  return (
    <View style={styles.container}>
      <LiveInfoBar
        engine={engine}
        view={view}
        debugVisible={debugVisible}
        onToggleDebug={() => setDebugVisible((visible) => !visible)}
      />
      <View style={styles.pitch}>
        <MatchView
          snapshot={snapshot}
          camera={camera}
          gesture={gesture}
          renderUnderlay={renderUnderlay}
          playerFrame={playerFrame}
          style={styles.pitchView}
        />
        {debugVisible && <DebugOverlay engine={engine} view={view} />}
      </View>
      <View style={styles.bottomStrip}>
        {isPlanning ? (
          <>
            {selectedPlayer ? (
              <PlayerInfoPanel
                snapshot={snapshot}
                player={selectedPlayer}
                command={selectedCommand}
                mode={planning.planningMode}
                editing={planning.editingCommandId !== null}
              />
            ) : (
              <Text style={styles.status}>TURN {view.turn} · PLANNING</Text>
            )}
            <Text style={[styles.hint, planning.notice && styles.notice]} numberOfLines={1}>
              {hint}
            </Text>
            <PlanningControls
              mode={planning.planningMode}
              hasCommand={Boolean(selectedCommand)}
              canEdit={selectedCommand?.status === 'queued'}
              canConfirm={canConfirmDraft(planning)}
              canUndo={planning.currentDraftPath.length > 2}
              movementMode={movementMode}
              actions={actions}
            />
          </>
        ) : (
          <ExecutionBar engine={engine} view={view} onNextTurn={nextTurn} />
        )}
      </View>
    </View>
  );
}

/** Header with the live match clock; re-renders at the ticker rate, not every frame. */
function LiveInfoBar({
  engine,
  view,
  debugVisible,
  onToggleDebug,
}: {
  engine: ReturnType<typeof useMatchEngine>['engine'];
  view: ReturnType<typeof useMatchEngine>['view'];
  debugVisible: boolean;
  onToggleDebug: () => void;
}) {
  const info = useEngineTicker(engine, view);
  return (
    <MatchInfoBar
      snapshot={view.snapshot}
      clockSeconds={info.tick * engine.config.match.fixedDeltaTime}
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle debug overlay"
          onPress={onToggleDebug}
          hitSlop={8}
          style={[styles.debugToggle, debugVisible && styles.debugToggleOn]}
        >
          <Text style={[styles.debugLabel, debugVisible && styles.debugLabelOn]}>DBG</Text>
        </Pressable>
      }
    />
  );
}

function hintFor(mode: PlanningMode, hasCommand: boolean): string {
  switch (mode) {
    case 'idle':
      return 'Tap a player to select';
    case 'player_selected':
      return hasCommand ? 'Drag from the player to redraw' : 'Drag from the player to draw';
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
    overflow: 'hidden',
  },
  pitchView: {
    flex: 1,
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
  debugToggle: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  debugToggleOn: {
    borderColor: colors.accent,
  },
  debugLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  debugLabelOn: {
    color: colors.accent,
  },
});
