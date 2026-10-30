import type { PlannedKick } from '@touchline/match-engine';
import type { PlayerCommand } from '@touchline/planning';
import {
  LiveMovementPath,
  MovementPath,
  PlannedKickLine,
  PlayerSelectionRing,
  RemainingMovementPath,
  type MovementPathVariant,
  type WorldLayerContext,
} from '@touchline/renderer';
import type { MatchPlayer, Vector2 } from '@touchline/shared';
import type { SharedValue } from 'react-native-reanimated';

interface PlanningLayerProps {
  context: WorldLayerContext;
  commands: readonly PlayerCommand[];
  selectedPlayer: MatchPlayer | null;
  preview: PlayerCommand | null;
  /** Queued command whose path is being redrawn; its stored path is hidden meanwhile. */
  editingCommandId: string | null;
  livePoints: SharedValue<Vector2[]>;
  /** Live player frame (positions and current waypoint indices). */
  frame: SharedValue<readonly number[]>;
  frameIndexOf: ReadonlyMap<string, number>;
  /** Also draws cancelled and interrupted commands. */
  debugVisible: boolean;
  plannedKicks: Readonly<Record<string, PlannedKick>>;
  players: readonly MatchPlayer[];
}

function variantFor(
  command: PlayerCommand,
  selectedPlayerId: string | undefined,
  debugVisible: boolean,
): MovementPathVariant | null {
  switch (command.status) {
    case 'active':
      return 'active';
    case 'paused':
      return 'paused';
    case 'queued':
      return command.playerId === selectedPlayerId ? 'selected' : 'queued';
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'interrupted':
      return debugVisible ? 'cancelled' : null;
    default:
      return null;
  }
}

/**
 * World-space command visuals drawn under the markers. Running and paused commands show only
 * the route still ahead of the player (following the live frame) with the current waypoint;
 * queued commands show their whole path; completed ones a faint trace. Cancelled and
 * interrupted commands appear only in debug mode. Kick orders are dashed lines to their targets.
 */
export function PlanningLayer({
  context,
  commands,
  selectedPlayer,
  preview,
  editingCommandId,
  livePoints,
  frame,
  frameIndexOf,
  debugVisible,
  plannedKicks,
  players,
}: PlanningLayerProps) {
  const { inverseScale } = context;
  const ordered = [...commands].sort((a, b) => drawOrder(a) - drawOrder(b));
  return (
    <>
      {ordered.map((command) => {
        if (command.id === editingCommandId) return null;
        const variant = variantFor(command, selectedPlayer?.id, debugVisible);
        if (!variant) return null;
        if (command.status === 'active' || command.status === 'paused') {
          return (
            <RemainingMovementPath
              key={command.id}
              points={command.path}
              variant={variant}
              inverseScale={inverseScale}
              frame={frame}
              frameIndex={frameIndexOf.get(command.playerId) ?? -1}
            />
          );
        }
        return (
          <MovementPath
            key={command.id}
            points={command.path}
            variant={variant}
            inverseScale={inverseScale}
          />
        );
      })}
      {preview && (
        <MovementPath points={preview.path} variant="draft" inverseScale={inverseScale} />
      )}
      <LiveMovementPath points={livePoints} inverseScale={inverseScale} />
      {Object.values(plannedKicks).map((kick) => {
        const kicker = players.find((p) => p.id === kick.playerId);
        if (!kicker) return null;
        return (
          <PlannedKickLine
            key={kick.playerId}
            type={kick.type}
            from={kicker.position}
            target={kick.target}
            inverseScale={inverseScale}
            frame={frame}
            frameIndex={frameIndexOf.get(kick.playerId) ?? -1}
            emphasized={kick.playerId === selectedPlayer?.id}
          />
        );
      })}
      {selectedPlayer && (
        <PlayerSelectionRing
          position={selectedPlayer.position}
          inverseScale={inverseScale}
          frame={frame}
          frameIndex={frameIndexOf.get(selectedPlayer.id) ?? -1}
        />
      )}
    </>
  );
}

/** Faint traces first, so live routes are never hidden under them. */
function drawOrder(command: PlayerCommand): number {
  switch (command.status) {
    case 'cancelled':
    case 'interrupted':
      return 0;
    case 'completed':
      return 1;
    case 'queued':
      return 2;
    default:
      return 3;
  }
}
