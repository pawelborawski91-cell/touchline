import { BlurMask, Circle, Group, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import type { BallState } from '@touchline/shared';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import {
  ballLiftPx,
  ballTrail,
  projectBall,
  readBallFrame,
  type BallFrameValues,
} from '../ball/ballProjection';
import { palette } from '../theme/palette';

/** Ball radius in screen pixels; constant at every zoom level. */
export const BALL_MARKER_RADIUS = 5.5;

const GRAVITY = 9.81;
const TRAIL_WIDTH_PX = 3;

interface BallMarkerProps {
  /** Snapshot ball; drawn when no live frame is available. */
  ball: BallState;
  /** 1 / camera scale; cancels the world zoom so the ball keeps its screen size. */
  inverseScale: SharedValue<number>;
  /** Live render frame holding the ball at `frameOffset` (see `ballFrameOffset`). */
  frame?: SharedValue<readonly number[]>;
  frameOffset?: number;
  /** Fading streak behind a fast ball. */
  showTrail?: boolean;
}

/**
 * The ball at its true simulated position, independent of any player marker: a shadow on the
 * grass at the ground position, and the ball raised up the screen by its height with a thin stalk
 * joining the two once it is off the ground.
 */
export function BallMarker({
  ball,
  inverseScale,
  frame,
  frameOffset = -1,
  showTrail = true,
}: BallMarkerProps) {
  const { radius } = ball;
  const fallback: BallFrameValues = {
    x: ball.position.x,
    y: ball.position.y,
    z: ball.position.z,
    vx: ball.velocity.x,
    vy: ball.velocity.y,
    vz: ball.velocity.z,
  };
  const live = useDerivedValue(() => readBallFrame(frame?.value, frameOffset) ?? fallback);
  const projection = useDerivedValue(() => projectBall(live.value.z, radius));

  const groundTransform = useDerivedValue(() => [
    { translateX: live.value.x },
    { translateY: live.value.y },
    { scale: inverseScale.value },
  ]);
  const shadowTransform = useDerivedValue(() => [{ scale: projection.value.shadowScale }]);
  const shadowOpacity = useDerivedValue(() => projection.value.shadowOpacity);
  const stalkEnd = useDerivedValue(() => vec(0, -projection.value.liftPx));
  const stalkOpacity = useDerivedValue(() => (projection.value.showStalk ? 0.55 : 0));
  const ballTransform = useDerivedValue(() => [
    { translateY: -projection.value.liftPx },
    { scale: projection.value.ballScale },
  ]);

  const trail = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    if (!showTrail) return builder.detach();
    const points = ballTrail(live.value, radius, GRAVITY);
    const unit = inverseScale.value;
    points.forEach((point, i) => {
      const y = point.y - ballLiftPx(point.height) * unit;
      if (i === 0) builder.moveTo(point.x, y);
      else builder.lineTo(point.x, y);
    });
    return builder.detach();
  });
  const trailWidth = useDerivedValue(() => TRAIL_WIDTH_PX * inverseScale.value);

  return (
    <Group>
      <Path
        path={trail}
        style="stroke"
        strokeWidth={trailWidth}
        strokeCap="round"
        strokeJoin="round"
        color={palette.ballTrail}
      />
      <Group transform={groundTransform}>
        <Group transform={shadowTransform} opacity={shadowOpacity}>
          <Circle cx={0.8} cy={1.2} r={BALL_MARKER_RADIUS} color={palette.shadow}>
            <BlurMask blur={2} style="normal" />
          </Circle>
        </Group>
        <Line
          p1={vec(0, 0)}
          p2={stalkEnd}
          strokeWidth={1.25}
          color={palette.ballOutline}
          opacity={stalkOpacity}
        />
        <Group transform={ballTransform}>
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
      </Group>
    </Group>
  );
}
