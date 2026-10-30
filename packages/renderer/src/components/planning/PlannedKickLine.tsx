import { Circle, DashPathEffect, Group, Path, Skia } from '@shopify/react-native-skia';
import { PLAYER_FRAME_STRIDE, type KickType, type Vector2 } from '@touchline/shared';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { PATH_OUTLINE_COLOR } from './pathStyles';

/** Colour of a planned kick per type. */
export const KICK_COLORS: Readonly<Record<KickType, string>> = {
  pass: '#5CF2B0',
  shot: '#FF6B6B',
  clearance: '#FFB347',
  lob: '#C79BFF',
};

interface PlannedKickLineProps {
  type: KickType;
  /** Kicker's position when no live frame is available. */
  from: Vector2;
  target: Vector2;
  inverseScale: SharedValue<number>;
  frame?: SharedValue<readonly number[]>;
  /** Kicker's index in the frame; the line starts at the kicker as they move. */
  frameIndex?: number;
  /** Brighter and thicker for the selected player's kick. */
  emphasized?: boolean;
}

/** A kick order: a dashed line from the kicker to the target and a target ring. */
export function PlannedKickLine({
  type,
  from,
  target,
  inverseScale,
  frame,
  frameIndex = -1,
  emphasized = false,
}: PlannedKickLineProps) {
  const color = KICK_COLORS[type];
  const line = useDerivedValue(() => {
    const values = frame?.value;
    const base = frameIndex * PLAYER_FRAME_STRIDE;
    const live = values !== undefined && frameIndex >= 0 && values.length > base + 1;
    const x = live ? values[base]! : from.x;
    const y = live ? values[base + 1]! : from.y;
    return Skia.PathBuilder.Make().moveTo(x, y).lineTo(target.x, target.y).detach();
  }, [from, target, frameIndex]);
  const width = useDerivedValue(() => (emphasized ? 3 : 2) * inverseScale.value);
  const outline = useDerivedValue(() => ((emphasized ? 3 : 2) + 2.5) * inverseScale.value);
  const dash = useDerivedValue(() => [9 * inverseScale.value, 6 * inverseScale.value]);
  const ring = useDerivedValue(() => (emphasized ? 9 : 7) * inverseScale.value);
  const dot = useDerivedValue(() => 2.5 * inverseScale.value);
  const ringStroke = useDerivedValue(() => 2 * inverseScale.value);

  return (
    <Group opacity={emphasized ? 1 : 0.8}>
      <Path path={line} style="stroke" strokeWidth={outline} color={PATH_OUTLINE_COLOR}>
        <DashPathEffect intervals={dash} />
      </Path>
      <Path path={line} style="stroke" strokeWidth={width} strokeCap="round" color={color}>
        <DashPathEffect intervals={dash} />
      </Path>
      <Circle
        cx={target.x}
        cy={target.y}
        r={ring}
        style="stroke"
        strokeWidth={ringStroke}
        color={color}
      />
      <Circle cx={target.x} cy={target.y} r={dot} color={color} />
    </Group>
  );
}
