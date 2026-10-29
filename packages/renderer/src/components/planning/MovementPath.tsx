import { BlurMask, Circle, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import type { Vector2 } from '@touchline/shared';
import { useDerivedValue, type DerivedValue, type SharedValue } from 'react-native-reanimated';

import { getPathEnd, pointsAlongPath } from '../../path/pathGeometry';
import {
  MOVEMENT_PATH_STYLES,
  PATH_OUTLINE_COLOR,
  type MovementPathStyle,
  type MovementPathVariant,
} from './pathStyles';

/** Any Reanimated value holding a world-space path; only read here. */
type PointsValue = Pick<DerivedValue<readonly Vector2[]>, 'value'>;

function buildPolyline(points: readonly Vector2[]): SkPath {
  'worklet';
  const builder = Skia.PathBuilder.Make();
  if (points.length >= 2) {
    builder.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i += 1) builder.lineTo(points[i]!.x, points[i]!.y);
  }
  return builder.detach();
}

function buildChevrons(points: readonly Vector2[], style: MovementPathStyle, unit: number): SkPath {
  'worklet';
  const builder = Skia.PathBuilder.Make();
  if (style.chevronSpacing <= 0) return builder.detach();
  const spacing = style.chevronSpacing * unit;
  const size = 4 * unit;
  for (const { point, angle } of pointsAlongPath(points, spacing, spacing, spacing * 0.6)) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // A "›" shape centred on the path, pointing along the direction of travel.
    builder
      .moveTo(point.x - size * cos - size * sin, point.y - size * sin + size * cos)
      .lineTo(point.x + size * 0.4 * cos, point.y + size * 0.4 * sin)
      .lineTo(point.x - size * cos + size * sin, point.y - size * sin - size * cos);
  }
  return builder.detach();
}

function buildArrow(points: readonly Vector2[], style: MovementPathStyle, unit: number): SkPath {
  'worklet';
  const builder = Skia.PathBuilder.Make();
  const end = getPathEnd(points);
  if (!end) return builder.detach();
  const { point, angle } = end;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const length = style.arrowLength * unit;
  const half = style.arrowHalfWidth * unit;
  const baseX = point.x - length * cos;
  const baseY = point.y - length * sin;
  builder
    .moveTo(point.x, point.y)
    .lineTo(baseX - half * sin, baseY + half * cos)
    .lineTo(baseX + length * 0.25 * cos, baseY + length * 0.25 * sin)
    .lineTo(baseX + half * sin, baseY - half * cos)
    .close();
  return builder.detach();
}

interface PathLayerProps {
  points: PointsValue;
  variant: MovementPathVariant;
  inverseScale: SharedValue<number>;
}

/** Draws a world-space polyline with glow, rounded caps, chevrons, arrow head and end marker. */
function PathLayer({ points, variant, inverseScale }: PathLayerProps) {
  const style = MOVEMENT_PATH_STYLES[variant];
  const line = useDerivedValue(() => buildPolyline(points.value));
  const arrow = useDerivedValue(() => buildArrow(points.value, style, inverseScale.value));
  const chevrons = useDerivedValue(() => buildChevrons(points.value, style, inverseScale.value));
  const end = useDerivedValue(() => {
    const p = points.value;
    return p.length >= 2 ? p[p.length - 1]! : { x: -1e4, y: -1e4 };
  });
  const endX = useDerivedValue(() => end.value.x);
  const endY = useDerivedValue(() => end.value.y);

  const lineWidth = useDerivedValue(() => style.width * inverseScale.value);
  const outlineWidth = useDerivedValue(() => (style.width + 2.5) * inverseScale.value);
  const glowWidth = useDerivedValue(() => style.glowWidth * inverseScale.value);
  const glowBlur = useDerivedValue(() => 4 * inverseScale.value);
  const chevronWidth = useDerivedValue(() => 2 * inverseScale.value);
  const endpointRadius = useDerivedValue(() => style.endpointRadius * inverseScale.value);
  const endpointStroke = useDerivedValue(() => 1.5 * inverseScale.value);

  return (
    <Group>
      {style.glowColor && (
        <Path
          path={line}
          style="stroke"
          strokeWidth={glowWidth}
          strokeCap="round"
          strokeJoin="round"
          color={style.glowColor}
        >
          <BlurMask blur={glowBlur} style="normal" />
        </Path>
      )}
      <Path
        path={line}
        style="stroke"
        strokeWidth={outlineWidth}
        strokeCap="round"
        strokeJoin="round"
        color={PATH_OUTLINE_COLOR}
      />
      <Path
        path={line}
        style="stroke"
        strokeWidth={lineWidth}
        strokeCap="round"
        strokeJoin="round"
        color={style.color}
      />
      <Path
        path={chevrons}
        style="stroke"
        strokeWidth={chevronWidth}
        strokeCap="round"
        strokeJoin="round"
        color={PATH_OUTLINE_COLOR}
      />
      <Circle cx={endX} cy={endY} r={endpointRadius} color={style.endpointFill} />
      <Circle
        cx={endX}
        cy={endY}
        r={endpointRadius}
        style="stroke"
        strokeWidth={endpointStroke}
        color={style.color}
      />
      <Path path={arrow} color={style.color} />
    </Group>
  );
}

interface MovementPathProps {
  /** World-space path in metres. */
  points: readonly Vector2[];
  variant: MovementPathVariant;
  inverseScale: SharedValue<number>;
}

/** A stored path (preview or queued command). Re-renders only when the path itself changes. */
export function MovementPath({ points, variant, inverseScale }: MovementPathProps) {
  const value = useDerivedValue(() => points, [points]);
  return <PathLayer points={value} variant={variant} inverseScale={inverseScale} />;
}

interface LiveMovementPathProps {
  /** Path being drawn, written on the UI thread by the drawing gesture. */
  points: PointsValue;
  inverseScale: SharedValue<number>;
}

/** The in-progress stroke. Updates through shared values only, so drawing never re-renders React. */
export function LiveMovementPath({ points, inverseScale }: LiveMovementPathProps) {
  return <PathLayer points={points} variant="draft" inverseScale={inverseScale} />;
}
