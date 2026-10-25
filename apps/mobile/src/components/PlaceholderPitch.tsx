import { Canvas, Group, Path, Rect, Skia, type SkPath } from '@shopify/react-native-skia';
import { DEFAULT_MATCH_CONFIG } from '@touchline/shared';
import { useMemo, useState } from 'react';
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
const GOAL_WIDTH = 7.32;
const GOAL_DEPTH = 2;
const SPOT_RADIUS = 0.3;

const STRIPE_COUNT = 10;
const LINE_WIDTH_PX = 2;
const MARGIN_METRES = GOAL_DEPTH + 1;

interface Size {
  width: number;
  height: number;
}

interface PitchPaths {
  lines: SkPath;
  spots: SkPath;
}

function buildPitchPaths(): PitchPaths {
  const midX = PITCH_LENGTH / 2;
  const midY = PITCH_WIDTH / 2;
  const penaltyTop = midY - PENALTY_AREA_WIDTH / 2;
  const goalAreaTop = midY - GOAL_AREA_WIDTH / 2;
  const goalTop = midY - GOAL_WIDTH / 2;
  const arcHalfSweep =
    (Math.acos((PENALTY_AREA_DEPTH - PENALTY_SPOT_DISTANCE) / CENTRE_CIRCLE_RADIUS) * 180) /
    Math.PI;
  const arcOval = (cx: number) =>
    Skia.XYWHRect(
      cx - CENTRE_CIRCLE_RADIUS,
      midY - CENTRE_CIRCLE_RADIUS,
      CENTRE_CIRCLE_RADIUS * 2,
      CENTRE_CIRCLE_RADIUS * 2,
    );
  const rightSpotX = PITCH_LENGTH - PENALTY_SPOT_DISTANCE;

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
    .addArc(arcOval(PENALTY_SPOT_DISTANCE), -arcHalfSweep, arcHalfSweep * 2)
    .addArc(arcOval(rightSpotX), 180 - arcHalfSweep, arcHalfSweep * 2)
    .addRect(Skia.XYWHRect(-GOAL_DEPTH, goalTop, GOAL_DEPTH, GOAL_WIDTH))
    .addRect(Skia.XYWHRect(PITCH_LENGTH, goalTop, GOAL_DEPTH, GOAL_WIDTH))
    .detach();

  const spots = Skia.PathBuilder.Make()
    .addCircle(midX, midY, SPOT_RADIUS)
    .addCircle(PENALTY_SPOT_DISTANCE, midY, SPOT_RADIUS)
    .addCircle(rightSpotX, midY, SPOT_RADIUS)
    .detach();

  return { lines, spots };
}

/** Static, non-interactive pitch drawn in metre space and scaled to fit its container. */
export function PlaceholderPitch() {
  const [size, setSize] = useState<Size | null>(null);
  const paths = useMemo(buildPitchPaths, []);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const transform = useMemo(() => {
    if (!size) return null;
    const scale = Math.min(
      size.width / (PITCH_LENGTH + MARGIN_METRES * 2),
      size.height / (PITCH_WIDTH + MARGIN_METRES * 2),
    );
    return {
      scale,
      translateX: (size.width - PITCH_LENGTH * scale) / 2,
      translateY: (size.height - PITCH_WIDTH * scale) / 2,
    };
  }, [size]);

  const stripeLength = PITCH_LENGTH / STRIPE_COUNT;

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
            {Array.from({ length: STRIPE_COUNT }, (_, index) => (
              <Rect
                key={index}
                x={index * stripeLength}
                y={0}
                width={stripeLength}
                height={PITCH_WIDTH}
                color={index % 2 === 0 ? colors.pitchGrassDark : colors.pitchGrassLight}
              />
            ))}
            <Path
              path={paths.lines}
              style="stroke"
              strokeWidth={LINE_WIDTH_PX / transform.scale}
              color={colors.pitchLines}
            />
            <Path path={paths.spots} color={colors.pitchLines} />
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
