import { Canvas, Group, useFont } from '@shopify/react-native-skia';
import { ballFrameOffset, getTeamSide, type MatchSnapshot } from '@touchline/shared';
import { useMemo, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, type ComposedGesture } from 'react-native-gesture-handler';
import { useDerivedValue, type DerivedValue, type SharedValue } from 'react-native-reanimated';

import numberFontSource from '../../assets/fonts/BarlowSemiCondensed-Bold.ttf';
import type { CameraController } from '../camera/CameraController';
import { TEAM_KITS } from '../theme/palette';
import type { ViewTransform } from '../types/renderer';
import { BallMarker } from './BallMarker';
import { Goal } from './Goal';
import { Pitch } from './Pitch';
import { PlayerMarker } from './PlayerMarker';

const NUMBER_FONT_SIZE = 14;
/** Markings stay at least this wide on screen when zoomed out... */
const MIN_LINE_WIDTH_PX = 1.5;
/** ...and never thinner than real 12 cm lines when zoomed in. */
const REAL_LINE_WIDTH_METRES = 0.12;

/** Values available to world-space layers drawn inside the camera transform. */
export interface WorldLayerContext {
  /** 1 / camera scale, for drawing at a constant screen size. */
  inverseScale: SharedValue<number>;
  transform: DerivedValue<ViewTransform>;
}

interface MatchViewProps {
  /** Read-only match data; the view never mutates it. */
  snapshot: MatchSnapshot;
  camera: CameraController;
  /** Gestures attached to the view, e.g. `useCameraGestures(camera)`. */
  gesture: ComposedGesture;
  /** World-space content drawn above the pitch and below the markers. */
  renderUnderlay?: (context: WorldLayerContext) => ReactNode;
  /** World-space content drawn above the markers and ball. */
  renderOverlay?: (context: WorldLayerContext) => ReactNode;
  /**
   * Optional live frame written by a simulation loop: `PLAYER_FRAME_STRIDE` values per player in
   * `snapshot.players` order, then the ball at `ballFrameOffset(players.length)`. Markers and the
   * ball follow it on the UI thread without re-renders.
   */
  playerFrame?: SharedValue<readonly number[]>;
  /** Fading streak behind a fast ball. */
  showBallTrail?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Pitch view: renders a match snapshot under the given camera and gestures. */
export function MatchView({
  snapshot,
  camera,
  gesture,
  renderUnderlay,
  renderOverlay,
  playerFrame,
  showBallTrail = true,
  style,
}: MatchViewProps) {
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
  const layerContext = useMemo<WorldLayerContext>(
    () => ({ inverseScale, transform: camera.transform }),
    [camera.transform, inverseScale],
  );
  const lineWidth = useDerivedValue(() =>
    Math.max(MIN_LINE_WIDTH_PX * inverseScale.value, REAL_LINE_WIDTH_METRES),
  );

  // Painter's order so markers lower on screen overlap those above; copies, never mutates.
  // The order is fixed per snapshot, so it is not re-sorted while players move via the frame.
  const players = useMemo(
    () =>
      snapshot.players
        .map((player, index) => ({ player, index }))
        .sort((a, b) => a.player.position.y - b.player.position.y),
    [snapshot.players],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.container, style]} onLayout={onLayout} collapsable={false}>
        {hasLayout && (
          <Canvas style={StyleSheet.absoluteFill}>
            <Group transform={worldTransform}>
              <Pitch surround={camera.config.bounds} lineWidth={lineWidth} />
              <Goal end="left" lineWidth={lineWidth} />
              <Goal end="right" lineWidth={lineWidth} />
              {renderUnderlay?.(layerContext)}
              {players.map(({ player, index }) => {
                const side = getTeamSide(snapshot, player.teamId);
                if (!side) return null;
                return (
                  <PlayerMarker
                    key={player.id}
                    player={player}
                    kit={TEAM_KITS[side]}
                    font={font}
                    inverseScale={inverseScale}
                    frame={playerFrame}
                    frameIndex={index}
                  />
                );
              })}
              <BallMarker
                ball={snapshot.ball}
                inverseScale={inverseScale}
                frame={playerFrame}
                frameOffset={ballFrameOffset(snapshot.players.length)}
                showTrail={showBallTrail}
              />
              {renderOverlay?.(layerContext)}
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
