import { Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { FIELD_LENGTH, FIELD_WIDTH, GOAL_DEPTH, GOAL_WIDTH } from '@touchline/shared';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { palette } from '../theme/palette';

const NET_MESH_METRES = 0.4;

export type GoalEnd = 'left' | 'right';

interface GoalPaths {
  frame: SkPath;
  net: SkPath;
}

function buildGoalPaths(end: GoalEnd): GoalPaths {
  const top = FIELD_WIDTH / 2 - GOAL_WIDTH / 2;
  const bottom = top + GOAL_WIDTH;
  const lineX = end === 'left' ? 0 : FIELD_LENGTH;
  const backX = end === 'left' ? -GOAL_DEPTH : FIELD_LENGTH + GOAL_DEPTH;

  // Posts and crossbar seen from above: open on the goal line, closed at the back.
  const frame = Skia.PathBuilder.Make()
    .moveTo(lineX, top)
    .lineTo(backX, top)
    .lineTo(backX, bottom)
    .lineTo(lineX, bottom)
    .detach();

  const net = Skia.PathBuilder.Make();
  const minX = Math.min(lineX, backX);
  const maxX = Math.max(lineX, backX);
  for (let x = minX + NET_MESH_METRES; x < maxX - 1e-6; x += NET_MESH_METRES) {
    net.moveTo(x, top).lineTo(x, bottom);
  }
  for (let y = top + NET_MESH_METRES; y < bottom - 1e-6; y += NET_MESH_METRES) {
    net.moveTo(minX, y).lineTo(maxX, y);
  }

  return { frame, net: net.detach() };
}

interface GoalProps {
  end: GoalEnd;
  /** Pitch-marking stroke width in metres; the frame and net are scaled from it. */
  lineWidth: SharedValue<number>;
}

/** Goal frame and net, drawn in world metres behind the goal line. */
export function Goal({ end, lineWidth }: GoalProps) {
  const paths = useMemo(() => buildGoalPaths(end), [end]);
  const frameWidth = useDerivedValue(() => lineWidth.value * 1.5);
  const netWidth = useDerivedValue(() => lineWidth.value * 0.45);

  return (
    <Group>
      <Path path={paths.net} style="stroke" strokeWidth={netWidth} color={palette.goalNet} />
      <Path
        path={paths.frame}
        style="stroke"
        strokeWidth={frameWidth}
        strokeJoin="round"
        strokeCap="round"
        color={palette.goalFrame}
      />
    </Group>
  );
}
