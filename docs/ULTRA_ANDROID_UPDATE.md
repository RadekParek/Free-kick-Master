# Android / Ultra / spatial replay update — 17 October 2026

This extends the cinematic/ICON foundation; it does not replace its recorded approach,
exact impact quaternion, immediate goal-triggered replay, five songs, 15% non-jump wall
roll or mesh-aligned capsule collisions. It is an original, fan-made FC/FIFA-inspired
presentation, **not EA HyperMotionV capture technology**.

## Presentation and gameplay

- The blue **aiming preview** is translucent (opacity 0.62); no live-flight trail returns.
- Replay cuts have light, compositor-animated diagonal scan shutters. Shot bearing and
  preferred foot choose mirrored/wide camera families. A short low-angle strike close-up
  shows the boot and ball; no model scaling is used for camera compression.
- Establishing views are shot-local and include both ends of the shot. The 8.6-second
  timeline, recorded run-up and recorded rotation/ball timestamps remain unchanged.
- One calculated value appears at a time, numerically revealing beside its projected
  object: distance at the kick spot, peak recorded approach speed, player height, release
  power at the ball, launch speed during early flight, keeper height near the keeper,
  goal-entry height at the intersection, then 64-simulation conversion at the goal.
  Height labels explicitly identify profile dimensions; speed is launch speed, not an
  invented instantaneous speed. Conversion is an **uncalibrated game-model estimate**, not
  real-world xG. A screen-reader summary retains all measured values offscreen.
- PlayStyle artwork fades in above the selected player's moving head while charging,
  remains through the run-up, and fades out over 0.25–0.50 seconds after contact. Unassigned
  players have no badge. Pausing also pauses overlay animations; reduced motion is honored.
- The original unbranded four-panel ball has flowing red/blue/green ribbons, warm seam
  pinstripes and separate surface relief. The contact control uses a shaded projection
  of the **same pattern**, above its technique labels on both phone orientations.
  Regenerate using `scripts/generate-contact-ball.mjs` (Node 22 + Python/Pillow).
- Central knuckle contact radius changes only slightly, **0.17 → 0.19**; the hard-strike
  power threshold stays 0.64.
- **57 photographed cards:** 47 standard, 7 ICON, 3 turquoise specials. Added current
  players: Hakimi, Rice, Saliba, Gabriel, Olise, Kvaratskhelia, Nuno Mendes, João Neves,
  Mané, Marquinhos, Cucurella and Upamecano. Added ICONs: **Juninho, Ronaldo Nazário,
  Pirlo**. ICON photos are desaturated and PlayStyle badges remain on the right.
- Juninho/Pirlo and **both Mbappé cards have Dead Ball+**. Existing requested assignments
  stay intact. Every ICON gains **+10 km/h launch speed and +5 curve in physics only**,
  including preview, worker simulations and replay setup. Card OVR/attributes are not
  inflated (Carlos still shows 99 power/curve). These bonuses stack with PlayStyle effects.
- More specific authored face proportions, Neymar's tapered fade, Yamal's blonde-tipped
  compact curls/dark roots and Ronaldo Nazário's frontal 2002 patch replace generic hair.
  These remain procedural, stylised likenesses, **not celebrity scans or photoreal models**.

## Quality-preserving performance work

No performance-only change lowers High / Balanced / Performance resolution, stadium or
grass detail, mesh LOD distance, shadow size or update cadence. Full native 3088×1440 is still available;
75% and 50% remain genuine fractions of native resolution, without a DPR cap. No automatic
quality downgrades or display-rate throttling were added.

| Change | Work removed / invariant |
| --- | --- |
| HDR post depth ownership | FXAA/SMAA have two swaps and a fixed scene-source buffer. The colour-only intermediate no longer allocates or clears an unused full-resolution depth attachment. At 3088×1440, one 32-bit attachment is about **17 MiB** (actual driver storage varies). AA-off retains both depth sources because its ping-pong direction alternates. |
| Deferred visual bone quaternions | Multiple Euler x/y/z writes become one quaternion derivation per dirty bone/pose. Intervening matrix/world queries flush on demand, preserving keeper glove alignment and foot plants. |
| Deferred collision rig quaternions | The same batching is used in mesh-free wall/keeper kinematics, including worker trials; collider dimensions and 16 capsules do not change. |
| Finite-range speed arithmetic | The bounded 120 Hz integrator and calibration solver use shared squared horizontal magnitude + square roots, avoiding general-purpose scaled `Math.hypot` reductions. Twelve pre-change trajectories match after 360 ticks to better than 1e-9 in positions/velocities. |
| Squared settling tests | The fixed-step outcome test compares squared speed to squared thresholds instead of taking another root each tick. No threshold or timestep changes. |
| Successful crowd-load retirement | Once the photographic atlas loads, the permanently hidden procedural fallback's instance buffers, geometry/material allocations and tree nodes are disposed/removed. On load failure the fallback is retained untouched. The visible atlas/crowd motion is unchanged. |
| New ball generation efficiency | Latitude/longitude construction uses small separable trig tables; direction samples allocate no temporary per-pixel arrays. Colour and relief are generated together. This supports the requested new artwork without heavyweight runtime assets. |

The native screen-awake flag is explicitly released on activity pause and restored on resume;
this is lifecycle hygiene, not a measured foreground FPS optimization.

The new overlay reuses one projected vector and one label, caches displayed text and uses
transform/opacity updates without per-frame layout reads or DOM creation. This contains
new-feature cost, rather than being presented as an optimization of an absent old overlay.

## Opt-in Ultra and Custom

Ultra: native scale, SMAA, bloom, tracking DOF, 1024 shadows, six-tap depth contact shading,
advanced athlete surfaces and cinematic highlight/contrast finishing. It is intentionally
**more expensive** than High; mobile default remains Balanced.

Custom independently controls:
- Resolution, AA, bloom, tracking depth of field and shadows (existing controls).
- Depth contact shading: a small screen-space depth heuristic, **not ray tracing**.
- Advanced athlete shaders: skin wrap-light approximation, cloth sheen, hair glints and
  surface-local micro-roughness, using existing materials/maps with no extra actor draws.
- Cinematic lens finish: highlight tint/contrast fused into the output pass.

Advanced material work is removed by shader defines when disabled. Lens-strength changes
reuse targets; sampled depth/topology rebuilds only when necessary. Legacy saves migrate
with the three new costly effects off. Independent Custom choices persist. DOF toggles
now reconfigure immediately, even when bloom/AA/quality stay unchanged.

## Evidence / limitations

- Type-check + **221 unit tests / 16 files passed** during implementation.
- **Full Playwright suite: 25/25 passed**, including real scoring/rebounds, immediate recorded
  replay, 57 rendered profiles/contacts, native 3088×1440 rotation, both phone orientations,
  overhead badge placement/fade, all eight progressive metrics, and Ultra/Custom persistence.
- `npm run android:sync` **passed** (production TypeScript/Vite build + Capacitor sync).
  **103 files byte-identical**, including **54 unique portraits**, 5 songs, the original
  ball preview and `chance-worker-CqkLq5AQ.js`. Build retains the nonfatal Three.js chunk-size warning.
- Ball preview regeneration reproduces the committed WebP byte-for-byte (SHA-256
  `2abc802e0cd6777189ed50b84c61095de2d7635f59456bf43749345793d0eb78`).
- GitHub Android APK/lint CI is required before merging this update; its run is linked from the PR.
- Browser GL tests exercise all six AO/DOF × AA combinations and compare pixel-identical
  baseline output with/without the removed intermediate depth attachment for FXAA/SMAA.
- These are workload/memory reductions and software-browser regressions, **not physical
  Android FPS, thermal, battery-life or photorealism measurements**. No handset was available.
- All 15 new photographs have **uncleared reuse rights**, as do the pre-existing editorial
  previews and EA PlayStyle artwork. Sources, image IDs and adaptations remain in bundled
  manifests/credits. Public mirrors do not grant redistribution permission; replace/clear
  these assets before public/commercial distribution. No watermark removal or generated
  face substitutes were used. Ball artwork is original and unbranded.
