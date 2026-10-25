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

| Package                   | Responsibility                                                               | Status (Sprint 1)                                                      |
| ------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `@touchline/shared`       | Common domain types (`Vector2`, `PlayerState`, `MatchSnapshot`, …) and data. | Types, field constants, `DEFAULT_MATCH_CONFIG`, initial 4-3-3 fixture. |
| `@touchline/physics`      | Movement integration, collisions, ball physics. No rendering knowledge.      | Empty.                                                                 |
| `@touchline/match-engine` | Authoritative fixed-timestep simulation; produces snapshots.                 | Empty.                                                                 |
| `@touchline/planning`     | Building and validating player commands and trajectories during planning.    | Empty.                                                                 |
| `@touchline/renderer`     | Skia rendering of snapshots, camera, world↔screen transforms.                | Pitch, goals, player and ball markers, pan/pinch camera (see below).   |
| `@touchline/mobile`       | Screens, input, UI state, persistence; wires packages together.              | Match screen: info bar, `MatchView`, status label.                     |

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

Declared today: `mobile → shared, renderer`, `physics → shared`, `match-engine → shared, physics`,
`planning → shared`, `renderer → shared`. The renderer additionally declares Skia, React, React
Native, Reanimated and Gesture Handler as **peer** dependencies (dev copies pinned to the app's
exact versions so pnpm links a single install).

Rules:

1. `match-engine` must not depend on React, React Native, Expo, Skia, Zustand, or any UI package.
   It may depend only on `shared` and `physics`.
2. `physics` is independent from rendering and may depend only on `shared`.
3. `shared` depends on nothing in the workspace.
4. `planning` will own player commands and trajectories; it depends only on `shared`. Command
   _types_ that the engine consumes belong in `shared`, so the engine never imports `planning`.
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
    ├── components/        MatchView, Pitch, Goal, PlayerMarker, BallMarker
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

- The match engine is a pure TypeScript state machine, advanced in fixed 0.05 s ticks. It runs
  identically in Node (tests, future server) and on device.
- After ticks, the engine exposes immutable **snapshots** (positions, velocities, phase, …).
- The renderer interpolates between snapshots at display rate (60 FPS) and draws with Skia. It
  holds no authoritative state.
- UI (React components + Zustand) reads snapshots for display and turns user input into planning
  commands; it never edits simulation state directly.

## Planned data flow

```
 user input ──► planning (commands, trajectories) ──► command data (shared types)
                                                            │
                                                            ▼
                     MatchConfig ──► match-engine ◄── physics
                                         │
                                         ▼ immutable snapshots (100 per turn)
                                     renderer (Skia, 60 FPS interpolation)
                                         │
                                         ▼
                                   mobile screens  ◄──► Zustand (UI state only)
```

Persistence (`expo-sqlite`) lives in the mobile app and stores serialized configs/results, not live
engine objects.
