# Architecture

```text
src/
  main.ts                Browser entry and native lifecycle bridge
  state.ts               Validated local preferences, session statistics
  players.ts             15 placeholder roster players plus 15 turquoise specials; photo provenance for four
  game/
    physics.ts           Deterministic SI-unit ball flight, aiming, walls, geometry tests
    keeper.ts            Five profiles, delayed anticipation, physical reach volumes
    simulation.ts        Shared live/test collision + outcome stepper
    stadium.ts           Pitch, net, three atmospheres, batched stands, Mexican-wave crowd energy, flags and confetti
    player.ts            Articulated athletes at high and low detail under THREE.LOD (switch at 30 m)
    arena.ts             Three.js rendering, state machine, pointer aim, replay
    audio.ts             User-gesture-unlocked synthesized local audio
  ui/
    app.ts               Screen router: menu, full-screen game, full-screen settings, modal roster/challenges/help
    styles.css           Menu, full-screen HUD, scrolling settings, roster modal, portrait and landscape layouts
    player-card.ts       Collectible-style card (standard and turquoise special) and compact HUD markup
    brand.ts / svg.ts    Original FK logo and pitch/contact SVG graphics
public/players/          Licensed offline WebP portraits and attribution
public/textures/         Generated anonymous crowd texture
android/                 Native offline Capacitor host and Gradle wrapper
```

## Shot state machine

`ready → charging → runup → flight → result → ready`

`result → replay → result` plays recorded snapshots without invoking result/statistics logic again. Charging can be cancelled on pointer cancellation, lost focus, modal open, or app backgrounding. Opening a native dialog pauses the arena. Visibility changes clear frame timing to prevent catch-up shots on return.

A shot setup is captured at release. Setup controls are disabled through charging/run-up/flight/replay so ball/wall/keeper settings cannot change mid-flight. Challenge placement and defense are additionally locked for the five-shot round. Returning to free practice restores the pre-challenge setup.

## Time and determinism

Physics advances at 120 Hz. Render frames add to an accumulator; the maximum render delta is 100 ms to avoid a spiral of death after a stall. Replay snapshots are captured every other physics step (60 Hz) and never re-run the keeper's decisions. Strongly underpowered attempts terminate after 5 simulated seconds.

All gameplay physics and goal/save decisions are deterministic. Randomness is confined to procedural visuals and synthesized noise audio. The turf/crowd generators use fixed seeds.

## Mobile/performance

A single WebGL renderer is resized with `ResizeObserver`. Base DPR caps are 1.5 / 1.25 / 1.0. High uses 2048 px shadow maps, Balanced uses 1024 px, and Performance disables dynamic shadows. Material programs are invalidated when shadow quality changes.

- Static stadium geometry is merged per shared material/shadow state. Rigid player parts are batched per articulated bone/material.
- Distant crowds use a generated texture on upright row strips merged into one mesh. Procedural instanced spectators remain an asset-load fallback, not a second visible crowd.
- The trajectory guide and shot trace reuse bounded typed-array GPU buffers. Defensive-wall positions are cached rather than allocated on every physics tick.
- Idle ready/settled-result scenes render at 30 Hz; active shots render at the display rate. Idle shadow refresh is throttled. Dialogs and backgrounding pause rendering/simulation.
- Rendering always uses the native device pixel ratio; there is no adaptive downscaling. Performance comes from batching, distance-based LOD (high/low athlete rigs), spatial batching of stands, and culling. The on-screen monitor reports measured FPS, draw calls and the native pixel ratio.
- The shot-local camera and taker positioning handle wide angles and portrait phones without cropping the entire kicker out of view.
- Goal-net deformation runs only briefly after a goal. All fonts, portraits, crowd imagery, scripts, and audio generation are local/offline assets. Android haptics tolerate unsupported hardware.

Software-WebGL test-worker throughput is not representative of an Android GPU. Hardware performance and thermal behaviour remain unverified; no 60 FPS guarantee is claimed.

## Data

Only preferences (including player, atmosphere and sound), personal-best streak, and per-challenge personal bests are stored in localStorage. Malformed/missing storage is ignored. Session attempts are in memory. There is no database, telemetry, remote API, account, or payment flow.

## Testing

- Unit tests exercise the exact shared physics/keeper stepper: power/spin sensitivity, deterministic knuckle flight, preview agreement, geometry and swept collisions, valid placement, difficulty ordering, scoreable/saveable scenarios, and finite resolution across extreme positions.
- Chromium tests use a real WebGL canvas, interact through the actual DOM, score/replay/reset a shot, test pause cancellation and challenge setup, and exercise a real CDP touch gesture plus exact viewport-filling canvas and portrait/landscape bounds. Player tests check local photo loading, filtering, selection, persistence, preferred foot, pause/resume, and in-game attribution. Visual-options tests cover atmosphere, quality, guides, adaptive resolution, and FPS monitoring. A complete five-attempt challenge test verifies its completion dialog and return to practice.
- APK compilation and Android lint run in `.github/workflows/android.yml`. Physical-device graphics/performance validation remains a separate required release step.
