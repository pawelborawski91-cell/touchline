import type {
  BallDebugInfo,
  EngineAIDebugInfo,
  EngineView,
  MatchEngine,
  PlayerDebugInfo,
} from '@touchline/match-engine';
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

const short = (id: string | null) => (id ? id.replace(/^.*-(\d+)$/, '#$1') : '-');
const v3 = ({ x, y, z }: { x: number; y: number; z: number }) =>
  `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`;

function describeEvent(event: BallDebugInfo['recentEvents'][number]): string {
  switch (event.type) {
    case 'touch':
      return `${event.tick} ${event.kind} ${short(event.playerId)}`;
    case 'control_gained':
      return `${event.tick} control ${short(event.playerId)}`;
    case 'control_lost':
      return `${event.tick} lost ${short(event.playerId)} (${event.reason})`;
    case 'contest':
      return `${event.tick} contest ${event.playerIds.map(short).join(' v ')}`;
    case 'kick':
      return `${event.tick} ${event.kickType} ${short(event.playerId)} ${event.speed.toFixed(1)} m/s`;
    case 'bounce':
      return `${event.tick} bounce ${event.impactSpeed.toFixed(1)} m/s`;
    case 'out_of_play':
      return `${event.tick} out of play`;
  }
}

function BallLines({ ball }: { ball: BallDebugInfo }) {
  const owner = ball.controllerPlayerId
    ? `${ball.possession} by ${short(ball.controllerPlayerId)}`
    : ball.possession;
  const lastEvents = ball.recentEvents
    .filter((event) => event.type !== 'bounce' || event.impactSpeed > 2)
    .slice(-3)
    .reverse();
  return (
    <>
      <Text style={[styles.line, styles.ball]}>
        ● pos {v3(ball.position)} · vel {v3(ball.velocity)}
      </Text>
      <Text style={[styles.line, styles.ball]}>
        h {ball.height.toFixed(2)} m · {ball.horizontalSpeed.toFixed(2)} m/s horiz ·{' '}
        {ball.verticalSpeed.toFixed(2)} m/s vert · {ball.airborne ? 'airborne' : 'ground'}
        {ball.isOutOfPlay ? ' · OUT OF PLAY' : ''}
      </Text>
      <Text style={[styles.line, styles.ball]}>
        {owner} · last touch {short(ball.lastTouchPlayerId)}
        {ball.contenderIds.length > 0
          ? ` · contest ${ball.contenderIds.map(short).join(' v ')}`
          : ''}
      </Text>
      {lastEvents.length > 0 && (
        <Text style={styles.line}>{lastEvents.map(describeEvent).join(' · ')}</Text>
      )}
    </>
  );
}

function AILines({
  ai,
  selectedPlayerId,
}: {
  ai: EngineAIDebugInfo;
  selectedPlayerId: string | null;
}) {
  const teams = ai.teams
    .map(
      (team) =>
        `${team.teamId} ${team.playState} ${team.formationId} · press ${short(team.presserId)}`,
    )
    .join(' | ');
  const player = selectedPlayerId
    ? ai.players.find((candidate) => candidate.playerId === selectedPlayerId)
    : undefined;
  const since = player ? ai.secondsSinceDecision[player.playerId] : null;
  return (
    <>
      <Text style={[styles.line, styles.ai]}>
        AI {ai.enabled ? 'on' : 'off'} · {teams}
      </Text>
      {player && (
        <Text style={[styles.line, styles.ai]}>
          ◆ {player.role} {player.controlMode} ·{' '}
          {player.controlMode === 'autonomous'
            ? `${player.behaviorId ?? 'idle'}${player.utility !== null ? ` u${player.utility.toFixed(2)}` : ''}${
                player.target
                  ? ` → ${player.target.x.toFixed(1)} ${player.target.y.toFixed(1)}`
                  : ''
              }`
            : `last ${player.behaviorId ?? 'none'}`}
          {since !== null && since !== undefined ? ` · ${since.toFixed(2)} s ago` : ''}
        </Text>
      )}
    </>
  );
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
      <BallLines ball={info.ball} />
      <AILines ai={info.ai} selectedPlayerId={selectedPlayerId} />
      {selected && (
        <Text style={[styles.line, styles.selected]}>
          ▶ #{selected.shirtNumber} {selected.role} {selected.speed.toFixed(2)} m/s ·{' '}
          {describeCommand(selected)} · st {selected.staminaCurrent.toFixed(3)}
        </Text>
      )}
      {others.slice(0, 4).map((p) => (
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
  ball: {
    color: '#FFD166',
  },
  ai: {
    color: '#C8F560',
  },
});
