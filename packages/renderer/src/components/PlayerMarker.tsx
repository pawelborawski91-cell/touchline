import { BlurMask, Circle, Group, Path, Skia, Text, type SkFont } from '@shopify/react-native-skia';
import type { MatchPlayer } from '@touchline/shared';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { PLAYER_MARKER_RADIUS } from '../interaction/hitTest';
import type { MarkerKit } from '../theme/palette';
import { palette } from '../theme/palette';

const OUTLINE_WIDTH = 1.5;
const INDICATOR_LENGTH = 6;
const INDICATOR_HALF_WIDTH = 4.5;

/** Facing indicator pointing along +x; rotated by the player's facing angle when drawn. */
function buildIndicatorPath() {
  return Skia.PathBuilder.Make()
    .moveTo(PLAYER_MARKER_RADIUS + INDICATOR_LENGTH, 0)
    .lineTo(PLAYER_MARKER_RADIUS + 0.5, -INDICATOR_HALF_WIDTH)
    .lineTo(PLAYER_MARKER_RADIUS + 0.5, INDICATOR_HALF_WIDTH)
    .close()
    .detach();
}

interface PlayerMarkerProps {
  player: MatchPlayer;
  kit: MarkerKit;
  font: SkFont | null;
  /** 1 / camera scale; cancels the world zoom so the marker keeps its screen size. */
  inverseScale: SharedValue<number>;
}

/** Circular player marker anchored at the player's world position. */
export function PlayerMarker({ player, kit, font, inverseScale }: PlayerMarkerProps) {
  const { x, y } = player.position;
  const transform = useDerivedValue(() => [
    { translateX: x },
    { translateY: y },
    { scale: inverseScale.value },
  ]);

  const indicatorPath = useMemo(buildIndicatorPath, []);
  const label = String(player.shirtNumber);
  const labelOrigin = useMemo(() => {
    if (!font) return null;
    const bounds = font.measureText(label);
    return { x: -bounds.width / 2 - bounds.x, y: -(bounds.y + bounds.height / 2) };
  }, [font, label]);

  const fill = player.role === 'GK' ? kit.goalkeeperFill : kit.fill;

  return (
    <Group transform={transform}>
      <Circle cx={1.5} cy={2.5} r={PLAYER_MARKER_RADIUS} color={palette.shadow}>
        <BlurMask blur={2.5} style="normal" />
      </Circle>
      <Group transform={[{ rotate: player.facing }]}>
        <Path path={indicatorPath} color={kit.indicator} />
      </Group>
      <Circle cx={0} cy={0} r={PLAYER_MARKER_RADIUS} color={fill} />
      <Circle
        cx={0}
        cy={0}
        r={PLAYER_MARKER_RADIUS - OUTLINE_WIDTH / 2}
        style="stroke"
        strokeWidth={OUTLINE_WIDTH}
        color={kit.outline}
      />
      {font && labelOrigin && (
        <Text x={labelOrigin.x} y={labelOrigin.y} text={label} font={font} color={kit.number} />
      )}
    </Group>
  );
}
