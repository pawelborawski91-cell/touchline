import { getPossessionSnapshot } from '@touchline/ball-engine';
import {
  ALL_BEHAVIORS,
  DEFAULT_AI_CONFIG,
  persistTarget,
  ROLE_PROFILES,
  selectCandidate,
  TEAM_PLAY_STATES,
  updateAI,
  type AIConfig,
  type AIState,
  type AIWorld,
  type Behavior,
  type BehaviorId,
  type DecisionMemory,
  type ScoredCandidate,
} from '@touchline/player-ai';
import type { SimulationState } from '@touchline/match-engine';
import { describe, expect, it } from 'vitest';

import { config, finishTurn, setupMatch } from './ai-fixtures';

const candidate = (
  behaviorId: BehaviorId,
  utility: number,
  priority = 1,
  target = { x: 50, y: 30 },
): ScoredCandidate => ({
  behaviorId,
  utility,
  priority,
  target,
  movementMode: 'jog',
  focusPlayerId: null,
  tracking: false,
  exitSpeed: 0,
});

const memoryOf = (
  behaviorId: BehaviorId | null,
  switchedAtTick: number | null,
): DecisionMemory => ({
  decision: behaviorId
    ? {
        playerId: 'p',
        behaviorId,
        targetPosition: { x: 50, y: 30 },
        utility: 0.5,
        priority: 1,
        movementMode: 'jog',
        focusPlayerId: null,
      }
    : null,
  switchedAtTick,
  targetSetAtTick: switchedAtTick,
});

describe('utility selection', () => {
  const cfg = DEFAULT_AI_CONFIG;

  it('picks the highest utility', () => {
    const chosen = selectCandidate(
      [candidate('hold_width', 0.4), candidate('find_space', 0.7), candidate('offer_pass', 0.6)],
      memoryOf(null, null),
      100,
      cfg,
      false,
    );
    expect(chosen?.candidate.behaviorId).toBe('find_space');
    expect(chosen?.switched).toBe(true);
  });

  it('returns null without candidates', () => {
    expect(selectCandidate([], memoryOf(null, null), 0, cfg, false)).toBeNull();
  });

  it('keeps the current behavior within the hysteresis margin', () => {
    const memory = memoryOf('hold_width', 0);
    const close = [
      candidate('hold_width', 0.6),
      candidate('find_space', 0.6 + cfg.hysteresis * 0.5),
    ];
    expect(selectCandidate(close, memory, 100, cfg, false)?.candidate.behaviorId).toBe(
      'hold_width',
    );
    const clear = [candidate('hold_width', 0.6), candidate('find_space', 0.6 + cfg.hysteresis * 2)];
    const switched = selectCandidate(clear, memory, 100, cfg, false);
    expect(switched?.candidate.behaviorId).toBe('find_space');
    expect(switched?.switched).toBe(true);
  });

  it('respects the switch cooldown unless the challenger is urgent or the call is forced', () => {
    const memory = memoryOf('hold_width', 95);
    const tick = 95 + cfg.switchCooldownTicks - 1;
    const normal = [candidate('hold_width', 0.3), candidate('find_space', 0.9, 2)];
    expect(selectCandidate(normal, memory, tick, cfg, false)?.candidate.behaviorId).toBe(
      'hold_width',
    );
    expect(selectCandidate(normal, memory, tick, cfg, true)?.candidate.behaviorId).toBe(
      'find_space',
    );
    const urgent = [
      candidate('hold_width', 0.3),
      candidate('press_carrier', 0.9, cfg.urgentPriority),
    ];
    expect(selectCandidate(urgent, memory, tick, cfg, false)?.candidate.behaviorId).toBe(
      'press_carrier',
    );
    expect(
      selectCandidate(normal, memory, 95 + cfg.switchCooldownTicks, cfg, false)?.candidate
        .behaviorId,
    ).toBe('find_space');
  });

  it('switches at once when the current behavior is no longer available', () => {
    const chosen = selectCandidate(
      [candidate('find_space', 0.5)],
      memoryOf('hold_width', 99),
      100,
      cfg,
      false,
    );
    expect(chosen?.candidate.behaviorId).toBe('find_space');
  });

  it('breaks ties by priority, then behavior id', () => {
    const byPriority = selectCandidate(
      [
        candidate('hold_width', 0.5, 1),
        candidate('find_space', 0.5 + cfg.tieEpsilon / 2, 1),
        candidate('offer_pass', 0.5, 2),
      ],
      memoryOf(null, null),
      0,
      cfg,
      false,
    );
    expect(byPriority?.candidate.behaviorId).toBe('offer_pass');
    const byId = selectCandidate(
      [candidate('hold_width', 0.5), candidate('find_space', 0.5)],
      memoryOf(null, null),
      0,
      cfg,
      false,
    );
    expect(byId?.candidate.behaviorId).toBe('find_space');
  });

  it('is independent of candidate order', () => {
    const list = [
      candidate('hold_width', 0.5),
      candidate('find_space', 0.5),
      candidate('hold_depth', 0.5),
    ];
    const forward = selectCandidate(list, memoryOf(null, null), 0, cfg, false);
    const backward = selectCandidate([...list].reverse(), memoryOf(null, null), 0, cfg, false);
    expect(forward?.candidate.behaviorId).toBe(backward?.candidate.behaviorId);
  });
});

describe('target persistence', () => {
  const cfg = DEFAULT_AI_CONFIG;

  it('keeps a nearby target until it is stale, re-targets on bigger moves', () => {
    const memory = memoryOf('hold_width', 100);
    const near = candidate('hold_width', 0.5, 1, { x: 50.5, y: 30.5 });
    expect(persistTarget(near, memory, 110, cfg)).toEqual({
      target: { x: 50, y: 30 },
      refreshed: false,
    });
    expect(persistTarget(near, memory, 100 + cfg.maxTargetAgeTicks, cfg).refreshed).toBe(true);
    const far = candidate('hold_width', 0.5, 1, { x: 55, y: 30 });
    expect(persistTarget(far, memory, 110, cfg)).toEqual({
      target: { x: 55, y: 30 },
      refreshed: true,
    });
    const other = candidate('find_space', 0.5, 1, { x: 50.5, y: 30.5 });
    expect(persistTarget(other, memory, 110, cfg).refreshed).toBe(true);
  });
});

function worldOf(state: SimulationState, tick = 0): AIWorld {
  return {
    tick,
    deltaTime: config.match.fixedDeltaTime,
    phase: 'execution',
    players: state.players,
    ball: state.ball.ball,
    possession: getPossessionSnapshot(state.ball, state.players),
    manualPlayerIds: new Set(),
  };
}

const fixed = (id: BehaviorId, utility: number, options: Partial<Behavior> = {}): Behavior => ({
  id,
  category: 'general',
  states: TEAM_PLAY_STATES,
  priority: 1,
  eligible: () => true,
  evaluate: () => ({ utility, target: { x: 52.5, y: 34 }, movementMode: 'jog' }),
  ...options,
});

/** Same weight for every role, so raw utilities compare directly. */
function flatRoles(weights: Partial<Record<BehaviorId, number>>): AIConfig['roles'] {
  const roles = { ...ROLE_PROFILES };
  for (const role of Object.keys(roles) as (keyof typeof roles)[]) {
    roles[role] = { ...roles[role], weights };
  }
  return roles;
}

describe('behavior evaluation', () => {
  const state = setupMatch();
  const behaviors = (s: AIState) => Object.values(s.players).map((p) => p.decision);

  it('normalises utilities to 0–1 and applies role and global weights', () => {
    const cfg: AIConfig = {
      ...DEFAULT_AI_CONFIG,
      roles: flatRoles({ hold_width: 0.5, find_space: 1 }),
      behaviorWeights: { find_space: 0.2 },
    };
    const ai = updateAI(state.ai, worldOf(state), cfg, [
      fixed('hold_width', 7),
      fixed('find_space', 0.9),
    ]);
    for (const decision of behaviors(ai)) {
      // hold_width: clamp(7) = 1 × 0.5 = 0.5; find_space: 0.9 × 1 × 0.2 = 0.18.
      expect(decision?.behaviorId).toBe('hold_width');
      expect(decision?.utility).toBeCloseTo(0.5);
    }
  });

  it('skips behaviors that are ineligible, unweighted or for other play states', () => {
    const cfg: AIConfig = {
      ...DEFAULT_AI_CONFIG,
      roles: flatRoles({ hold_width: 1, find_space: 1, hold_depth: 1 }),
    };
    const ai = updateAI(state.ai, worldOf(state), cfg, [
      fixed('hold_width', 1, { eligible: () => false }),
      fixed('find_space', 1, { states: ['attacking'] }),
      fixed('offer_pass', 1),
      fixed('hold_depth', 0.3),
    ]);
    // Before anyone has the ball both teams are neutral, so only hold_depth remains.
    for (const decision of behaviors(ai)) expect(decision?.behaviorId).toBe('hold_depth');
  });

  it('falls back to holding the formation slot when nothing is available', () => {
    const ai = updateAI(state.ai, worldOf(state), DEFAULT_AI_CONFIG, []);
    for (const memory of Object.values(ai.players)) {
      expect(memory.decision?.behaviorId).toBe('hold_position');
      expect(memory.intent?.targetPosition).toEqual(
        ai.teams[memory.teamId]!.shape.anchors[memory.slot],
      );
    }
  });

  it('every built-in behavior scores within 0–1 for every role', () => {
    const run = finishTurn(setupMatch({ ball: { x: 42.3, y: 34 } }));
    for (const memory of Object.values(run.ai.players)) {
      expect(memory.decision).not.toBeNull();
      expect(memory.decision!.utility).toBeGreaterThan(0);
      expect(memory.decision!.utility).toBeLessThanOrEqual(1);
    }
    expect(new Set(ALL_BEHAVIORS.map((b) => b.id)).size).toBe(ALL_BEHAVIORS.length);
  });

  it('is deterministic: the same world gives the same decisions', () => {
    const a = updateAI(state.ai, worldOf(state), DEFAULT_AI_CONFIG);
    const b = updateAI(state.ai, worldOf(state), DEFAULT_AI_CONFIG);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const runA = finishTurn(finishTurn(setupMatch({ ball: { x: 42.3, y: 34 } })));
    const runB = finishTurn(finishTurn(setupMatch({ ball: { x: 42.3, y: 34 } })));
    expect(JSON.stringify(runA.players)).toBe(JSON.stringify(runB.players));
    expect(JSON.stringify(runA.ai)).toBe(JSON.stringify(runB.ai));
  });

  it('does nothing outside execution or when disabled', () => {
    expect(updateAI(state.ai, { ...worldOf(state), phase: 'planning' }, DEFAULT_AI_CONFIG)).toBe(
      state.ai,
    );
    expect(updateAI(state.ai, worldOf(state), { ...DEFAULT_AI_CONFIG, enabled: false })).toBe(
      state.ai,
    );
  });
});
