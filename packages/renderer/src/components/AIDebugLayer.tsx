import { Group, Path, Skia, Text, useFont, type SkFont } from '@shopify/react-native-skia';
import {
  FIELD_WIDTH,
  getTeamSide,
  PLAYER_FRAME_STRIDE,
  type MatchSnapshot,
  type TeamSide,
} from '@touchline/shared';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import labelFontSource from '../../assets/fonts/BarlowSemiCondensed-Bold.ttf';
import {
  arrowHead,
  dashSegments,
  type AIDebugPlayerScene,
  type AIDebugScene,
  type AIDebugTeamScene,
} from '../ai/aiDebugScene';
import { PLAYER_MARKER_RADIUS } from '../interaction/hitTest';

const LABEL_FONT_SIZE = 9;
/** Label baseline below the marker centre, screen px. */
const LABEL_OFFSET_PX = PLAYER_MARKER_RADIUS + 10;
const ANCHOR_HALF_SIZE = 0.6;

const TEAM_COLORS: Readonly<Record<TeamSide, { strong: string; soft: string; faint: string }>> = {
  home: {
    strong: 'rgba(143, 196, 255, 0.95)',
    soft: 'rgba(143, 196, 255, 0.6)',
    faint: 'rgba(143, 196, 255, 0.22)',
  },
  away: {
    strong: 'rgba(255, 158, 140, 0.95)',
    soft: 'rgba(255, 158, 140, 0.6)',
    faint: 'rgba(255, 158, 140, 0.22)',
  },
};
const PRESS_COLOR = 'rgba(255, 92, 92, 0.95)';
const MANUAL_LABEL_COLOR = '#C8F560';

interface AIDebugLayerProps {
  scene: AIDebugScene;
  snapshot: MatchSnapshot;
  /** Live player frame (`PLAYER_FRAME_STRIDE` values per snapshot player). */
  frame: SharedValue<readonly number[]>;
  inverseScale: SharedValue<number>;
}

/**
 * Read-only AI visualisation: team shape boxes, defensive lines and formation anchors; each
 * autonomous player's intent vector and behavior label; presser and marking links. It only reads
 * the scene and the frame.
 */
export function AIDebugLayer({ scene, snapshot, frame, inverseScale }: AIDebugLayerProps) {
  const font = useFont(labelFontSource, LABEL_FONT_SIZE);
  return (
    <Group>
      {scene.teams.map((team) => {
        const side = getTeamSide(snapshot, team.teamId);
        return side ? (
          <TeamShapeLayer
            key={team.teamId}
            team={team}
            side={side}
            frame={frame}
            inverseScale={inverseScale}
          />
        ) : null;
      })}
      {(['home', 'away'] as const).map((side) => (
        <IntentLayer
          key={side}
          players={scene.players.filter((player) => getTeamSide(snapshot, player.teamId) === side)}
          side={side}
          frame={frame}
          inverseScale={inverseScale}
        />
      ))}
      {scene.players.map((player) => {
        const side = getTeamSide(snapshot, player.teamId);
        return side && player.label ? (
          <BehaviorLabel
            key={player.frameIndex}
            player={player}
            side={side}
            font={font}
            frame={frame}
            inverseScale={inverseScale}
          />
        ) : null;
      })}
    </Group>
  );
}

function TeamShapeLayer({
  team,
  side,
  frame,
  inverseScale,
}: {
  team: AIDebugTeamScene;
  side: TeamSide;
  frame: SharedValue<readonly number[]>;
  inverseScale: SharedValue<number>;
}) {
  const colors = TEAM_COLORS[side];
  const shape = useMemo(() => {
    const { minX, maxX, minY, maxY } = team.bounds;
    return Skia.PathBuilder.Make()
      .addRect(Skia.XYWHRect(minX, minY, maxX - minX, maxY - minY))
      .detach();
  }, [team.bounds]);
  const line = useMemo(
    () =>
      Skia.PathBuilder.Make()
        .moveTo(team.defensiveLineX, 0)
        .lineTo(team.defensiveLineX, FIELD_WIDTH)
        .detach(),
    [team.defensiveLineX],
  );
  const anchors = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    for (const { x, y } of team.anchors) {
      builder
        .moveTo(x, y - ANCHOR_HALF_SIZE)
        .lineTo(x + ANCHOR_HALF_SIZE, y)
        .lineTo(x, y + ANCHOR_HALF_SIZE)
        .lineTo(x - ANCHOR_HALF_SIZE, y)
        .close();
    }
    return builder.detach();
  }, [team.anchors]);

  const press = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    const values = frame.value;
    for (const { from, to } of team.pressLinks) {
      const a = from * PLAYER_FRAME_STRIDE;
      const b = to * PLAYER_FRAME_STRIDE;
      if (values.length < Math.max(a, b) + 2) continue;
      const start = { x: values[a]!, y: values[a + 1]! };
      const end = { x: values[b]!, y: values[b + 1]! };
      builder.moveTo(start.x, start.y).lineTo(end.x, end.y);
      const head = arrowHead(start, end, 1.2);
      if (head)
        builder.moveTo(head[0].x, head[0].y).lineTo(end.x, end.y).lineTo(head[1].x, head[1].y);
    }
    return builder.detach();
  }, [team.pressLinks]);
  const marks = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    const values = frame.value;
    for (const { from, to } of team.markLinks) {
      const a = from * PLAYER_FRAME_STRIDE;
      const b = to * PLAYER_FRAME_STRIDE;
      if (values.length < Math.max(a, b) + 2) continue;
      for (const [s, e] of dashSegments(
        { x: values[a]!, y: values[a + 1]! },
        { x: values[b]!, y: values[b + 1]! },
        0.8,
        0.6,
      )) {
        builder.moveTo(s.x, s.y).lineTo(e.x, e.y);
      }
    }
    return builder.detach();
  }, [team.markLinks]);

  const thin = useDerivedValue(() => 1.25 * inverseScale.value);
  const medium = useDerivedValue(() => 2 * inverseScale.value);

  return (
    <Group>
      <Path path={shape} color={colors.faint} />
      <Path path={shape} style="stroke" strokeWidth={thin} color={colors.soft} />
      <Path path={line} style="stroke" strokeWidth={medium} color={colors.soft} />
      <Path path={anchors} style="stroke" strokeWidth={thin} color={colors.strong} />
      <Path path={marks} style="stroke" strokeWidth={thin} color={colors.strong} />
      <Path
        path={press}
        style="stroke"
        strokeWidth={medium}
        strokeCap="round"
        strokeJoin="round"
        color={PRESS_COLOR}
      />
    </Group>
  );
}

function IntentLayer({
  players,
  side,
  frame,
  inverseScale,
}: {
  players: readonly AIDebugPlayerScene[];
  side: TeamSide;
  frame: SharedValue<readonly number[]>;
  inverseScale: SharedValue<number>;
}) {
  const color = TEAM_COLORS[side].strong;
  const intents = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    const values = frame.value;
    const head = 6 * inverseScale.value;
    for (const player of players) {
      if (!player.target) continue;
      const base = player.frameIndex * PLAYER_FRAME_STRIDE;
      if (values.length < base + 2) continue;
      const start = { x: values[base]!, y: values[base + 1]! };
      const end = player.target;
      if (Math.hypot(end.x - start.x, end.y - start.y) < 0.5) continue;
      builder.moveTo(start.x, start.y).lineTo(end.x, end.y);
      const barbs = arrowHead(start, end, head);
      if (barbs)
        builder.moveTo(barbs[0].x, barbs[0].y).lineTo(end.x, end.y).lineTo(barbs[1].x, barbs[1].y);
    }
    return builder.detach();
  }, [players]);
  const width = useDerivedValue(() => 1.5 * inverseScale.value);
  return (
    <Path
      path={intents}
      style="stroke"
      strokeWidth={width}
      strokeCap="round"
      strokeJoin="round"
      color={color}
    />
  );
}

function BehaviorLabel({
  player,
  side,
  font,
  frame,
  inverseScale,
}: {
  player: AIDebugPlayerScene;
  side: TeamSide;
  font: SkFont | null;
  frame: SharedValue<readonly number[]>;
  inverseScale: SharedValue<number>;
}) {
  const { frameIndex, label } = player;
  const transform = useDerivedValue(() => {
    const values = frame.value;
    const base = frameIndex * PLAYER_FRAME_STRIDE;
    const live = values.length > base + 1;
    return [
      { translateX: live ? values[base]! : 0 },
      { translateY: live ? values[base + 1]! : 0 },
      { scale: inverseScale.value },
    ];
  });
  const originX = useMemo(() => (font ? -font.measureText(label).width / 2 : 0), [font, label]);
  if (!font) return null;
  return (
    <Group transform={transform}>
      <Text
        x={originX}
        y={LABEL_OFFSET_PX}
        text={label}
        font={font}
        color={player.manual ? MANUAL_LABEL_COLOR : TEAM_COLORS[side].strong}
      />
    </Group>
  );
}
