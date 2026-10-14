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
    animation.ts         Pure procedural poses, shared by both athlete detail rigs
    replay.ts            Bounded full-precision recording and in-place interpolation
    audio.ts             User-gesture-unlocked synthesized local audio
    music.ts             Shuffled bundled soundtrack, autoplay retry, history and visibility lifecycle
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

Physics advances at 120 Hz. Render frames add to an accumulator; the maximum render delta is 100 ms to avoid a spiral of death after a stall. Replay snapshots are captured every other physics step (60 Hz) and never re-run the keeper's decisions. Strongly underpowered attempts terminate after 5 simulated seconds; live frame rebounds have an eight-second limit so a slow deflection can still score.

Flight and goal/save decisions are deterministic for a captured setup and wall layout. The wall gap is randomized once per kick; visual generation, synthesized noise, and soundtrack shuffle also use randomness. The turf/crowd generators use fixed seeds.

## Mobile/performance

A single WebGL renderer is resized with `ResizeObserver`. Render scale comes from the selected graphics preset or custom settings; there is no adaptive downscaling. High uses 2048 px shadow maps, Balanced uses 1024 px, and Performance disables dynamic shadows. Material programs are invalidated when shadow quality changes.

- Static stadium geometry is merged per shared material/shadow state. Rigid player parts are batched per articulated bone/material.
- Distant crowds use a generated texture on upright row strips merged into one mesh. Procedural instanced spectators remain an asset-load fallback, not a second visible crowd.
- The trajectory guide and shot trace reuse bounded typed-array GPU buffers. Defensive-wall positions are cached rather than allocated on every physics tick.
- Visible scenes render at the display rate. Paused gameplay overlays and backgrounding cancel animation-frame scheduling; the visible menu background remains animated.
- Rendering uses device pixel ratio multiplied by the selected render scale; these optimizations do not change that scale. Performance comes from batching, distance-based LOD (high/low athlete rigs), spatial batching of stands, and culling. The on-screen monitor reports measured FPS, draw calls and the native pixel ratio.
- The shot-local camera and taker positioning handle wide angles and portrait phones without cropping the entire kicker out of view.
- Goal-net deformation runs only briefly after a goal. All fonts, portraits, crowd imagery, scripts, and audio generation are local/offline assets. Android haptics tolerate unsupported hardware.

See [ten additional optimizations and regression checks](PERFORMANCE.md), including frozen stadium transforms, coalesced previews, cached net waves, and post-processing resource cleanup.

Software-WebGL test-worker throughput is not representative of an Android GPU. Hardware performance and thermal behaviour remain unverified; no 60 FPS guarantee is claimed.

## Data

Only preferences (including player, atmosphere and sound), personal-best streak, and per-challenge personal bests are stored in localStorage. Malformed/missing storage is ignored. Session attempts are in memory. There is no database, telemetry, remote API, account, or payment flow.

## Testing

- Unit tests exercise the exact shared physics/keeper stepper: power/spin sensitivity, deterministic knuckle flight, preview agreement, geometry and swept collisions, valid placement, difficulty ordering, scoreable/saveable scenarios, and finite resolution across extreme positions.
- Chromium tests use a real WebGL canvas, interact through the actual DOM, score/replay/reset a shot, test pause cancellation and challenge setup, and exercise a real CDP touch gesture plus exact viewport-filling canvas and portrait/landscape bounds. Player tests check local photo loading, filtering, selection, persistence, preferred foot, pause/resume, and in-game attribution. Visual-options tests cover atmosphere, graphics presets, guides, and FPS monitoring. A complete five-attempt challenge test verifies its completion dialog and return to practice.
- APK compilation and Android lint run in `.github/workflows/android.yml`. Physical-device graphics/performance validation remains a separate required release step.
