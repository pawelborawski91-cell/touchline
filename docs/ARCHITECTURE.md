# TOUCHLINE — Architecture

## Monorepo layout

```
touchline/
├── apps/
│   └── mobile/            @touchline/mobile — Expo app (UI shell only)
│       ├── App.tsx
│       ├── app.json
│       ├── assets/
│       └── src/{components,screens,hooks,stores,theme}/
├── packages/
│   ├── shared/            @touchline/shared — domain types + small utilities
│   ├── physics/           @touchline/physics — rendering-independent player physics
│   ├── ball-engine/       @touchline/ball-engine — ball physics, contact, possession, kicks
│   ├── player-ai/         @touchline/player-ai — autonomous player and team AI (intents only)
│   ├── match-engine/      @touchline/match-engine — authoritative simulation
│   ├── planning/          @touchline/planning — commands and trajectories
│   └── renderer/          @touchline/renderer — Skia drawing of snapshots
├── tests/                 Vitest suites (workspace + package tests)
└── docs/                  GDD, architecture, technical spec
```

Every package is a pnpm workspace member that exposes its TypeScript source directly
(`"main"`/`"exports"` → `./src/index.ts`). There is no build step: Metro, Vitest and `tsc` all
consume the source.

## Package responsibilities

| Package                   | Responsibility                                                               | Status (Sprint 6)                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@touchline/shared`       | Common domain types (`Vector2`, `PlayerState`, `MatchSnapshot`, …) and data. | Types, field constants, movement and technical attributes, ball and kick types, commands, fixture.         |
| `@touchline/physics`      | Player movement integration. No rendering knowledge.                         | Vector/angle maths, steering, player movement integrator, path follower, movement modes, stamina.          |
| `@touchline/ball-engine`  | The ball as an independent body: flight, rolling, contact, possession.       | Flight/bounce/ground integrators, swept player contact, possession and contests, dribble touches, kicks.   |
| `@touchline/player-ai`    | Decisions for players without a command: utility AI, team shape, roles.      | Perception, utility evaluator, 25 behaviors, 8 role profiles, 3 formations, team shape, debug summary.     |
| `@touchline/match-engine` | Authoritative fixed-timestep simulation; produces snapshots.                 | Simulation state and step, turn controller, ball and AI coordination, clock, interpolation, `MatchEngine`. |
| `@touchline/planning`     | Building and validating player commands and trajectories during planning.    | Path sampling/validation, planning UI state machine, gesture arbitration; re-exports commands.             |
| `@touchline/renderer`     | Skia rendering of snapshots, camera, world↔screen transforms.                | Pitch, markers (live frames), ball with height/shadow/trail, paths, kick lines, ball and AI debug layers.  |
| `@touchline/mobile`       | Screens, input, UI state, persistence; wires packages together.              | Match screen: planning, kick aiming, execution loop, turn controls, debug overlay, ball VIZ, AI view.      |

## Dependency boundaries

Allowed workspace dependencies (arrows point at the dependency):

```
mobile        ──► shared, physics, ball-engine, player-ai, match-engine, planning, renderer
renderer      ──► shared
planning      ──► shared
match-engine  ──► shared, physics, ball-engine, player-ai
player-ai     ──► shared, ball-engine
ball-engine   ──► shared
physics       ──► shared
shared        ──► (nothing)
```

Declared today: `mobile → shared, match-engine, planning, renderer`, `physics → shared`,
`ball-engine → shared`, `player-ai → shared, ball-engine`,
`match-engine → shared, physics, ball-engine, player-ai`,
`planning → shared`, `renderer → shared`. The renderer additionally declares Skia, React, React
Native, Reanimated and Gesture Handler as **peer** dependencies (dev copies pinned to the app's
exact versions so pnpm links a single install).

Rules:

1. `match-engine` must not depend on React, React Native, Expo, Skia, Zustand, or any UI package.
   It may depend only on `shared`, `physics`, `ball-engine` and `player-ai`.
2. `physics` and `ball-engine` are independent from rendering and from each other, and may depend
   only on `shared`. The ball engine sees players only as `PlayerState` values passed in; it never
   moves them.
3. `player-ai` may depend only on `shared` and `ball-engine` (possession types and ball helpers),
   never on the match engine, physics, planning, the renderer or any UI/platform package. It
   decides; it never moves players or touches commands.
4. `shared` depends on nothing in the workspace.
5. `planning` owns the planning interaction (drawing, validation, UI state machine); it depends
   only on `shared`. The command model and its manager live in `shared` (`shared/src/commands`)
   because the engine consumes them, so the engine never imports `planning`; `planning`
   re-exports them for UI code.
6. `renderer` contains the Skia rendering logic. It reads `MatchSnapshot`s and never mutates them,
   and it may depend only on `shared` (never on the engine, physics or planning).
7. Zustand stores (in `apps/mobile/src/stores`) hold UI state only — selection, panels —
   never authoritative simulation state. Camera state is per-frame view state and lives in
   Reanimated shared values inside the renderer, not in Zustand or React state.
8. No `any`; public APIs use explicit interfaces.
9. No circular dependencies.

### Enforcement

- **pnpm isolated installs** — a package can only resolve what its own `package.json` declares, so
  an undeclared dependency fails to resolve in `tsc`, Vitest and Metro.
- **ESLint `no-restricted-imports`** (`eslint.config.mjs`) — blocks React/React Native/Expo/Skia/
  Zustand and disallowed workspace packages from `shared`, `physics`, `ball-engine`,
  `player-ai` and `match-engine`; blocks
  Zustand and engine/physics/planning/app imports from the whole renderer; and blocks platform
  imports from the renderer's pure core (`core.ts`, `ai/`, `ball/`, `camera/cameraTransforms.ts`,
  `coordinates/`, `types/`).
- **`tests/workspace.test.ts`** — asserts each manifest only declares allowed workspace edges, that
  `shared`/`physics`/`ball-engine`/`player-ai`/`match-engine` declare no UI/platform dependencies, and that the workspace
  graph is acyclic.

## Renderer

```
packages/renderer/
├── assets/fonts/          Barlow Semi Condensed Bold (OFL) for shirt numbers
└── src/
    ├── core.ts            platform-free entry (`@touchline/renderer/core`)
    ├── index.ts           full entry: core + Skia components + camera hook
    ├── types/renderer.ts  WorldPoint, ScreenPoint, Viewport, CameraState, ViewTransform, …
    ├── coordinates/       worldToScreen, screenToWorld (+ length conversions)
    ├── camera/
    │   ├── cameraTransforms.ts  fit scale, view transform, zoom/centre clamping, pan, focal zoom
    │   └── CameraController.ts  useCameraController: shared values + pan/pinch/double-tap
    ├── ai/                aiDebugScene: AI debug summary → frame-indexed drawing data (pure)
    ├── ball/              ballProjection: lift, shadow, trail, frame reading (pure worklets)
    ├── components/        MatchView, Pitch, Goal, PlayerMarker, BallMarker, BallDebugLayer,
    │                      AIDebugLayer,
    │                      planning/ paths, kick lines + ring
    └── theme/palette.ts   pitch colours and team marker kits
```

- **World space** is metres: x along the 105 m length, y across the 68 m width, origin at the
  top-left corner flag. Player, ball and marking geometry never leave world space.
- **View transform**: `screen = world × scale + translate`, where
  `scale = fitScale(viewport, bounds) × zoom` and the translate puts the camera centre at the
  viewport centre. `bounds` is the pitch plus a 4 m surround (room for goals and markers).
- `MatchView` draws one Skia `Group` whose transform is the view transform, so the pitch, goals and
  markers are all authored in metres. Markers counter-scale by `1 / scale` so they stay a constant
  size on screen (radius 13 px; ball 5.5 px). Line widths are `max(1.5 px, 0.12 m)`.
- **Ball**: drawn from the live frame at its true simulated position (never attached to a marker).
  The shadow sits at the ground position (x, y); the ball is raised up the screen by
  `28 px · ln(1 + h / 2 m)` for underside height h, slightly enlarged, with a thin stalk to the
  shadow above 0.25 m. The shadow widens and fades with height. Balls faster than 4 m/s get a
  short trail extrapolated back along their velocity. All sizes are screen pixels, so the ball reads
  the same at every zoom. `BallDebugLayer` (VIZ) adds the velocity vector, a predicted trajectory
  (arc and ground track) and reach/body circles.
- **AI view**: `buildAIDebugScene` (platform-free) turns the AI's debug summary into frame indices,
  targets and labels; it accepts any structurally matching data, so the renderer still depends
  only on `shared`. `AIDebugLayer` draws team shape boxes, defensive lines and anchors (static per
  update) and the live parts from the frame on the UI thread: intent arrows, presser → carrier
  arrows, dashed marker → mark lines and behavior labels. Drawing never touches the simulation.
- The camera never touches match data: the snapshot flows in as a prop and is only read.
- All camera maths are pure functions marked `'worklet'`, so the same code runs on the UI thread in
  gesture callbacks and in Node under Vitest.

## Simulation / rendering separation

- The match engine is a pure TypeScript state machine, advanced in fixed 0.05 s ticks (20 Hz).
  It runs identically in Node (tests, future server) and on device. Every step returns a new
  immutable `SimulationState`; identical inputs give identical results.
- `MatchEngine.advanceFrame(realDt)` feeds real frame time into an accumulator
  (`SimulationClock`): frames longer than 0.25 s are clamped, at most 5 steps run per frame, and
  the remainder is the interpolation factor. Frame rate never changes the result.
- The app's render loop (`useMatchEngine`, `requestAnimationFrame`, only while executing and not
  suspended) calls `advanceFrame`, then `writeFrame` copies interpolated
  `[x, y, facing, waypointIndex]` per player (`PLAYER_FRAME_STRIDE = 4`) followed by the ball's
  `[x, y, z, vx, vy, vz]` (`BALL_FRAME_SIZE = 6` at `ballFrameOffset(playerCount)`) into a
  Reanimated shared value. Markers, the selection ring and remaining-route paths read it on the UI thread, so
  movement needs no React re-render. The countdown and debug readout subscribe to simulation
  ticks (`subscribeTicks` / `getTurnSnapshot`), not to a UI timer.
- UI (React components + Zustand) reads the engine view for display and turns user input into
  engine requests (`planMovement`, `replaceCommand`, `cancelCommand`, `planKick`, `cancelKick`,
  `placeBall`, `commitPlans`). It never
  edits simulation state; invalid requests throw descriptive errors that the UI shows as notices.

## Match lifecycle (Sprint 4)

One `MatchEngine` per match owns the single clock, the single `MatchPhase` and the single command
book.

```
            commitPlans()                100 ticks elapsed (turn + 1)
 planning ───────────────► execution ───────────────────────────► planning
    │                          │ callStoppage()                       ▲
    │ finishMatch()            ▼                                      │
    ▼                       stoppage ─────── endStoppage() (turn + 1) ┘
 finished
```

- `MatchPhaseMachine` lists the legal transitions; anything else throws `PhaseTransitionError`
  ("Cannot … : the match cannot go from X to Y"). Actions in the wrong phase throw
  `MatchStateError`.
- `TurnController` is tick-authoritative: `turnDuration / fixedDeltaTime` must be a whole number
  of ticks (5 s / 0.05 s = 100). The turn starts at 1 and increments on each return to planning.
  `getTurnSnapshot` gives a read-only view (turn, phase, tick, turn tick, elapsed, remaining,
  progress, team commits).
- **Planning freeze**: `stepExecution` throws outside execution and `advanceFrame` is a no-op, so
  positions, velocities, facing and stamina cannot change while planning.
- **Commit**: `commitPlans` validates every live plan (at least 2 finite points, inside the pitch
  ±0.5 m), marks every `TeamCommitState` committed, prunes commands that finished before the
  previous turn, re-anchors each queued path's first point to the player's actual position, and
  activates queued commands. `commitTeam` is the per-team form; execution starts once all teams
  have committed. There is only one local controller (both teams are committed from one device;
  no networking), but per-team commit state is already in place for multiplayer.
- **Backgrounding** is not a phase. `suspend()` holds the clock (the phase stays `execution`),
  and nothing is simulated however long the app is away. `resume()` (the RESUME button)
  continues from the same tick, so a complete turn is always exactly 100 ticks.

### Persistent commands

- Turn end does **not** pause, reset or recreate commands: active commands stay `active`, queued
  ones stay `queued`, and players keep position, velocity, facing and stamina.
- Path progress lives in `SimulationState.pathStates[commandId]` (`PathExecutionState`:
  `currentWaypointIndex`, `distanceAlongPath`, `progress`, `isFinalWaypoint`). It is monotonic
  (never decreases) and is never recalculated from the start of the path.
- Command transitions are validated (`COMMAND_TRANSITIONS`): draft → queued/cancelled;
  queued → active/cancelled; active → completed/cancelled/paused/interrupted;
  paused → active/cancelled/interrupted. `completed`, `cancelled` and `interrupted` are terminal.
  An illegal transition throws `CommandTransitionError`. A player has at most one active and one
  queued movement command.
- **Replacement rule**: a new plan for a player supersedes their live command. A replaced
  _queued_ command becomes `cancelled`; a replaced _active_ or _paused_ command becomes
  `interrupted`. The new command starts from the player's actual position with their velocity
  preserved; it inherits the old command's pace unless one is given. An explicit cancel is
  always `cancelled`.
- Commands carry `startedTurn` / `endedTurn`, so the planning screen can show what finished in
  the previous turn. Those stay visible until the next commit prunes them.
- A stoppage pauses active commands (`paused`); the next commit resumes them.
- Path colours: draft bright cyan; queued cyan with a clear endpoint; active solid lime; paused
  muted amber; completed subtle grey; cancelled and interrupted only in debug mode. Active and
  paused routes draw only the remaining part, from the player, with the current waypoint marked.

## Ball engine (Sprint 5)

`@touchline/ball-engine` simulates one ball as an independent rigid sphere. SI units throughout;
`BallState.position.z` is the height of the ball's centre (a resting ball has `z = radius`,
0.11 m). Everything is a pure function of `(BallSimulationState, players before, players after,
BallConfig, dt)`; the `BallEngine` class (`getState`, `update(players, dt)`, `kick`,
`getPossession`) wraps the same functions with a fixed-step accumulator for headless use.

```
packages/ball-engine/src/
├── BallConfig.ts          tuning (air, bounce, ground, contact, control, dribble, contest, kick presets)
├── BallState.ts           BallSimulationState, BallEvent, PossessionSnapshot, mutable BallBody scratch
├── BallFlight.ts          gravity, quadratic drag, Magnus, spin decay, bounce with restitution + friction
├── BallGroundMovement.ts  skid friction → rolling, rolling resistance + grass drag, comes to rest
├── BallPhysics.ts         integrateBall (air or ground), out-of-bounds test, trajectory prediction
├── BallCollision.ts       swept ball-vs-player tests (reach and body circles), deflection
├── PossessionManager.ts   control limits, cushioning, contest scoring
├── BallController.ts      dribble touches, kick validation and launch, kick power from distance
└── BallEngine.ts          stepBall (the per-tick order below) and the BallEngine wrapper
```

- **Flight**: semi-implicit Euler with gravity, drag `a = −k|v|v` (k = 0.012 /m), Magnus
  `a = 0.004 · ω × v` and 10 %/s spin decay. Landing (centre at the radius) reflects the vertical
  speed with restitution 0.55 and removes 30 % of the contact-point slip (backspin checks,
  topspin kicks on). Landings under 0.9 m/s settle the ball on the grass.
- **Ground**: while the contact point slips, kinetic friction (μ = 0.4) drives the ball towards
  pure rolling (`ω = v / r`); then rolling resistance (0.055 g) plus grass drag (0.2 /s) slow it.
  It stops exactly when a step would reverse it; sidespin decays at 2 /s. A 10 m/s roll travels
  ≈ 29 m in ≈ 7.8 s.
- **Player contact**: each player has a reach circle (0.85 m) and a body circle (0.35 m + ball
  radius). The ball's step motion is tested relative to each player's motion over the same step
  (swept circles), so neither a fast ball nor a running player can tunnel. A squared-distance
  broadphase rejects far players. Only the earliest contact of a step is resolved: the controller
  touches it on; a player who can control it takes control (cushioning 60–95 % of the relative
  velocity); anyone else deflects it (restitution 0.3, only while approaching, pushed out to the
  surface). Balls with their underside above 1.9 m pass over players; above 0.9 m they cannot be
  controlled.
- **Possession** (`free | controlled | contested | out_of_play`): control needs the ball low and
  slow enough relative to the player (`4 + 10 · ballControl` m/s). It is lost when the ball gets
  1.8 m away or flies over the player. Opponents within 1.5 m of a low ball contest it; the score
  `0.4·closeness + 0.2·agility + 0.15·technique + 0.25·ballControl − 0.02·relative speed`
  (+0.05 for the current controller, ties to the lower id) picks the winner, who takes control if
  within reach. Teammates never take the ball from each other. No randomness anywhere.
- **Dribbling**: no attachment. Every 0.3 s (or when the ball hits the controller's body) the
  controller touches the ball towards where they will be at the next touch (extrapolating their
  current acceleration, so the ball is held back when they brake) plus 0.65 m ahead. A ball behind
  them is worked round to their side. The velocity change per touch is capped at
  `3 + 6 · technique` m/s, so sharp turns and bursts can lose the ball.
- **Kicks** (`KickRequest {playerId, type, direction, power, lift}`): validated (ball within 1 m,
  underside ≤ 0.7 m, not controlled by another player, relative speed ≤ 18 m/s, power and lift
  in 0–1), then the ball's velocity is set from the type's preset (power → speed range, lift →
  launch-angle range) with the preset's spin, control is released, the kicker becomes the last
  toucher and cannot re-control it for 0.4 s. Presets: pass 5–18 m/s, 0–12°, rolling; shot
  16–30 m/s, 0–22°, topspin; clearance 18–29 m/s, 22–45°, backspin; lob 8–22 m/s, 38–60°, strong
  backspin. `suggestKickPower` bisects a power for a distance using the same integrator.
- **Out of play**: once the whole ball has crossed a touchline or goal line (no goal detection
  yet), possession becomes `out_of_play` and an `out_of_play` event is emitted. The ball keeps
  flying freely but no longer interacts.

### Per-tick order (match engine)

`stepExecution` runs, in order: (0) the player AI decides (`advanceAI`, see Player AI); (1)
players move (`stepPlayers`): an active command drives its player, otherwise his AI intent,
otherwise he brakes; (2) kick orders fire — `PlannedKick`s whose player can now strike the ball, aimed from the ball
at the target, power from distance unless given; (3) `stepBall` — dribble touch, free motion,
earliest player contact, loss of control, contests, out of play; (4) tick and turn counters
advance; an `out_of_play` event calls a stoppage (pausing commands), otherwise the turn ends
after 100 ticks. The ball engine never reads the match engine and the match engine never reaches
into the ball engine's internals, so there is no circular dependency.

- **Planning freeze**: the ball only advances in `stepExecution`. Kicks are therefore ordered
  during planning (`planKick`) and fire in execution; `kickBall`/`MatchEngine.kick` strike
  immediately but only during execution. `placeBall` (planning only) is a debug stand-in for
  restarts.
- **Persistence**: `SimulationState.ball`, `plannedKicks` and `recentEvents` are carried across
  turn boundaries untouched: position, velocity, spin, possession and last touch never reset.
- The view (`EngineView.ball`, `plannedKicks`) changes when possession, controller, last touch or
  out-of-play change, not on every tick; `getDebugInfo().ball` gives the full readout.

## Player AI (Sprint 6)

`@touchline/player-ai` decides for every player without an active command. It is pure,
deterministic TypeScript: `updateAI(state, world, config)` reads a read-only `AIWorld` (tick,
phase, players, ball, possession snapshot, ids under manual control) and returns a new immutable
`AIState`. It produces **movement intents** (`MovementIntent {targetPosition, movementMode,
behaviorId, priority, arrivalRadius, exitSpeed}`), never commands, positions or velocities; the
match engine executes them with the same steering and movement integrator as commands, including
stamina. No fake commands are ever created.

```
packages/player-ai/src/
├── core/          AIController (updateAI), AIContext, AIDecision (types), AIConfig,
│                  UtilityEvaluator (score, select, persist), AIState, AIDebug (describeAI)
├── perception/    BallPerception (prediction, intercept), PlayerPerception, TeamPerception
│                  (possession memory, play state, assignments), SpatialGrid (10 m cells)
├── behaviors/     general/ attacking/ defending/ transition/ (25 behaviors)
├── roles/         RoleProfile + GK, CB/FB, DM/CM/AM, WG, ST profiles and GoalkeeperAI
├── tactics/       Formation (4-3-3, 4-4-2, 4-2-3-1), TeamTactics (shape per play state), TeamShape
└── navigation/    PositionTargeting (clamp, leash, goal-side, spacing, space/lane scores, pace)
```

- **Control modes**: `manual` (an active command: the AI still evaluates in the background but
  produces no intent), `autonomous`, `inactive` (reserved for injuries/dismissals; no intent, the
  player brakes; `setPlayerActive` is a planning action). When a command completes, the player is
  re-evaluated on the next tick and continues from his current velocity.
- **Team play state** (`attacking`, `defending`, `transition_attack`, `transition_defense`,
  `neutral`) follows actual possession: the controller's team, or the last toucher of a ball
  still travelling ≥ 3 m/s (a pass). A contested ball stays with the holder, a loose ball for
  1 s, and the other team must keep the ball 8 ticks before possession changes (a tackle won
  straight back changes nothing). A confirmed turnover opens a 3 s transition window.
- **Team shape**: formation positions are normalised (`line` 0 own goal → 1 opponent goal,
  `horizontalPosition` −1 left → +1 right facing the opponent), mirrored for the team attacking
  −x. Per play state, `TeamTactics` sets the back line height and how far it follows the ball,
  depth and width scaling, lateral shift towards the ball, and a goal-side margin for the back
  four and holding midfielder. Anchors are clamped inside the pitch; shapes are cached per 1 m
  ball cell.
- **Assignments** (per team, every AI tick, each sticky with 3 m hysteresis): the chaser (best
  intercept time for a loose ball; the keeper only inside his box), one presser (nearest player
  whose zone reaches the carrier), a second presser right after losing the ball, a cover behind
  the presser, one-to-one marks (greedy, opponents in our 60 %, never two markers on one man),
  and two supporters for our carrier. Players who gain or lose a job re-evaluate at once.
- **Utility AI**: each behavior has play states, a priority, an eligibility check and an
  evaluation returning a raw 0–1 utility, a target and a pace. Final utility =
  `clamp01(raw) × role weight × global weight`. Selection adds 0.1 hysteresis to the current
  behavior, breaks ties (±0.01) by priority then id, and keeps the current behavior for 15 ticks
  after a switch unless the challenger is urgent (priority 3: carry, chase, press, protect goal),
  the current one is gone, or possession/play state changed. Targets persist unless they move
  more than 2 m (0.75 m for tracking targets) or are 2 s old. Positional targets are leashed to
  the anchor, kept 5 m from teammates and inside 2.5 m of the lines.
- **Cadence**: decisions at 4 Hz (every 5 ticks, staggered by player index); intents execute at
  20 Hz. Kicks, possession changes, a new controller, a sharp ball deflection, opponents entering
  the box and release from manual control force immediate re-evaluation.
- **Determinism and cost**: no randomness, fixed iteration orders, id tie-breaks. A uniform
  spatial grid answers neighbour queries; 22 players cost ≈ 0.1 ms per tick on average.
- **Turn cycle**: `advanceAI` runs only in `stepExecution`, so the AI is frozen during planning
  and stoppages; `SimulationState.ai` carries over turn boundaries untouched. The engine view
  is unchanged by AI ticks; `MatchEngine.getAIDebugInfo()` and `getDebugInfo().ai` read it.
- `MANUAL_ONLY_SIMULATION_CONFIG` disables the AI for tools and tests that exercise movement,
  commands or ball physics in isolation.

## Movement model (Sprint 3)

- **Attributes** (`PlayerMovementAttributes`): max speed 5.5–8.5 m/s, acceleration 2–4 m/s²,
  deceleration 3–6 m/s², agility 0.5–1, turning speed 180–360 °/s, stamina (endurance) 0–1.
- **Modes** cap speed at a share of max speed: walk 0.35, jog 0.55, run 0.80, sprint 1.0.
- **Integrator** (`stepMovement`): velocity always points along the heading. Each step turns the
  heading towards the desired direction at a speed-dependent rate, eases the target speed while
  misaligned, changes speed by at most acceleration·dt (tapering near top speed) or
  deceleration·dt, moves with semi-implicit Euler and clamps to the pitch.
- **Path follower**: targets the next waypoint (advancing inside a 1 m arrival radius or once
  passed, never snapping), limits speed so the player can brake for upcoming corners and for the
  end (`v = √(v_exit² + 2·a·0.85·d)`), and completes once within 0.25 m and below 0.1 m/s.
- **Commands**: `queued → active` at commit, `active → completed` on arrival; they persist
  across turn ends (see Match lifecycle).
- **Stamina** drains per mode (sprint fastest), never below 0; below 0.3 the top speed drops
  towards 70 %. No recovery or fatigue model yet.

## Data flow

```
 user input ──► planning (draw, validate, preview) ──► CommandAction (shared types)
                                                            │
                                                            ▼
                     MatchConfig ──► match-engine ◄── physics, ball-engine, player-ai
                                         │
                                         ▼ immutable states (100 ticks per turn)
      interpolated [x, y, facing, waypoint] × players + [x, y, z, vx, vy, vz] ball frame
                                + low-rate engine view
                                         │
                                         ▼
                     renderer (Skia, display-rate)   mobile screens ◄──► Zustand (UI state only)
```

Persistence (`expo-sqlite`) lives in the mobile app and stores serialized configs/results, not live
engine objects.
