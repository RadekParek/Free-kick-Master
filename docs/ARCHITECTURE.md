# Architecture

```text
src/
  main.ts                Browser entry and native lifecycle bridge
  state.ts               Validated local preferences, session statistics
  game/
    physics.ts           Deterministic SI-unit ball flight, aiming, walls, geometry tests
    keeper.ts            Five profiles, delayed anticipation, physical reach volumes
    simulation.ts        Shared live/test collision + outcome stepper
    stadium.ts           Original procedural pitch, goal/net, instanced stands/crowd
    player.ts            Articulated original player meshes and run/dive animation
    arena.ts             Three.js rendering, state machine, pointer aim, replay
    audio.ts             User-gesture-unlocked synthesized local audio
  ui/
    app.ts               Accessible DOM controls, settings/help/challenges, statistics
    styles.css           Responsive desktop, portrait, compact Android landscape
android/                 Native offline Capacitor host and Gradle wrapper
```

## Shot state machine

`ready → charging → runup → flight → result → ready`

`result → replay → result` plays recorded snapshots without invoking result/statistics logic again. Charging can be cancelled on pointer cancellation, lost focus, modal open, or app backgrounding. Opening a native dialog pauses the arena. Visibility changes clear frame timing to prevent catch-up shots on return.

A shot setup is captured at release. Setup controls are disabled through charging/run-up/flight/replay so ball/wall/keeper settings cannot change mid-flight. Challenge placement and defense are additionally locked for the five-shot round. Returning to free practice restores the pre-challenge setup.

## Time and determinism

Physics advances at 120 Hz. Render frames add to an accumulator; the maximum render delta is 50 ms to avoid a spiral of death after a stall. Replay snapshots are captured every other physics step (60 Hz) and never re-run the keeper's decisions. Strongly underpowered attempts terminate after 5 simulated seconds.

All gameplay physics and goal/save decisions are deterministic. Randomness is confined to procedural visuals and synthesized noise audio. The turf/crowd generators use fixed seeds.

## Mobile/performance

A single WebGL renderer is resized with `ResizeObserver`. Quality limits DPR (1.75 / 1.25 / 1.0); Performance turns off shadow maps. Seats and crowd use instancing. Goal-net deformation only runs briefly after a goal. Assets are generated locally or bundled, with no model/texture requests. Android haptics are called only on the native platform and gracefully tolerate unsupported devices.

## Data

Only preferences, personal-best streak, and per-challenge personal bests are stored in localStorage. Malformed/missing storage is ignored. Session attempts are in memory. There is no database, telemetry, remote API, account, or payment flow.

## Testing

- Unit tests exercise the exact shared physics/keeper stepper: power/spin sensitivity, deterministic knuckle flight, preview agreement, geometry and swept collisions, valid placement, difficulty ordering, scoreable/saveable scenarios, and finite resolution across extreme positions.
- Chromium tests use a real WebGL canvas, interact through the actual DOM, score/replay/reset a shot, test pause cancellation and challenge setup, and exercise a real CDP touch gesture plus portrait/landscape bounds.
- APK compilation and Android lint run in `.github/workflows/android.yml`. Physical-device graphics/performance validation remains a separate required release step.
