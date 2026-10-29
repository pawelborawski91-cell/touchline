import type { PlayerCommand } from '@touchline/planning';
import {
  LiveMovementPath,
  MovementPath,
  PlayerSelectionRing,
  type WorldLayerContext,
} from '@touchline/renderer';
import type { MatchPlayer, Vector2 } from '@touchline/shared';
import type { SharedValue } from 'react-native-reanimated';

interface PlanningLayerProps {
  context: WorldLayerContext;
  commands: readonly PlayerCommand[];
  selectedPlayer: MatchPlayer | null;
  preview: PlayerCommand | null;
  livePoints: SharedValue<Vector2[]>;
}

/**
 * World-space planning visuals drawn under the markers: queued commands (subdued), the selected
 * player's command, the draft preview, the live stroke, and the selection ring.
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
      {commands.map((command) => (
        <MovementPath
          key={command.id}
          points={command.path}
          variant={command.playerId === selectedPlayer?.id && !preview ? 'selected' : 'queued'}
          inverseScale={inverseScale}
        />
      ))}
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
