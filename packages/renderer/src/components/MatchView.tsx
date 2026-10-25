import { Canvas, Group, useFont } from '@shopify/react-native-skia';
import { getTeamSide, type MatchSnapshot } from '@touchline/shared';
import { useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue } from 'react-native-reanimated';

import numberFontSource from '../../assets/fonts/BarlowSemiCondensed-Bold.ttf';
import { useCameraController } from '../camera/CameraController';
import { DEFAULT_CAMERA_CONFIG } from '../camera/cameraTransforms';
import { TEAM_KITS } from '../theme/palette';
import type { CameraConfig } from '../types/renderer';
import { BallMarker } from './BallMarker';
import { Goal } from './Goal';
import { Pitch } from './Pitch';
import { PlayerMarker } from './PlayerMarker';

const NUMBER_FONT_SIZE = 14;
/** Markings stay at least this wide on screen when zoomed out... */
const MIN_LINE_WIDTH_PX = 1.5;
/** ...and never thinner than real 12 cm lines when zoomed in. */
const REAL_LINE_WIDTH_METRES = 0.12;

interface MatchViewProps {
  /** Read-only match data; the view never mutates it. */
  snapshot: MatchSnapshot;
  cameraConfig?: CameraConfig;
  style?: StyleProp<ViewStyle>;
}

/** Interactive pitch view: renders a match snapshot under a pan/pinch camera. */
export function MatchView({
  snapshot,
  cameraConfig = DEFAULT_CAMERA_CONFIG,
  style,
}: MatchViewProps) {
  const camera = useCameraController(cameraConfig);
  const [hasLayout, setHasLayout] = useState(false);
  const font = useFont(numberFontSource, NUMBER_FONT_SIZE);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    camera.setViewport({ width, height });
    if (!hasLayout) setHasLayout(true);
  };

  const worldTransform = useDerivedValue(() => {
    const { scale, translateX, translateY } = camera.transform.value;
    return [{ translateX }, { translateY }, { scale }];
  });
  const inverseScale = useDerivedValue(() => 1 / Math.max(camera.transform.value.scale, 1e-6));
  const lineWidth = useDerivedValue(() =>
    Math.max(MIN_LINE_WIDTH_PX * inverseScale.value, REAL_LINE_WIDTH_METRES),
  );

  // Painter's order so markers lower on screen overlap those above; copies, never mutates.
  const players = useMemo(
    () => [...snapshot.players].sort((a, b) => a.position.y - b.position.y),
    [snapshot.players],
  );

  return (
    <GestureDetector gesture={camera.gesture}>
      <View style={[styles.container, style]} onLayout={onLayout} collapsable={false}>
        {hasLayout && (
          <Canvas style={StyleSheet.absoluteFill}>
            <Group transform={worldTransform}>
              <Pitch surround={cameraConfig.bounds} lineWidth={lineWidth} />
              <Goal end="left" lineWidth={lineWidth} />
              <Goal end="right" lineWidth={lineWidth} />
              {players.map((player) => {
                const side = getTeamSide(snapshot, player.teamId);
                if (!side) return null;
                return (
                  <PlayerMarker
                    key={player.id}
                    player={player}
                    kit={TEAM_KITS[side]}
                    font={font}
                    inverseScale={inverseScale}
                  />
                );
              })}
              <BallMarker ball={snapshot.ball} inverseScale={inverseScale} />
            </Group>
          </Canvas>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
});
