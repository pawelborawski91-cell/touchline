import type { PlayerCommand } from '@touchline/planning';
import {
  LiveMovementPath,
  MovementPath,
  PlayerSelectionRing,
  type MovementPathVariant,
  type WorldLayerContext,
} from '@touchline/renderer';
import type { MatchPlayer, Vector2 } from '@touchline/shared';
import type { SharedValue } from 'react-native-reanimated';

interface PlanningLayerProps {
  context: WorldLayerContext;
  /** Commands to draw; drafts, cancelled and interrupted commands are skipped. */
  commands: readonly PlayerCommand[];
  selectedPlayer: MatchPlayer | null;
  preview: PlayerCommand | null;
  livePoints: SharedValue<Vector2[]>;
}

function variantFor(
  command: PlayerCommand,
  selectedPlayerId: string | undefined,
  hasPreview: boolean,
): MovementPathVariant | null {
  switch (command.status) {
    case 'active':
      return 'active';
    case 'completed':
      return 'completed';
    case 'queued':
    case 'paused':
      return command.playerId === selectedPlayerId && !hasPreview ? 'selected' : 'queued';
    default:
      return null;
  }
}

/**
 * World-space command visuals drawn under the markers: completed paths (faint), queued and
 * paused commands (subdued), active paths (bright), the selected player's command, the draft
 * preview, the live stroke, and the selection ring.
 */
export function PlanningLayer({
  context,
  commands,
  selectedPlayer,
  preview,
  livePoints,
}: PlanningLayerProps) {
  const { inverseScale } = context;
  return (
    <>
      {commands.map((command) => {
        const variant = variantFor(command, selectedPlayer?.id, preview !== null);
        if (!variant) return null;
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
      {selectedPlayer && (
        <PlayerSelectionRing position={selectedPlayer.position} inverseScale={inverseScale} />
      )}
    </>
  );
}
