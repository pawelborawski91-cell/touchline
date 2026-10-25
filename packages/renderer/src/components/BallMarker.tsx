import { BlurMask, Circle, Group } from '@shopify/react-native-skia';
import type { BallState } from '@touchline/shared';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { palette } from '../theme/palette';

/** Ball radius in screen pixels; constant at every zoom level. */
export const BALL_MARKER_RADIUS = 5.5;

interface BallMarkerProps {
  ball: BallState;
  /** 1 / camera scale; cancels the world zoom so the ball keeps its screen size. */
  inverseScale: SharedValue<number>;
}

export function BallMarker({ ball, inverseScale }: BallMarkerProps) {
  const { x, y } = ball.position;
  const transform = useDerivedValue(() => [
    { translateX: x },
    { translateY: y },
    { scale: inverseScale.value },
  ]);

  return (
    <Group transform={transform}>
      <Circle cx={1.2} cy={2} r={BALL_MARKER_RADIUS} color={palette.shadow}>
        <BlurMask blur={2} style="normal" />
      </Circle>
      <Circle cx={0} cy={0} r={BALL_MARKER_RADIUS} color={palette.ball} />
      <Circle
        cx={0}
        cy={0}
        r={BALL_MARKER_RADIUS - 0.5}
        style="stroke"
        strokeWidth={1}
        color={palette.ballOutline}
      />
      <Circle cx={0} cy={0} r={1.6} color={palette.ballOutline} />
    </Group>
  );
}
