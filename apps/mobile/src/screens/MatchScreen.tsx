import {
  canConfirmDraft,
  canStartDrawing,
  countCommandsByStatus,
  getMovementCommand,
  MOVEMENT_MODES,
  DEFAULT_MOVEMENT_MODE,
  type CommandBook,
  type PlanningMode,
} from '@touchline/planning';
import { BEHAVIOR_LABELS, type EngineView, type MatchEngine } from '@touchline/match-engine';
import {
  AIDebugLayer,
  BallDebugLayer,
  buildAIDebugScene,
  MatchView,
  screenToWorld,
  useCameraController,
  type WorldLayerContext,
} from '@touchline/renderer';
import {
  ballFrameOffset,
  FIELD_LENGTH,
  FIELD_WIDTH,
  KICK_TYPES,
  type KickType,
} from '@touchline/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { DebugOverlay } from '../components/DebugOverlay';
import { ExecutionBar } from '../components/ExecutionBar';
import { KICK_LABELS, KickControls, type KickControlActions } from '../components/KickControls';
import { MatchInfoBar } from '../components/MatchInfoBar';
import {
  ControlButton,
  PlanningControls,
  type PlanningControlActions,
} from '../components/PlanningControls';
import { PlanningLayer } from '../components/PlanningLayer';
import { PlayerInfoPanel } from '../components/PlayerInfoPanel';
import {
  useAIDebug,
  useBallTrajectory,
  useMatchEngine,
  useTurnSnapshot,
} from '../hooks/useMatchEngine';
import { usePlanningGestures } from '../hooks/usePlanningGestures';
import type { TapInterceptor } from '../hooks/usePlayerSelection';
import { usePlanningStore } from '../stores/planningStore';
import { colors } from '../theme/colors';

const BOTTOM_STRIP_HEIGHT = 44;
/** A dropped ball is kept this far inside the lines, m. */
const DROP_BALL_INSET = 1;

const PHASE_LABELS: Record<EngineView['phase'], string> = {
  planning: 'PLANNING',
  execution: 'EXECUTING',
  stoppage: 'STOPPAGE',
  finished: 'FINISHED',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function MatchScreen() {
  const camera = useCameraController();
  const { engine, view, playerFrame } = useMatchEngine();
  const { snapshot, commands: book } = view;
  const isPlanning = view.phase === 'planning';
  const [debugVisible, setDebugVisible] = useState(false);
  const [vizVisible, setVizVisible] = useState(false);
  const [aiVisible, setAIVisible] = useState(false);
  const [engineNotice, setEngineNotice] = useState<string | null>(null);
  /** Kick type being aimed for the selected player (the next pitch tap sets the target). */
  const [kickAim, setKickAim] = useState<KickType | null>(null);
  const aimTap = useRef<TapInterceptor | null>(null);

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

  useEffect(() => {
    setEngineNotice(null);
  }, [planning.planningMode, planning.selectedPlayerId, view.phase]);

  useEffect(() => {
    setKickAim(null);
  }, [planning.selectedPlayerId, view.phase]);

  // Selection survives execution so the ring and the readouts keep following the player.
  const selectedPlayer = useMemo(
    () => snapshot.players.find((player) => player.id === planning.selectedPlayerId) ?? null,
    [planning.selectedPlayerId, snapshot.players],
  );
  const frameIndexOf = useMemo(
    () => new Map(snapshot.players.map((player, index) => [player.id, index])),
    [snapshot.players],
  );
  const drawAnchor =
    isPlanning && canStartDrawing(planning) && selectedPlayer ? selectedPlayer.position : null;
  const { gesture, livePoints } = usePlanningGestures(
    snapshot,
    camera,
    drawAnchor,
    isPlanning,
    aimTap,
  );
  const trajectory = useBallTrajectory(engine, view, vizVisible);
  const aiInfo = useAIDebug(engine, view, aiVisible);
  const aiScene = useMemo(
    () => (aiVisible && aiInfo ? buildAIDebugScene(aiInfo, frameIndexOf, BEHAVIOR_LABELS) : null),
    [aiInfo, aiVisible, frameIndexOf],
  );

  const selectedCommand = selectedPlayer ? getMovementCommand(book, selectedPlayer.id) : undefined;
  const displayedCommand =
    selectedCommand ??
    (selectedPlayer
      ? book.commands.find(
          (command) =>
            command.playerId === selectedPlayer.id &&
            command.status === 'completed' &&
            command.endedTurn === view.turn - 1,
        )
      : undefined);
  const selectedProgress = displayedCommand
    ? (view.pathStates[displayedCommand.id]?.progress ?? null)
    : null;
  const movementMode = planning.activeCommandPreview?.movementMode ?? DEFAULT_MOVEMENT_MODE;

  const attempt = useCallback((action: () => void): boolean => {
    try {
      action();
      setEngineNotice(null);
      return true;
    } catch (error) {
      setEngineNotice(errorMessage(error));
      return false;
    }
  }, []);

  useEffect(() => {
    const playerId = planning.selectedPlayerId;
    aimTap.current =
      kickAim && playerId && isPlanning
        ? (x, y) => {
            const target = screenToWorld({ x, y }, camera.transform.value);
            attempt(() => engine.planKick({ playerId, type: kickAim, target }));
            setKickAim(null);
            return true;
          }
        : null;
  }, [attempt, camera.transform, engine, isPlanning, kickAim, planning.selectedPlayerId]);

  const hasKick = selectedPlayer ? Boolean(view.plannedKicks[selectedPlayer.id]) : false;
  const kickActions = useMemo<KickControlActions>(
    () => ({
      startAim: () => {
        const current = selectedPlayer ? view.plannedKicks[selectedPlayer.id] : undefined;
        setKickAim(current?.type ?? 'pass');
      },
      cycleType: () =>
        setKickAim(
          (type) => KICK_TYPES[(KICK_TYPES.indexOf(type ?? 'pass') + 1) % KICK_TYPES.length]!,
        ),
      cancelAim: () => setKickAim(null),
      cancelKick: () => {
        if (selectedPlayer) attempt(() => engine.cancelKick(selectedPlayer.id));
      },
    }),
    [attempt, engine, selectedPlayer, view.plannedKicks],
  );
  const dropBall = useCallback(() => {
    const { x, y } = engine.getBall().position;
    const clamp = (value: number, max: number) =>
      Math.min(Math.max(value, DROP_BALL_INSET), max - DROP_BALL_INSET);
    attempt(() => engine.placeBall({ x: clamp(x, FIELD_LENGTH), y: clamp(y, FIELD_WIDTH) }));
  }, [attempt, engine]);

  const actions = useMemo<PlanningControlActions>(
    () => ({
      confirm: () => {
        const state = usePlanningStore.getState();
        const { activeCommandPreview, selectedPlayerId } = state;
        if (!activeCommandPreview || !selectedPlayerId || !canConfirmDraft(state)) return;
        const live = getMovementCommand(engine.getState().commands, selectedPlayerId);
        const options = { movementMode: activeCommandPreview.movementMode };
        const ok = attempt(() => {
          if (live) engine.replaceCommand(live.id, activeCommandPreview.path, options);
          else engine.planMovement(selectedPlayerId, activeCommandPreview.path, options);
        });
        if (ok) dispatch({ type: 'confirmed' });
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
        if (selectedCommand?.status === 'queued') {
          dispatch({ type: 'editCommand', command: selectedCommand });
        }
      },
      cancelCommand: () => {
        if (selectedCommand) attempt(() => engine.cancelCommand(selectedCommand.id));
      },
      commitPlans: () => {
        const { planningMode } = usePlanningStore.getState();
        // An unconfirmed draft is never committed; drop it, but keep the selection.
        if (planningMode === 'previewing_path') dispatch({ type: 'cancelDraft' });
        attempt(() => engine.commitPlans());
      },
    }),
    [attempt, dispatch, engine, selectedCommand],
  );

  const renderUnderlay = useCallback(
    (context: WorldLayerContext) => (
      <PlanningLayer
        context={context}
        commands={book.commands}
        selectedPlayer={selectedPlayer}
        preview={isPlanning ? planning.activeCommandPreview : null}
        editingCommandId={isPlanning ? planning.editingCommandId : null}
        livePoints={livePoints}
        frame={playerFrame}
        frameIndexOf={frameIndexOf}
        debugVisible={debugVisible}
        plannedKicks={view.plannedKicks}
        players={snapshot.players}
      />
    ),
    [
      book.commands,
      debugVisible,
      frameIndexOf,
      isPlanning,
      livePoints,
      planning.activeCommandPreview,
      planning.editingCommandId,
      playerFrame,
      selectedPlayer,
      snapshot.players,
      view.plannedKicks,
    ],
  );

  const ballConfig = engine.config.ball;
  const contactRadii = useMemo(
    () => ({
      reach: ballConfig.controlReach,
      body: ballConfig.playerBodyRadius + ballConfig.radius,
    }),
    [ballConfig],
  );
  const playerCount = snapshot.players.length;
  const renderOverlay = useCallback(
    (context: WorldLayerContext) => (
      <>
        {aiScene && (
          <AIDebugLayer
            scene={aiScene}
            snapshot={snapshot}
            frame={playerFrame}
            inverseScale={context.inverseScale}
          />
        )}
        {vizVisible && (
          <BallDebugLayer
            frame={playerFrame}
            frameOffset={ballFrameOffset(playerCount)}
            playerCount={playerCount}
            inverseScale={context.inverseScale}
            ballRadius={ballConfig.radius}
            trajectory={trajectory}
            contact={contactRadii}
          />
        )}
      </>
    ),
    [
      aiScene,
      ballConfig.radius,
      contactRadii,
      playerCount,
      playerFrame,
      snapshot,
      trajectory,
      vizVisible,
    ],
  );

  const hint =
    engineNotice ??
    planning.notice ??
    (kickAim
      ? `Tap the pitch to aim the ${KICK_LABELS[kickAim].toLowerCase()}`
      : view.ball.isOutOfPlay
        ? 'Ball out of play — drop it to restart'
        : hintFor(planning.planningMode, selectedCommand?.status ?? null));
  const showKickControls =
    selectedPlayer !== null && (kickAim !== null || planning.planningMode === 'player_selected');

  return (
    <View style={styles.container}>
      <LiveInfoBar
        engine={engine}
        view={view}
        debugVisible={debugVisible}
        onToggleDebug={() => setDebugVisible((visible) => !visible)}
        vizVisible={vizVisible}
        onToggleViz={() => setVizVisible((visible) => !visible)}
        aiVisible={aiVisible}
        onToggleAI={() => setAIVisible((visible) => !visible)}
      />
      <View style={styles.pitch}>
        <MatchView
          snapshot={snapshot}
          camera={camera}
          gesture={gesture}
          renderUnderlay={renderUnderlay}
          renderOverlay={renderOverlay}
          playerFrame={playerFrame}
          style={styles.pitchView}
        />
        {debugVisible && (
          <DebugOverlay engine={engine} view={view} selectedPlayerId={planning.selectedPlayerId} />
        )}
      </View>
      <View style={styles.bottomStrip}>
        {isPlanning ? (
          <>
            {selectedPlayer ? (
              <PlayerInfoPanel
                snapshot={snapshot}
                player={selectedPlayer}
                command={displayedCommand}
                progress={selectedProgress}
                mode={planning.planningMode}
                editing={planning.editingCommandId !== null}
              />
            ) : (
              <TurnSummary book={book} turn={view.turn} />
            )}
            <Text
              style={[styles.hint, (engineNotice ?? planning.notice) !== null && styles.notice]}
              numberOfLines={1}
            >
              {hint}
            </Text>
            {view.ball.isOutOfPlay && !kickAim && (
              <ControlButton label="Drop ball" onPress={dropBall} tone="primary" />
            )}
            {showKickControls && (
              <KickControls aiming={kickAim} hasKick={hasKick} actions={kickActions} />
            )}
            {!kickAim && (
              <PlanningControls
                mode={planning.planningMode}
                hasCommand={Boolean(selectedCommand)}
                canEdit={selectedCommand?.status === 'queued'}
                canConfirm={canConfirmDraft(planning)}
                canUndo={planning.currentDraftPath.length > 2}
                movementMode={movementMode}
                actions={actions}
              />
            )}
          </>
        ) : (
          <ExecutionBar engine={engine} view={view} debug={debugVisible} />
        )}
      </View>
    </View>
  );
}

/** Planning summary: what carries over into this turn and what finished in the last one. */
function TurnSummary({ book, turn }: { book: CommandBook; turn: number }) {
  const counts = countCommandsByStatus(book);
  const completedLastTurn = book.commands.filter(
    (command) => command.status === 'completed' && command.endedTurn === turn - 1,
  ).length;
  const parts = [`${counts.active} active`, `${counts.queued} queued`];
  if (counts.paused > 0) parts.push(`${counts.paused} paused`);
  if (turn > 1) parts.push(`${completedLastTurn} completed last turn`);
  return <Text style={styles.summary}>{parts.join(' · ')}</Text>;
}

/** Header with the turn, phase, match clock and plan counts; re-renders once per tick. */
function LiveInfoBar({
  engine,
  view,
  debugVisible,
  onToggleDebug,
  vizVisible,
  onToggleViz,
  aiVisible,
  onToggleAI,
}: {
  engine: MatchEngine;
  view: EngineView;
  debugVisible: boolean;
  onToggleDebug: () => void;
  vizVisible: boolean;
  onToggleViz: () => void;
  aiVisible: boolean;
  onToggleAI: () => void;
}) {
  const turn = useTurnSnapshot(engine);
  const counts = countCommandsByStatus(view.commands);
  const phaseTone =
    view.phase === 'planning'
      ? colors.path
      : view.phase === 'execution' && !view.suspended
        ? colors.accent
        : colors.amber;
  return (
    <MatchInfoBar
      snapshot={view.snapshot}
      clockSeconds={turn.tick * engine.config.match.fixedDeltaTime}
      leading={
        <View style={styles.turnPill} accessibilityLabel={`Turn ${turn.turn}, ${view.phase}`}>
          <Text style={styles.turnLabel}>TURN {turn.turn}</Text>
          <Text style={[styles.phaseLabel, { color: phaseTone }]}>
            {view.suspended ? 'PAUSED' : PHASE_LABELS[view.phase]}
          </Text>
        </View>
      }
      accessory={
        <View style={styles.accessoryRow}>
          <Text style={styles.counts}>
            {counts.active} active · {counts.queued} queued
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle debug overlay"
            onPress={onToggleDebug}
            hitSlop={8}
            style={[styles.debugToggle, debugVisible && styles.debugToggleOn]}
          >
            <Text style={[styles.debugLabel, debugVisible && styles.debugLabelOn]}>DBG</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle ball visualisation"
            onPress={onToggleViz}
            hitSlop={8}
            style={[styles.debugToggle, vizVisible && styles.debugToggleOn]}
          >
            <Text style={[styles.debugLabel, vizVisible && styles.debugLabelOn]}>VIZ</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle AI visualisation"
            onPress={onToggleAI}
            hitSlop={8}
            style={[styles.debugToggle, aiVisible && styles.debugToggleOn]}
          >
            <Text style={[styles.debugLabel, aiVisible && styles.debugLabelOn]}>AI</Text>
          </Pressable>
        </View>
      }
    />
  );
}

function hintFor(mode: PlanningMode, status: string | null): string {
  switch (mode) {
    case 'idle':
      return 'Tap a player to select';
    case 'player_selected':
      if (status === 'active' || status === 'paused') return 'Drag from the player to replace';
      return status ? 'Drag from the player to redraw' : 'Drag from the player to draw';
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
  summary: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
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
  turnPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  turnLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontVariant: ['tabular-nums'],
  },
  phaseLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  accessoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  counts: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
