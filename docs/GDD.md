# TOUCHLINE — Game Design Document

> Status: Sprint 0 (foundation). This document records the core concept and the design decisions
> already made. Anything not listed here is intentionally undecided.

## Core concept

TOUCHLINE is a mobile-first tactical football (soccer) game for iOS and Android. The player acts as
a hands-on coach on the touchline: matches are played in short turns where both sides plan
simultaneously, then watch those plans play out in continuous, simulated motion.

## Established design decisions

| Area             | Decision                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| Platforms        | iOS and Android, phone-first.                                                    |
| Orientation      | Landscape only.                                                                  |
| Format           | 11 vs 11.                                                                        |
| Pitch            | 2D, top-down, freeform (continuous positions, no grid), 105 m × 68 m.            |
| Turn structure   | Simultaneous planning phase, then a continuous execution phase.                  |
| Turn length      | Each execution phase simulates 5 seconds of match time.                          |
| Player control   | The user manually selects players and draws their trajectories.                  |
| Unselected units | Players without manual commands are driven by AI.                                |
| Simulation       | Custom TypeScript match engine, deterministic fixed timestep, independent of UI. |
| Rendering        | React Native Skia, consuming read-only snapshots of the simulation.              |

## Turn loop

1. **Planning** — both sides issue commands at the same time. The user selects players and draws
   trajectories; the simulation is paused.
2. **Execution** — the engine simulates the turn (5 s of match time) using the submitted commands,
   with AI filling in for players without commands. The renderer plays back the result.
3. **Stoppage** — out-of-play situations (fouls, throw-ins, goals, …) interrupt the flow.
4. **Finished** — the match has ended.

These map 1:1 to the `MatchPhase` type in `@touchline/shared`:
`"planning" | "execution" | "stoppage" | "finished"`.

## Out of scope (for now)

Networking/multiplayer, accounts/auth, monetization, career/management modes, 3D presentation, and
any gameplay rules beyond the concept above. These will be designed in later sprints.
