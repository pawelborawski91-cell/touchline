import { BEHAVIOR_LABELS, MatchEngine } from '@touchline/match-engine';
import { arrowHead, buildAIDebugScene, dashSegments } from '@touchline/renderer/core';
import { createInitialMatch } from '@touchline/shared';
import { describe, expect, it } from 'vitest';

describe('AI debug scene', () => {
  const engine = new MatchEngine(createInitialMatch());
  engine.commitPlans();
  for (let i = 0; i < 40; i += 1) engine.advanceFrame(engine.config.match.fixedDeltaTime);
  const snapshot = engine.getSnapshot();
  const frameIndexOf = new Map(snapshot.players.map((player, index) => [player.id, index]));
  const info = engine.getAIDebugInfo();

  it('builds frame-indexed drawing data from the engine debug info', () => {
    const scene = buildAIDebugScene(info, frameIndexOf, BEHAVIOR_LABELS);
    expect(scene.players).toHaveLength(22);
    expect(scene.players.map((p) => p.frameIndex)).toEqual([...Array(22).keys()]);
    expect(scene.teams.map((t) => t.teamId)).toEqual(info.teams.map((t) => t.teamId));
    for (const team of scene.teams) {
      expect(team.anchors).toHaveLength(11);
      expect(team.bounds.maxX).toBeGreaterThan(team.bounds.minX);
    }
    for (const p of scene.players) {
      const source = info.players.find((s) => frameIndexOf.get(s.playerId) === p.frameIndex)!;
      expect(p.label).toBe(source.behaviorId ? BEHAVIOR_LABELS[source.behaviorId] : '');
      expect(p.target).toEqual(source.target);
    }
  });

  it('links pressers to the opposing carrier and markers to their marks', () => {
    const team = info.teams[0]!;
    const opponent = info.teams[1]!;
    const shaped = {
      ...info,
      teams: [
        {
          ...team,
          presserId: 'north-city-9',
          supportPresserId: null,
          marks: { 'north-city-4': 'south-united-9' },
        },
        { ...opponent, carrierId: 'south-united-6' },
      ],
    };
    const scene = buildAIDebugScene(shaped, frameIndexOf);
    expect(scene.teams[0]!.pressLinks).toEqual([
      { from: frameIndexOf.get('north-city-9'), to: frameIndexOf.get('south-united-6') },
    ]);
    expect(scene.teams[0]!.markLinks).toEqual([
      { from: frameIndexOf.get('north-city-4'), to: frameIndexOf.get('south-united-9') },
    ]);
  });

  it('labels manual and inactive players and hides their intents', () => {
    const players = info.players.map((p, i) => ({
      ...p,
      controlMode: i === 0 ? ('manual' as const) : i === 1 ? ('inactive' as const) : p.controlMode,
    }));
    const scene = buildAIDebugScene({ ...info, players }, frameIndexOf);
    const first = scene.players.find(
      (p) => p.frameIndex === frameIndexOf.get(players[0]!.playerId),
    )!;
    const second = scene.players.find(
      (p) => p.frameIndex === frameIndexOf.get(players[1]!.playerId),
    )!;
    expect(first).toMatchObject({ label: 'USER', manual: true, target: null });
    expect(second).toMatchObject({ label: 'OFF', manual: false, target: null });
  });

  it('skips players missing from the frame', () => {
    const scene = buildAIDebugScene(info, new Map([['north-city-1', 0]]));
    expect(scene.players).toHaveLength(1);
  });

  it('building the scene never changes the engine state', () => {
    const before = engine.getState();
    buildAIDebugScene(engine.getAIDebugInfo(), frameIndexOf, BEHAVIOR_LABELS);
    expect(engine.getState()).toBe(before);
  });
});

describe('debug geometry', () => {
  it('splits a line into dashes', () => {
    const dashes = dashSegments({ x: 0, y: 0 }, { x: 10, y: 0 }, 2, 1);
    expect(dashes).toHaveLength(4);
    expect(dashes[0]).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(dashes[3]![1]).toEqual({ x: 10, y: 0 });
    expect(dashSegments({ x: 1, y: 1 }, { x: 1, y: 1 }, 2, 1)).toEqual([]);
  });

  it('builds symmetric arrow barbs behind the tip', () => {
    const barbs = arrowHead({ x: 0, y: 0 }, { x: 10, y: 0 }, 2)!;
    expect(barbs[0].x).toBeCloseTo(8);
    expect(barbs[1].x).toBeCloseTo(8);
    expect(barbs[0].y).toBeCloseTo(-barbs[1].y);
    expect(arrowHead({ x: 1, y: 1 }, { x: 1, y: 1 }, 2)).toBeNull();
  });
});
