import { Group, Path, Rect, Skia, type SkPath } from '@shopify/react-native-skia';
import {
  CENTRE_CIRCLE_RADIUS,
  CORNER_ARC_RADIUS,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GOAL_AREA_DEPTH,
  GOAL_AREA_WIDTH,
  PENALTY_AREA_DEPTH,
  PENALTY_AREA_WIDTH,
  PENALTY_SPOT_DISTANCE,
} from '@touchline/shared';
import { useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type { WorldBounds } from '../types/renderer';
import { palette } from '../theme/palette';

const STRIPE_COUNT = 12;
const SPOT_RADIUS = 0.25;

interface PitchPaths {
  markings: SkPath;
  spots: SkPath;
}

function buildPitchPaths(): PitchPaths {
  const midX = FIELD_LENGTH / 2;
  const midY = FIELD_WIDTH / 2;
  const penaltyTop = midY - PENALTY_AREA_WIDTH / 2;
  const goalAreaTop = midY - GOAL_AREA_WIDTH / 2;
  const rightSpotX = FIELD_LENGTH - PENALTY_SPOT_DISTANCE;
  // Penalty arc: the part of the 9.15 m circle around the spot that lies outside the area.
  const arcHalfSweep =
    (Math.acos((PENALTY_AREA_DEPTH - PENALTY_SPOT_DISTANCE) / CENTRE_CIRCLE_RADIUS) * 180) /
    Math.PI;
  const oval = (cx: number, cy: number, r: number) => Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2);

  const markings = Skia.PathBuilder.Make()
    .addRect(Skia.XYWHRect(0, 0, FIELD_LENGTH, FIELD_WIDTH))
    .moveTo(midX, 0)
    .lineTo(midX, FIELD_WIDTH)
    .addCircle(midX, midY, CENTRE_CIRCLE_RADIUS)
    .addRect(Skia.XYWHRect(0, penaltyTop, PENALTY_AREA_DEPTH, PENALTY_AREA_WIDTH))
    .addRect(
      Skia.XYWHRect(
        FIELD_LENGTH - PENALTY_AREA_DEPTH,
        penaltyTop,
        PENALTY_AREA_DEPTH,
        PENALTY_AREA_WIDTH,
      ),
    )
    .addRect(Skia.XYWHRect(0, goalAreaTop, GOAL_AREA_DEPTH, GOAL_AREA_WIDTH))
    .addRect(
      Skia.XYWHRect(FIELD_LENGTH - GOAL_AREA_DEPTH, goalAreaTop, GOAL_AREA_DEPTH, GOAL_AREA_WIDTH),
    )
    .addArc(
      oval(PENALTY_SPOT_DISTANCE, midY, CENTRE_CIRCLE_RADIUS),
      -arcHalfSweep,
      arcHalfSweep * 2,
    )
    .addArc(oval(rightSpotX, midY, CENTRE_CIRCLE_RADIUS), 180 - arcHalfSweep, arcHalfSweep * 2)
    .addArc(oval(0, 0, CORNER_ARC_RADIUS), 0, 90)
    .addArc(oval(FIELD_LENGTH, 0, CORNER_ARC_RADIUS), 90, 90)
    .addArc(oval(FIELD_LENGTH, FIELD_WIDTH, CORNER_ARC_RADIUS), 180, 90)
    .addArc(oval(0, FIELD_WIDTH, CORNER_ARC_RADIUS), 270, 90)
    .detach();

  const spots = Skia.PathBuilder.Make()
    .addCircle(midX, midY, SPOT_RADIUS)
    .addCircle(PENALTY_SPOT_DISTANCE, midY, SPOT_RADIUS)
    .addCircle(rightSpotX, midY, SPOT_RADIUS)
    .detach();

  return { markings, spots };
}

interface PitchProps {
  /** Region painted as surrounding grass, in metres. */
  surround: WorldBounds;
  /** Marking stroke width in metres; animated so lines keep a readable on-screen width. */
  lineWidth: SharedValue<number>;
}

/** Grass and IFAB markings, drawn in world metres. Must be inside the camera's world group. */
export function Pitch({ surround, lineWidth }: PitchProps) {
  const paths = useMemo(buildPitchPaths, []);
  const stripeLength = FIELD_LENGTH / STRIPE_COUNT;

  return (
    <Group>
      <Rect
        x={surround.minX}
        y={surround.minY}
        width={surround.maxX - surround.minX}
        height={surround.maxY - surround.minY}
        color={palette.surround}
      />
      {Array.from({ length: STRIPE_COUNT }, (_, index) => (
        <Rect
          key={index}
          x={index * stripeLength}
          y={0}
          width={stripeLength}
          height={FIELD_WIDTH}
          color={index % 2 === 0 ? palette.grassDark : palette.grassLight}
        />
      ))}
      <Path path={paths.markings} style="stroke" strokeWidth={lineWidth} color={palette.line} />
      <Path path={paths.spots} color={palette.line} />
    </Group>
  );
}
