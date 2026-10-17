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
    player.ts            Shared high/low athlete materials, procedural poses and profile selection
    athlete-model.ts     Shared anatomical body templates, opaque fitted hair, pre-render LOD selection
    human.ts             Validated offline CC0 head decoding and one-time preload (fallback on failure)
    appearance.ts / kits.ts  Base-ID hair identities and bounded nation-inspired opaque kit atlases
    camera.ts            Long-lens broadcast compression without rescaling gameplay objects
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
public/models/           Compact CC0 head LODs, attribution, reproduction and full license
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

A single WebGL renderer is resized with `ResizeObserver`; resize bursts are coalesced into one animation frame. Render scale comes from the selected graphics preset or custom settings; there is no adaptive downscaling. High and Balanced cap shadow maps at 1024 px, while Performance disables dynamic shadows. Dynamic shadow maps refresh at 30 Hz while the scene itself remains at the display rate. Material programs are invalidated only when shadow quality changes.

- Static stadium geometry is merged per shared material/shadow state. Rigid player parts are batched per articulated bone/material.
- Distant crowds use a generated texture on upright row strips merged into one mesh. Procedural instanced spectators remain an asset-load fallback, not a second visible crowd.
- The trajectory guide and shot trace reuse bounded typed-array GPU buffers. Defensive-wall positions are cached rather than allocated on every physics tick.
- Visible scenes render at the display rate. Paused gameplay overlays and backgrounding cancel animation-frame scheduling; the visible menu background remains animated.
- Desktop rendering uses device pixel ratio multiplied by the selected render scale. The explicit Native (100%) option uses the full device pixel ratio on phones too. Reduced phone modes cap device pixel ratio at 2× before scaling; their Balanced preset renders at 75%, uses 512 px shadows and skips bloom, while Performance renders at 50% with no shadows or post AA/bloom. The settings and FPS monitor show the effective render size/ratio. Performance also comes from batching, distance-based LOD (high/low athlete rigs), spatial batching of stands, and culling.
- The shot-local camera and taker positioning handle wide angles and portrait phones without cropping the entire kicker out of view. Landscape uses a narrower broadcast lens for a larger keeper at the same approximate camera distance; optional left/right orbit controls reset to centre when a shot is released.
- An in-game field-map popover shares the settings pitch map and can reposition the free kick without opening Settings. High-frequency map/slider changes update the arena once per frame.
- Goal-net deformation runs only briefly after a goal. All fonts, portraits, crowd imagery, scripts, and audio generation are local/offline assets. Android haptics tolerate unsupported hardware.

See [ten additional optimizations and regression checks](PERFORMANCE.md), including frozen stadium transforms, coalesced previews, cached net waves, and post-processing resource cleanup.

Software-WebGL test-worker throughput is not representative of an Android GPU. Hardware performance and thermal behaviour remain unverified; no 60 FPS guarantee is claimed.

## Data

Only preferences (including player, atmosphere and sound), personal-best streak, and per-challenge personal bests are stored in localStorage. Malformed/missing storage is ignored. Session attempts are in memory. There is no database, telemetry, remote API, account, or payment flow.

## Testing

- Unit tests exercise the exact shared physics/keeper stepper: power/spin sensitivity, deterministic knuckle flight, preview agreement, geometry and swept collisions, valid placement, difficulty ordering, scoreable/saveable scenarios, and finite resolution across extreme positions.
- Chromium tests use a real WebGL canvas, interact through the actual DOM, score/replay/reset a shot, test pause cancellation and challenge setup, and exercise a real CDP touch gesture plus exact viewport-filling canvas and portrait/landscape bounds. Player tests check local photo loading, filtering, selection, persistence, preferred foot, pause/resume, and in-game attribution. Visual-options tests cover atmosphere, graphics presets, guides, and FPS monitoring. A complete five-attempt challenge test verifies its completion dialog and return to practice.
- APK compilation and Android lint run in `.github/workflows/android.yml`. Physical-device graphics/performance validation remains a separate required release step.


## Broadcast presentation pass (16 October 2026)

The distant goal/keeper use actual perspective compression: a narrower field of view paired
with a dolly back. Foreground magnification remains approximately constant; physical goal,
ball and keeper dimensions, aim, shot physics and collisions are unchanged. The attract view
and replay have independent lenses. Optics are cached on resize, not recomputed per frame.

The fused `BroadcastOutputPass` retains Three.js output exposure/colour-space handling, then
applies the broadcast grade before optional SMAA. One full-screen sampling pass is removed.
The stadium uses the same light count, shadow-map budget and refresh cadence with rebalanced
warm key / cool sky fill / turf bounce. Opaque atlas crowd strips now sway and cheer in their
vertex shader, anchored at their seats, without a second crowd or buffer uploads.

New athletes use original, anatomically shaped body surfaces plus a compact, validated CC0
head. Outfield/keeper templates share vertex/index buffers across instances; each player's
high/low rigs share one material palette. The visible LOD is selected before world-matrix
propagation, allowing hidden rig subtrees to skip all descendant matrix work without a stale
pose when they reappear. Both poses still derive from the same clock/animation equations.

Seven opaque hairstyle families, fitted beard surfaces and per-profile head proportions are
keyed by the base player identity. Special editions retain that identity and their turquoise
kit. Kit lettering and patterns are baked in one bounded opaque atlas rather than transparent
number/crest meshes. These are nation-inspired training kits and generic anatomy, not licensed
jerseys, proprietary player scans, or a claim of EA/FC visual parity.
