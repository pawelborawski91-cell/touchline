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

| Package                   | Responsibility                                                                  | Status (Sprint 0)                         |
| ------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| `@touchline/shared`       | Common domain types (`Vector2`, `PlayerState`, `MatchConfig`, …) and utilities. | Types, `DEFAULT_MATCH_CONFIG`, tick math. |
| `@touchline/physics`      | Movement integration, collisions, ball physics. No rendering knowledge.         | Empty.                                    |
| `@touchline/match-engine` | Authoritative fixed-timestep simulation; produces snapshots.                    | Empty.                                    |
| `@touchline/planning`     | Building and validating player commands and trajectories during planning.       | Empty.                                    |
| `@touchline/renderer`     | Skia rendering of engine snapshots.                                             | Empty.                                    |
| `@touchline/mobile`       | Screens, input, UI state, persistence; wires packages together.                 | Placeholder screen with Skia pitch.       |

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

Sprint 0 declares only the edges in use or committed to: `mobile → shared`, `physics → shared`,
`match-engine → shared, physics`, `planning → shared`, `renderer → shared`.

Rules:

1. `match-engine` must not depend on React, React Native, Expo, Skia, Zustand, or any UI package.
   It may depend only on `shared` and `physics`.
2. `physics` is independent from rendering and may depend only on `shared`.
3. `shared` depends on nothing in the workspace.
4. `planning` will own player commands and trajectories; it depends only on `shared`. Command
   _types_ that the engine consumes belong in `shared`, so the engine never imports `planning`.
5. `renderer` will contain Skia rendering logic. It reads engine snapshots and never mutates them.
6. Zustand stores (in `apps/mobile/src/stores`) hold UI state only — selection, panels, camera —
   never authoritative simulation state.
7. No `any`; public APIs use explicit interfaces.
8. No circular dependencies.

### Enforcement

- **pnpm isolated installs** — a package can only resolve what its own `package.json` declares, so
  an undeclared dependency fails to resolve in `tsc`, Vitest and Metro.
- **ESLint `no-restricted-imports`** (`eslint.config.mjs`) — blocks React/React Native/Expo/Skia/
  Zustand and disallowed workspace packages from `shared`, `physics` and `match-engine`.
- **`tests/workspace.test.ts`** — asserts each manifest only declares allowed workspace edges, that
  `shared`/`physics`/`match-engine` declare no UI/platform dependencies, and that the workspace
  graph is acyclic.

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
