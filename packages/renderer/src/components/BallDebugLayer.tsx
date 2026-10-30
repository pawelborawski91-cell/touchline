import { Group, Path, Skia } from '@shopify/react-native-skia';
import { PLAYER_FRAME_STRIDE, type Vector3 } from '@touchline/shared';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { ballLiftPx, readBallFrame } from '../ball/ballProjection';

/** Velocity vectors are drawn as the distance covered in this many seconds. */
const VELOCITY_ARROW_SECONDS = 0.5;

const COLORS = {
  velocity: '#FFD166',
  trajectory: 'rgba(255, 209, 102, 0.7)',
  trajectoryGround: 'rgba(255, 209, 102, 0.3)',
  reach: 'rgba(92, 225, 255, 0.35)',
  body: 'rgba(255, 255, 255, 0.4)',
  ballContact: 'rgba(255, 209, 102, 0.8)',
} as const;

export interface BallContactRadii {
  /** Player reach for control and dribbling, m. */
  reach: number;
  /** Player body radius plus ball radius, m. */
  body: number;
}

interface BallDebugLayerProps {
  frame: SharedValue<readonly number[]>;
  frameOffset: number;
  playerCount: number;
  inverseScale: SharedValue<number>;
  ballRadius: number;
  showVelocity?: boolean;
  /** Predicted ball centre positions (e.g. from the ball engine), drawn as an arc and its shadow. */
  trajectory?: readonly Vector3[] | null;
  /** Reach and body circles around every player, and the ball's own radius. */
  contact?: BallContactRadii | null;
}

/** Optional ball visualisations for debugging; everything is world-space and read from the frame. */
export function BallDebugLayer({
  frame,
  frameOffset,
  playerCount,
  inverseScale,
  ballRadius,
  showVelocity = true,
  trajectory = null,
  contact = null,
}: BallDebugLayerProps) {
  const velocity = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    const ball = readBallFrame(frame.value, frameOffset);
    if (!showVelocity || !ball) return builder.detach();
    const unit = inverseScale.value;
    const fromY = ball.y - ballLiftPx(Math.max(0, ball.z - ballRadius)) * unit;
    const tx = ball.x + ball.vx * VELOCITY_ARROW_SECONDS;
    const tz = Math.max(ballRadius, ball.z + ball.vz * VELOCITY_ARROW_SECONDS);
    const ty = ball.y + ball.vy * VELOCITY_ARROW_SECONDS - ballLiftPx(tz - ballRadius) * unit;
    const dx = tx - ball.x;
    const dy = ty - fromY;
    const length = Math.hypot(dx, dy);
    if (length < 4 * unit) return builder.detach();
    builder.moveTo(ball.x, fromY).lineTo(tx, ty);
    const head = 7 * unit;
    const ux = dx / length;
    const uy = dy / length;
    builder
      .moveTo(tx - head * ux - head * 0.5 * uy, ty - head * uy + head * 0.5 * ux)
      .lineTo(tx, ty)
      .lineTo(tx - head * ux + head * 0.5 * uy, ty - head * uy - head * 0.5 * ux);
    return builder.detach();
  });

  const arc = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    if (!trajectory || trajectory.length < 2) return builder.detach();
    const unit = inverseScale.value;
    trajectory.forEach((p, i) => {
      const y = p.y - ballLiftPx(Math.max(0, p.z - ballRadius)) * unit;
      if (i === 0) builder.moveTo(p.x, y);
      else builder.lineTo(p.x, y);
    });
    return builder.detach();
  }, [trajectory]);
  const groundTrack = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    if (!trajectory || trajectory.length < 2) return builder.detach();
    trajectory.forEach((p, i) => {
      if (i === 0) builder.moveTo(p.x, p.y);
      else builder.lineTo(p.x, p.y);
    });
    return builder.detach();
  }, [trajectory]);

  const reachRings = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    const values = frame.value;
    if (!contact) return builder.detach();
    for (let i = 0; i < playerCount; i += 1) {
      const base = i * PLAYER_FRAME_STRIDE;
      if (values.length < base + 2) break;
      builder.addCircle(values[base]!, values[base + 1]!, contact.reach);
    }
    return builder.detach();
  }, [contact, playerCount]);
  const bodyRings = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    const values = frame.value;
    if (!contact) return builder.detach();
    for (let i = 0; i < playerCount; i += 1) {
      const base = i * PLAYER_FRAME_STRIDE;
      if (values.length < base + 2) break;
      builder.addCircle(values[base]!, values[base + 1]!, contact.body);
    }
    const ball = readBallFrame(values, frameOffset);
    if (ball) builder.addCircle(ball.x, ball.y, ballRadius);
    return builder.detach();
  }, [contact, playerCount]);

  const thin = useDerivedValue(() => 1.25 * inverseScale.value);
  const medium = useDerivedValue(() => 2 * inverseScale.value);

  return (
    <Group>
      <Path path={reachRings} style="stroke" strokeWidth={thin} color={COLORS.reach} />
      <Path path={bodyRings} style="stroke" strokeWidth={thin} color={COLORS.body} />
      <Path path={groundTrack} style="stroke" strokeWidth={thin} color={COLORS.trajectoryGround} />
      <Path
        path={arc}
        style="stroke"
        strokeWidth={medium}
        strokeJoin="round"
        color={COLORS.trajectory}
      />
      <Path
        path={velocity}
        style="stroke"
        strokeWidth={medium}
        strokeCap="round"
        strokeJoin="round"
        color={COLORS.velocity}
      />
    </Group>
  );
}
