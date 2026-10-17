# Cinematic replay, ICON and performance update — 17 October 2026

## Presentation and gameplay

- **Immediate goal analysis:** `resolve()` enters recorded replay on the same fixed-step scoring tick. The former 1.8-second celebration delay is removed. The result is counted once before playback; pause, skip, manual replay and return-to-shot never score again.
- **Actual approach recording:** a bounded typed buffer stores displayed run-up times, root position/yaw and animation phase, including plant-foot correction. Sampling uses timestamps, not an assumed display refresh rate; recording is capped at 120 Hz and retains the final plant. Peak approach speed is measured from those transforms.
- **Recorded ball orientation:** flight rotation is integrated on the fixed physics clock and recorded as quaternions. Timestamp-based SLERP includes the exact final 120-Hz sample. Strike/entry freeze, pause and slow motion freeze/retime rotation as well as position; no independent display-time spin continues in a freeze. Skipping restores the saved live orientation.
- **Six camera stages over 8.6 seconds:** spatial scan → recorded approach → contact freeze → eased flight tracking → entry orbit/freeze → overview. Flight camera aims directly at the recorded ball, including very short flight times; approach, low strike and goal-entry cameras use different compositions. This is original FC/FIFA-inspired graphics, not EA's HyperMotionV capture technology or proprietary code.
- **Larger analysis footprint:** a 24 m minimum pitch scan with wider margins and an anti-aliased 2.8-pixel recorded white path; persistent segment/time buffers upload once per replay. No live blue flight trail is added.
- **Eight measurements:** launch speed, goal distance, entry height, peak run-up speed, shot-power percentage, taker height, keeper height and a clearly labeled **SIM. CONVERSION / MODEL / 64** estimate.
- **DOF:** Custom has an independent saved toggle; High defaults on, Balanced and Performance default off. A bounded 12-tap depth-aware thin-lens approximation uses a 24 mm sensor height, camera-derived focal length and f/2.8, tracking the taker/ball. It samples the existing scene depth in the fused output/grade pass, **not a second scene render**. Depth attachments are distinct per composer target, and the source is rebound after ping-pong swaps. This is an efficient approximation, not a full multi-layer offline lens simulation. DOF has a real GPU cost when enabled.
- **Keeper:** stronger velocity-driven lateral steps. The leading hand reaches toward the simulated catch target; the trailing upper arm first moves forward, with the elbow tucked across outside the rib cage, rather than passing through the torso.
- **Contacts:** shared bone rest coordinates and the same animation functions drive visible rigs and a reusable mesh-free collision rig. Swept ball segments test 16 posed capsules (skull, shoulders, torso, hips, both arms/palms, thighs, calves and boots), including actual template scale/floor, keeper yaw and defender stature. Penalties increase anticipation/movement, **not invisible collision radius**. These are anatomical capsule proxies, not exact triangle-mesh collision or moving-cloth simulation. Broad phases avoid posing distant bodies.
- Defender **non-jump probability is 15%**, rolled once per kick and shared by collisions, live animation and replay.

## Statistical estimate, not official xG

`chance.ts` performs **64 seeded full-game simulations** in a module Worker. Each trial uses the current wall decisions, keeper difficulty, penalty rules, player attributes and PlayStyle. Independent uniform execution variations are aim ±0.32 m horizontally / ±0.16 m vertically, power ±3 percentage points and contact ±0.035. Knuckle wake seeds vary. The displayed integer is the fraction scoring, rounded to percent.

This is a repeatable, **uncalibrated game-model conversion estimate**, not a prediction trained against real football matches, not official EA data, and not calibrated real-world xG. With only 64 samples it is noisy (worst-case binomial standard error ≈6.25 percentage points); 0%/100% are sampled frequencies, not impossibility/certainty. The tooltip discloses assumptions. Worker requests carry shot IDs so late answers cannot overwrite another shot; unavailable workers show an unavailable mark, never a made-up number. This computation never delays the scoring-to-replay transition.

## Models, kits, cards and environment

- Four new original ivory/etched-gold **ICON tribute** cards: Roberto Carlos, Ronaldinho, Zidane and Beckham, with desaturated local photographs and an ICON filter. **Carlos is left-footed, 99 power, 99 curve, Power Shot+.** Other previous assignments/effects remain; ICON attributes are fan-made, not EA ratings.
- PlayStyle+ artwork is on the **right side** of full and mini cards. Existing accepted FC26 icon assets are retained; no claim of FC27 asset equivalence.
- Bald Carlos/Zidane, Ronaldinho's rooted tied curls/ponytail and Beckham's swept silhouette; additional per-player facial landmarks, mouth/jaw/nose/build values, skin/iris/hair profiles. Models remain original stylised, procedural athletes, **not photoreal celebrity scans**.
- National home colours/patterns, shorts/socks and collar trim are retained, with three-front-stripe Argentina spacing, title stars, piping and ventilation detail baked into the existing opaque kit atlas. Kits are **national-colour/pattern approximations**, not authenticated year-exact licensed federation/brand replicas.
- Turf has **20% more blades** and ~15% wider blade bases: High 97,344 triangles/blades (previously 81,120), Balanced 48,672. Existing radial near-kick density, tiled frustum culling and sway remain. Culling spheres include sway.
- Static tunnel lintel, seating rails and distant building silhouettes share existing spatial/material batches; no new lights or dynamic-shadow casters.
- Ivory card readability, restrained foil/press transitions and a larger responsive analysis data panel. Motion respects reduced-motion preferences; cinematic CSS pauses with the game.

## Music

Both files supplied in `main` commit `124ef93` are referenced directly, without duplicating binaries: **Worms · Ashnikko** and **Parado no bailão · MC L da Vinte & MC Gury**. The original three remain. All five are bundled for offline browser/Android playback. The same previous/title/next controls move into gameplay; queue/history/listeners/audio position are preserved. Menu volume is 100%, play/practice 75%. Controls hide during overlays/analysis, but playback continues unless backgrounded or disabled. See the soundtrack README.

## New quality-preserving workload reductions

These are additional to, not re-counts of, the previous GPU-net/FXAA/geometry-batching work. They do not silently lower resolution, remove lighting, reduce crowd imagery or downgrade model meshes.

| Change | Verifiable work reduction | Quality / trade-off |
| --- | --- | --- |
| Grass phase factorisation | Two sine calls per rendered grass vertex become precomputed per-instance phase pairs and dot products; just four time trig evaluations per CPU frame. At the old full 81,120-blade count this removes up to 486,720 vertex sine evaluations/frame. | Original wind formula agrees within float attribute precision (tested to 1e-6); 16 additional static bytes/blade. Density actually increases 20%. |
| Immutable stadium subtree | The renderer's forced world-matrix walk stops at a frozen root instead of descending through all static children, including hidden procedural crowd cells. | Shader motion is unchanged; the one movable near-grass patch already updates its world matrix explicitly. Regression test verifies no child walk over 60 forced scene updates. |
| GPU confetti rotation/flutter | No 90 per-frame Object3D Euler/matrix compositions or matrix uploads. Position/spin uploads are 90 vec4s instead of 90 mat4s: **1,440 vs 5,760 bytes/frame, 75% less**. | Same drag, gravity, seeded/random palette, lifetime, flutter and XYZ rotation equations; one instanced draw remains. |
| Crowd phase factorisation | Baked row-strip waves and both fallback spectator parts use precomputed phase attributes/dot products; per-vertex sine calls become a few shared uniform updates. | Same wave/bob equations and original crowd atlas; fallback remains detailed when a texture fails. |
| Invisible-LOD pose copy elimination | No copying 13 position/quaternion pairs into an invisible low rig every animation frame. Low poses synchronize when actually visible and immediately on an LOD transition. | Same geometry, transition distance and visible joint transforms. Existing invisible-subtree matrix skipping is **not** counted as new. |
| Simulation estimate off main thread | The new 64-trial calculation runs in a reusable module Worker, never synchronously inside a goal/animation frame. | Same fixed-step simulation rules and model-aligned contacts; bounded tasks and stale-result rejection. This avoids a new UI stall, not a claim of baseline device FPS improvement. |
| Fixed DOF kernel expansion | Precompute and expand all 12 golden-angle disk taps at module load rather than asking each fragment/driver to construct a sin/cos/sqrt kernel. | Same 12-tap disk and depth weights; constant shader offsets. This bounds the new optional effect’s arithmetic, not a baseline FPS claim. |
| Physics micro-work | Reuse the duplicate trajectory-calibration `hypot` result; cache identical fixed-step spin-decay exponentials, retaining the variable-dt path. | Same numerical equations and fixed-step outputs; covered by physics/rebound/roster regression suites. |

DOF is fused into an existing pass rather than introducing the customary separate blur/depth scene passes; disabled DOF allocates no sampled-depth attachment and adds no shader taps. More grass, DOF and anatomical contact evaluation also add work. **These are measured workload/invariant reductions, not measured handset FPS/frame-time wins or thermal guarantees.** A faster implementation language was not introduced: the largest opportunities here are shader arithmetic, graph traversal, uploads and avoiding UI-thread tasks, not TypeScript syntax. On-device performance/thermal validation remains necessary.

## Validation

Final local validation of this update (not inherited PR #9 results):

- `npm run check`: **205 unit tests / 15 files passed**, TypeScript clean.
- `npx playwright test --reporter=line`: **22/22 browser tests passed in 10.1 minutes**, including actual WebGL/DOF pixels and ping-pong depth binding, visible-LOD synchronization/copy counts, all 42 model identities, real Carlos scoring-tick replay/run-up/rotation freeze/ball-centred camera, 3088×1440 native scaling, all five MP3 decodes, challenge completion, pause/skip/no-recount, and responsive phone layouts.
- `npm run android:sync`: production build and Capacitor sync passed. Existing nonfatal >500 kB Three.js chunk warning remains.
- **All 87 production files are byte-identical** to the Android asset package, including **five MP3s** and the self-contained module Worker. The CI workflow now enforces this for the entire build, not just player media.
- `git diff --check`: clean.
- Native APK assembly and Android lint are enforced by the linked PR's **Test and build offline Android APK** check; its status/artifacts are authoritative. No physical Android handset FPS, thermal or touch/audio-hardware benchmark was run.

## Rights and limits

New ICON photographs are grayscale editorial search previews; copyright remains with Getty Images/the photographers, **reuse is not cleared**. Originals are retained intact apart from grayscale/WebP conversion (no watermark removal). Provenance and image IDs are in `public/players/ADDED-PORTRAITS.json`, LICENSE and in-game credits. Replace/clear them before public/commercial redistribution. The same applies to user-supplied copyrighted recordings; inclusion is not a redistribution license. See existing PlayStyle and portrait notices. There is no player/federation/EA/FIFA endorsement, live card feed, proprietary HyperMotionV capture, photoreal-scan claim or physical-device FPS guarantee.
