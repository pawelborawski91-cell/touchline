import type { Vector2 } from '@touchline/shared';

/**
 * Plain AI debug data the renderer can draw. The shape matches the player AI's debug summary
 * structurally, so the renderer needs no dependency on the AI package.
 */
export interface AIDebugSource {
  teams: readonly {
    teamId: string;
    playState: string;
    defensiveLineX: number;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    carrierId: string | null;
    presserId: string | null;
    supportPresserId: string | null;
    marks: Readonly<Record<string, string>>;
  }[];
  players: readonly {
    playerId: string;
    teamId: string;
    controlMode: string;
    behaviorId: string | null;
    target: Vector2 | null;
    anchor: Vector2 | null;
  }[];
}

/** A link between two players, by index into the live frame. */
export interface FrameLink {
  from: number;
  to: number;
}

export interface AIDebugTeamScene {
  teamId: string;
  playState: string;
  defensiveLineX: number;
  /** Width × depth box of the team's shape (anchor bounds), m. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  anchors: Vector2[];
  /** Presser (and second presser) → opposing carrier. */
  pressLinks: FrameLink[];
  /** Marker → marked opponent. */
  markLinks: FrameLink[];
}

export interface AIDebugPlayerScene {
  frameIndex: number;
  teamId: string;
  /** Where the AI is steering the player; null for manual, inactive or idle players. */
  target: Vector2 | null;
  label: string;
  manual: boolean;
}

export interface AIDebugScene {
  teams: AIDebugTeamScene[];
  players: AIDebugPlayerScene[];
}

const MANUAL_LABEL = 'USER';
const INACTIVE_LABEL = 'OFF';

/**
 * Turns an AI debug summary into frame-indexed drawing data. Players missing from
 * `frameIndexOf` are skipped, so the scene never points at a stale frame slot.
 */
export function buildAIDebugScene(
  source: AIDebugSource,
  frameIndexOf: ReadonlyMap<string, number>,
  labels: Readonly<Record<string, string>> = {},
): AIDebugScene {
  const link = (from: string | null, to: string | null): FrameLink | null => {
    if (!from || !to) return null;
    const a = frameIndexOf.get(from);
    const b = frameIndexOf.get(to);
    return a === undefined || b === undefined ? null : { from: a, to: b };
  };
  const teams = source.teams.map((team): AIDebugTeamScene => {
    const opponent = source.teams.find((other) => other.teamId !== team.teamId);
    const carrier = opponent?.carrierId ?? null;
    const pressLinks = [link(team.presserId, carrier), link(team.supportPresserId, carrier)].filter(
      (value): value is FrameLink => value !== null,
    );
    const markLinks = Object.entries(team.marks)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([marker, marked]) => link(marker, marked))
      .filter((value): value is FrameLink => value !== null);
    const anchors = source.players
      .filter((player) => player.teamId === team.teamId && player.anchor !== null)
      .map((player) => player.anchor!);
    return {
      teamId: team.teamId,
      playState: team.playState,
      defensiveLineX: team.defensiveLineX,
      bounds: team.bounds,
      anchors,
      pressLinks,
      markLinks,
    };
  });
  const players: AIDebugPlayerScene[] = [];
  for (const player of source.players) {
    const frameIndex = frameIndexOf.get(player.playerId);
    if (frameIndex === undefined) continue;
    const autonomous = player.controlMode === 'autonomous';
    const label =
      player.controlMode === 'manual'
        ? MANUAL_LABEL
        : player.controlMode === 'inactive'
          ? INACTIVE_LABEL
          : player.behaviorId
            ? (labels[player.behaviorId] ?? player.behaviorId)
            : '';
    players.push({
      frameIndex,
      teamId: player.teamId,
      target: autonomous ? player.target : null,
      label,
      manual: player.controlMode === 'manual',
    });
  }
  players.sort((a, b) => a.frameIndex - b.frameIndex);
  return { teams, players };
}

/** Dash segments along a line from `from` to `to`, as [start, end] pairs. */
export function dashSegments(
  from: Vector2,
  to: Vector2,
  dash: number,
  gap: number,
): [Vector2, Vector2][] {
  'worklet';
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0 || dash <= 0) return [];
  const ux = (to.x - from.x) / length;
  const uy = (to.y - from.y) / length;
  const segments: [Vector2, Vector2][] = [];
  for (let start = 0; start < length; start += dash + Math.max(0, gap)) {
    const end = Math.min(length, start + dash);
    segments.push([
      { x: from.x + ux * start, y: from.y + uy * start },
      { x: from.x + ux * end, y: from.y + uy * end },
    ]);
  }
  return segments;
}

/** The two barb ends of an arrow head at `to`, or null for a degenerate arrow. */
export function arrowHead(from: Vector2, to: Vector2, size: number): [Vector2, Vector2] | null {
  'worklet';
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  const ux = dx / length;
  const uy = dy / length;
  return [
    { x: to.x - size * ux - size * 0.5 * uy, y: to.y - size * uy + size * 0.5 * ux },
    { x: to.x - size * ux + size * 0.5 * uy, y: to.y - size * uy - size * 0.5 * ux },
  ];
}
