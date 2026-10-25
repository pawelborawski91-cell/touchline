# TOUCHLINE — Technical Specification

> These are **architectural targets**, not implemented features. Sprint 0 only fixes the numbers
> so every package is built against the same assumptions.

## Timing

| Parameter               | Target    | Notes                                                     |
| ----------------------- | --------- | --------------------------------------------------------- |
| Simulation rate         | 20 Hz     | Deterministic fixed-timestep loop in the match engine.    |
| Fixed timestep          | 0.05 s    | `MatchConfig.fixedDeltaTime`.                             |
| Turn duration           | 5 s       | `MatchConfig.turnDuration` — one execution phase.         |
| Ticks per turn          | 100       | `turnDuration / fixedDeltaTime`, see `getTicksPerTurn()`. |
| Rendering rate          | 60 FPS    | Renderer interpolates between simulation snapshots.       |
| Sim/render relationship | Decoupled | Rendering never drives or blocks the simulation.          |

## Pitch and coordinates

| Parameter   | Value                                                                      | Field                     |
| ----------- | -------------------------------------------------------------------------- | ------------------------- |
| Length      | 105 m                                                                      | `MatchConfig.fieldLength` |
| Width       | 68 m                                                                       | `MatchConfig.fieldWidth`  |
| Units       | metres                                                                     | All simulation positions. |
| Orientation | x axis along the length (goal line to goal line), y axis across the width. |

Defaults live in `DEFAULT_MATCH_CONFIG` (`@touchline/shared`) and are covered by unit tests.

## Camera and markers (Sprint 1)

| Parameter     | Value                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| Camera bounds | Pitch plus 4 m on every side (`PITCH_BOUNDS`, −4…109 × −4…72 m)         |
| Zoom range    | 1× (whole bounds fit the viewport) to 4×                                |
| Pan           | One finger, 1:1 with the finger, momentum (decay) clamped to the bounds |
| Pinch         | Zooms about the focal point; moving the fingers pans at the same time   |
| Double tap    | Zooms 2.5× towards the tap, or animates back to the full-pitch view     |
| Player marker | 13 px radius in screen space, shirt number, facing pointer, shadow      |
| Ball          | 5.5 px radius in screen space, shadow                                   |
| Line width    | `max(1.5 px, 0.12 m)` on screen                                         |

Camera state lives in Reanimated shared values; gestures run as UI-thread worklets and do not
cause React re-renders.

## Platforms

- iOS and Android, landscape only (locked in `app.json`, `ios.requireFullScreen` so iPad honours
  the lock).
- Expo SDK 58, React Native 0.88 (New Architecture), Hermes.
- Expo development builds (`expo-dev-client`) are the primary target because Skia, Reanimated,
  Gesture Handler and SQLite are native modules.

## Toolchain

| Concern         | Choice                                                    |
| --------------- | --------------------------------------------------------- |
| Language        | TypeScript 6, `strict`, `noUncheckedIndexedAccess`        |
| Package manager | pnpm workspaces (isolated `node_modules`)                 |
| Mobile runtime  | Expo, React Native                                        |
| 2D rendering    | `@shopify/react-native-skia`                              |
| Input/animation | `react-native-gesture-handler`, `react-native-reanimated` |
| UI state        | Zustand (UI only, never simulation state)                 |
| Local storage   | `expo-sqlite`                                             |
| Tests           | Vitest                                                    |
| Lint / format   | ESLint (flat config, typescript-eslint), Prettier         |
