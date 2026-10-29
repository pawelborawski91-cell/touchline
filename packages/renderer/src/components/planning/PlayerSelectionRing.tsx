import { BlurMask, Circle, Group } from '@shopify/react-native-skia';
import type { Vector2 } from '@touchline/shared';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { PLAYER_MARKER_RADIUS } from '../../interaction/hitTest';

const RING_GAP = 4.5;
const RING_COLOR = '#8FE6FF';

interface PlayerSelectionRingProps {
  /** World position of the selected player. */
  position: Vector2;
  inverseScale: SharedValue<number>;
}

/** Subtle ring around the selected marker; constant screen size like the marker itself. */
export function PlayerSelectionRing({ position, inverseScale }: PlayerSelectionRingProps) {
  const { x, y } = position;
  const transform = useDerivedValue(() => [
    { translateX: x },
    { translateY: y },
    { scale: inverseScale.value },
  ]);
  const radius = PLAYER_MARKER_RADIUS + RING_GAP;

  return (
    <Group transform={transform}>
      <Circle
        cx={0}
        cy={0}
        r={radius}
        style="stroke"
        strokeWidth={6}
        color="rgba(92, 225, 255, 0.35)"
      >
        <BlurMask blur={3} style="normal" />
      </Circle>
      <Circle cx={0} cy={0} r={radius} color="rgba(92, 225, 255, 0.12)" />
      <Circle cx={0} cy={0} r={radius} style="stroke" strokeWidth={2} color={RING_COLOR} />
    </Group>
  );
}
