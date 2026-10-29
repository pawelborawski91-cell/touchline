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
│   ├── physics/           @touchline/physics — rendering-independent physics
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

| Package                   | Responsibility                                                               | Status (Sprint 3)                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `@touchline/shared`       | Common domain types (`Vector2`, `PlayerState`, `MatchSnapshot`, …) and data. | Types, field constants, movement attributes and modes, command model and manager, 4-3-3 fixture.  |
| `@touchline/physics`      | Movement integration, collisions, ball physics. No rendering knowledge.      | Vector/angle maths, steering, player movement integrator, path follower, movement modes, stamina. |
| `@touchline/match-engine` | Authoritative fixed-timestep simulation; produces snapshots.                 | Simulation state and step, turn controller, fixed-timestep clock, interpolation, `MatchEngine`.   |
| `@touchline/planning`     | Building and validating player commands and trajectories during planning.    | Path sampling/validation, planning UI state machine, gesture arbitration; re-exports commands.    |
| `@touchline/renderer`     | Skia rendering of snapshots, camera, world↔screen transforms.                | Pitch, markers (live frames), movement paths, selection ring, pan/pinch camera.                   |
| `@touchline/mobile`       | Screens, input, UI state, persistence; wires packages together.              | Match screen: planning, execution loop, turn controls, debug overlay.                             |

## Dependency boundaries

Allowed workspace dependencies (arrows point at the dependency):

```
mobile        ──► shared, physics, match-engine, planning, renderer
renderer      ──► shared
planning      ──► shared
match-engine  ──► shared, physics
physics       ──► shared
shared        ──► (nothing)
```

Declared today: `mobile → shared, match-engine, planning, renderer`, `physics → shared`, `match-engine → shared, physics`,
`planning → shared`, `renderer → shared`. The renderer additionally declares Skia, React, React
Native, Reanimated and Gesture Handler as **peer** dependencies (dev copies pinned to the app's
exact versions so pnpm links a single install).

Rules:

1. `match-engine` must not depend on React, React Native, Expo, Skia, Zustand, or any UI package.
   It may depend only on `shared` and `physics`.
2. `physics` is independent from rendering and may depend only on `shared`.
3. `shared` depends on nothing in the workspace.
4. `planning` owns the planning interaction (drawing, validation, UI state machine); it depends
   only on `shared`. The command model and its manager live in `shared` (`shared/src/commands`)
   because the engine consumes them, so the engine never imports `planning`; `planning`
   re-exports them for UI code.
5. `renderer` contains the Skia rendering logic. It reads `MatchSnapshot`s and never mutates them,
   and it may depend only on `shared` (never on the engine, physics or planning).
6. Zustand stores (in `apps/mobile/src/stores`) hold UI state only — selection, panels —
   never authoritative simulation state. Camera state is per-frame view state and lives in
   Reanimated shared values inside the renderer, not in Zustand or React state.
7. No `any`; public APIs use explicit interfaces.
8. No circular dependencies.

### Enforcement

- **pnpm isolated installs** — a package can only resolve what its own `package.json` declares, so
  an undeclared dependency fails to resolve in `tsc`, Vitest and Metro.
- **ESLint `no-restricted-imports`** (`eslint.config.mjs`) — blocks React/React Native/Expo/Skia/
  Zustand and disallowed workspace packages from `shared`, `physics` and `match-engine`; blocks
  Zustand and engine/physics/planning/app imports from the whole renderer; and blocks platform
  imports from the renderer's pure core (`core.ts`, `camera/cameraTransforms.ts`, `coordinates/`,
  `types/`).
- **`tests/workspace.test.ts`** — asserts each manifest only declares allowed workspace edges, that
  `shared`/`physics`/`match-engine` declare no UI/platform dependencies, and that the workspace
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
    ├── components/        MatchView, Pitch, Goal, PlayerMarker, BallMarker, planning/ paths + ring
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
  `[x, y, facing, waypointIndex]` per player (`PLAYER_FRAME_STRIDE = 4`) into a Reanimated shared
  value. Markers, the selection ring and remaining-route paths read it on the UI thread, so
  movement needs no React re-render. The countdown and debug readout subscribe to simulation
  ticks (`subscribeTicks` / `getTurnSnapshot`), not to a UI timer.
- UI (React components + Zustand) reads the engine view for display and turns user input into
  engine requests (`planMovement`, `replaceCommand`, `cancelCommand`, `commitPlans`). It never
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
  no networking or AI), but per-team commit state is already in place for multiplayer.
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
                     MatchConfig ──► match-engine ◄── physics
                                         │
                                         ▼ immutable states (100 ticks per turn)
                       interpolated [x, y, facing, waypoint] frame + low-rate engine view
                                         │
                                         ▼
                     renderer (Skia, display-rate)   mobile screens ◄──► Zustand (UI state only)
```

Persistence (`expo-sqlite`) lives in the mobile app and stores serialized configs/results, not live
engine objects.
