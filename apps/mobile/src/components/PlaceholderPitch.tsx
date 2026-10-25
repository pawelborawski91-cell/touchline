import {
  Canvas,
  FractalNoise,
  Group,
  Path,
  RadialGradient,
  Rect,
  Skia,
  vec,
  type SkPath,
} from '@shopify/react-native-skia';
import { DEFAULT_MATCH_CONFIG } from '@touchline/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { colors } from '../theme/colors';

const PITCH_LENGTH = DEFAULT_MATCH_CONFIG.fieldLength;
const PITCH_WIDTH = DEFAULT_MATCH_CONFIG.fieldWidth;

// IFAB markings, in metres.
const CENTRE_CIRCLE_RADIUS = 9.15;
const PENALTY_AREA_DEPTH = 16.5;
const PENALTY_AREA_WIDTH = 40.32;
const GOAL_AREA_DEPTH = 5.5;
const GOAL_AREA_WIDTH = 18.32;
const PENALTY_SPOT_DISTANCE = 11;
const CORNER_ARC_RADIUS = 1;
const GOAL_WIDTH = 7.32;
const GOAL_DEPTH = 2;
const SPOT_RADIUS = 0.3;

const NET_MESH = 0.5;
const FLAG_POLE = 2;
const STRIPE_WIDTH = PITCH_LENGTH / 14;
const RUNOFF_METRES = 4;
const LINE_WIDTH_PX = 2;
const POST_WIDTH_PX = 2.5;

interface Size {
  width: number;
  height: number;
}

interface PitchPaths {
  lines: SkPath;
  spots: SkPath;
  goalFrames: SkPath;
  nets: SkPath;
  poles: SkPath;
  flags: SkPath;
}

function buildPitchPaths(): PitchPaths {
  const midX = PITCH_LENGTH / 2;
  const midY = PITCH_WIDTH / 2;
  const penaltyTop = midY - PENALTY_AREA_WIDTH / 2;
  const goalAreaTop = midY - GOAL_AREA_WIDTH / 2;
  const goalTop = midY - GOAL_WIDTH / 2;
  const goalBottom = midY + GOAL_WIDTH / 2;
  const rightSpotX = PITCH_LENGTH - PENALTY_SPOT_DISTANCE;
  const arcHalfSweep =
    (Math.acos((PENALTY_AREA_DEPTH - PENALTY_SPOT_DISTANCE) / CENTRE_CIRCLE_RADIUS) * 180) /
    Math.PI;
  const circleOval = (cx: number, cy: number, r: number) =>
    Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2);

  const lines = Skia.PathBuilder.Make()
    .addRect(Skia.XYWHRect(0, 0, PITCH_LENGTH, PITCH_WIDTH))
    .moveTo(midX, 0)
    .lineTo(midX, PITCH_WIDTH)
    .addCircle(midX, midY, CENTRE_CIRCLE_RADIUS)
    .addRect(Skia.XYWHRect(0, penaltyTop, PENALTY_AREA_DEPTH, PENALTY_AREA_WIDTH))
    .addRect(
      Skia.XYWHRect(
        PITCH_LENGTH - PENALTY_AREA_DEPTH,
        penaltyTop,
        PENALTY_AREA_DEPTH,
        PENALTY_AREA_WIDTH,
      ),
    )
    .addRect(Skia.XYWHRect(0, goalAreaTop, GOAL_AREA_DEPTH, GOAL_AREA_WIDTH))
    .addRect(
      Skia.XYWHRect(PITCH_LENGTH - GOAL_AREA_DEPTH, goalAreaTop, GOAL_AREA_DEPTH, GOAL_AREA_WIDTH),
    )
    .addArc(
      circleOval(PENALTY_SPOT_DISTANCE, midY, CENTRE_CIRCLE_RADIUS),
      -arcHalfSweep,
      arcHalfSweep * 2,
    )
    .addArc(
      circleOval(rightSpotX, midY, CENTRE_CIRCLE_RADIUS),
      180 - arcHalfSweep,
      arcHalfSweep * 2,
    )
    .addArc(circleOval(0, 0, CORNER_ARC_RADIUS), 0, 90)
    .addArc(circleOval(PITCH_LENGTH, 0, CORNER_ARC_RADIUS), 90, 90)
    .addArc(circleOval(PITCH_LENGTH, PITCH_WIDTH, CORNER_ARC_RADIUS), 180, 90)
    .addArc(circleOval(0, PITCH_WIDTH, CORNER_ARC_RADIUS), 270, 90)
    .detach();

  const spots = Skia.PathBuilder.Make()
    .addCircle(midX, midY, SPOT_RADIUS)
    .addCircle(PENALTY_SPOT_DISTANCE, midY, SPOT_RADIUS)
    .addCircle(rightSpotX, midY, SPOT_RADIUS)
    .detach();

  const goalFrames = Skia.PathBuilder.Make()
    .addRect(Skia.XYWHRect(-GOAL_DEPTH, goalTop, GOAL_DEPTH, GOAL_WIDTH))
    .addRect(Skia.XYWHRect(PITCH_LENGTH, goalTop, GOAL_DEPTH, GOAL_WIDTH))
    .detach();

  const netBuilder = Skia.PathBuilder.Make();
  for (const [x0, x1] of [
    [-GOAL_DEPTH, 0],
    [PITCH_LENGTH, PITCH_LENGTH + GOAL_DEPTH],
  ] as const) {
    for (let x = x0 + NET_MESH; x < x1; x += NET_MESH) {
      netBuilder.moveTo(x, goalTop).lineTo(x, goalBottom);
    }
    for (let y = goalTop + NET_MESH; y < goalBottom; y += NET_MESH) {
      netBuilder.moveTo(x0, y).lineTo(x1, y);
    }
  }
  const nets = netBuilder.detach();

  const polesBuilder = Skia.PathBuilder.Make();
  const flagsBuilder = Skia.PathBuilder.Make();
  for (const [cx, cy] of [
    [0, 0],
    [PITCH_LENGTH, 0],
    [0, PITCH_WIDTH],
    [PITCH_LENGTH, PITCH_WIDTH],
  ] as const) {
    const outX = cx === 0 ? -1 : 1;
    const outY = cy === 0 ? -1 : 1;
    const tipX = cx + outX * FLAG_POLE * 0.5;
    const tipY = cy + outY * FLAG_POLE;
    polesBuilder.moveTo(cx, cy).lineTo(tipX, tipY);
    flagsBuilder
      .moveTo(tipX, tipY)
      .lineTo(tipX + outX * 1.3, tipY - outY * 0.35)
      .lineTo(tipX + outX * 0.15, tipY - outY * 0.85)
      .close();
  }

  return {
    lines,
    spots,
    goalFrames,
    nets,
    poles: polesBuilder.detach(),
    flags: flagsBuilder.detach(),
  };
}

interface PlaceholderPitchProps {
  /** Skia elements drawn in pitch metre space, above the markings. */
  children?: ReactNode;
}

/** Static, non-interactive pitch drawn in metre space and scaled to fit its container. */
export function PlaceholderPitch({ children }: PlaceholderPitchProps) {
  const [size, setSize] = useState<Size | null>(null);
  const paths = useMemo(buildPitchPaths, []);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const transform = useMemo(() => {
    if (!size) return null;
    const scale = Math.min(
      size.width / (PITCH_LENGTH + RUNOFF_METRES * 2),
      size.height / (PITCH_WIDTH + RUNOFF_METRES * 2),
    );
    return {
      scale,
      translateX: (size.width - PITCH_LENGTH * scale) / 2,
      translateY: (size.height - PITCH_WIDTH * scale) / 2,
    };
  }, [size]);

  const grassX = -RUNOFF_METRES;
  const grassY = -RUNOFF_METRES;
  const grassLength = PITCH_LENGTH + RUNOFF_METRES * 2;
  const grassWidth = PITCH_WIDTH + RUNOFF_METRES * 2;
  const firstStripe = Math.floor(grassX / STRIPE_WIDTH);
  const lastStripe = Math.ceil((grassX + grassLength) / STRIPE_WIDTH);
  const stripes = Array.from({ length: lastStripe - firstStripe }, (_, i) => firstStripe + i);

  return (
    <View style={styles.container} onLayout={onLayout}>
      {transform && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Group
            transform={[
              { translateX: transform.translateX },
              { translateY: transform.translateY },
              { scale: transform.scale },
            ]}
          >
            <Group clip={Skia.XYWHRect(grassX, grassY, grassLength, grassWidth)}>
              {stripes.map((index) => (
                <Rect
                  key={index}
                  x={index * STRIPE_WIDTH}
                  y={grassY}
                  width={STRIPE_WIDTH}
                  height={grassWidth}
                  color={index % 2 === 0 ? colors.pitchGrassDark : colors.pitchGrassLight}
                />
              ))}
              <Rect
                x={grassX}
                y={grassY}
                width={grassLength}
                height={grassWidth}
                opacity={0.08}
                blendMode="overlay"
              >
                <FractalNoise freqX={0.9} freqY={0.9} octaves={3} />
              </Rect>
              <Rect x={grassX} y={grassY} width={grassLength} height={grassWidth}>
                <RadialGradient
                  c={vec(PITCH_LENGTH / 2, PITCH_WIDTH / 2)}
                  r={grassLength * 0.62}
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.38)']}
                />
              </Rect>
            </Group>
            <Path
              path={paths.lines}
              style="stroke"
              strokeWidth={LINE_WIDTH_PX / transform.scale}
              color={colors.pitchLines}
            />
            <Path path={paths.spots} color={colors.pitchLines} />
            <Path
              path={paths.nets}
              style="stroke"
              strokeWidth={0.6 / transform.scale}
              color={colors.goalNet}
            />
            <Path
              path={paths.goalFrames}
              style="stroke"
              strokeWidth={POST_WIDTH_PX / transform.scale}
              color={colors.goalFrame}
            />
            <Path
              path={paths.poles}
              style="stroke"
              strokeWidth={1.2 / transform.scale}
              color={colors.flagPole}
            />
            <Path path={paths.flags} color={colors.cornerFlag} />
            {children}
          </Group>
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'stretch',
  },
});
