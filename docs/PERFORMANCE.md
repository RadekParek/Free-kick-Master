# Performance changes — history and current behavior

**Current behavior (17 October):** all render scales are fractions of full native DPR, with
no mobile cap. MSAA has been removed in favor of FXAA/SMAA/off. See
[REALISM_UPGRADE.md](REALISM_UPGRADE.md) for the latest changes. Earlier DPR-cap entries below
are historical and superseded.

## 14 October baseline

The earlier passes remove redundant work without reducing scene detail. The mobile pass caps
shadows at 1024 px, gives phones a lower-cost Balanced/Performance profile, and limits very high
DPR rendering. Desktop settings, athlete geometry/LOD distances, crowd texture, and 120 Hz shot
physics remain unchanged. Visible scenes still render at the display rate; only shadow refresh
is half-rate.

## Ten optimizations

1. **Freeze static stadium transforms.** Bake local/world matrices once after stadium creation.
   Architecture, crowd strips, turf, flags, and net no longer recompose/multiply Object3D matrices
   each frame. Their existing shader, vertex-buffer, and instance-matrix animations still run.
   Lights remain outside the frozen group so atmosphere changes still reposition them.
2. **Stop drawing idle confetti.** The pooled instanced mesh is invisible until a burst, and is
   hidden again when its last particle expires. This removes its otherwise-empty draw call.
3. **Skip hidden defenders.** Wall models disabled by the wall-count setting skip both frustum
   checks and pose updates. Visible defenders retain the existing animation/culling behavior.
4. **Coalesce aim previews.** Pointer/key aim changes update shot settings immediately but mark
   the preview dirty; the next frame calculates only the latest trajectory. A burst of twenty
   inputs needs one preview calculation, not twenty. Release still captures the latest aim.
5. **Remove unused guide work.** Guides-off performs no preview simulation. The never-visible
   waypoint mesh, its matrix uploads, unused line-distance buffer, per-point temporary arrays,
   and distance accumulation are removed. The same visible blue line remains; only its live
   position range is uploaded.
6. **Reuse thick-trail GPU storage.** Line2 has fixed-capacity, dynamic interleaved segment
   storage and an active instance count. Recording a shot no longer needs replacement line
   geometries/buffers. This also corrects the old trail's use of thin-line draw ranges and ensures
   the live trail receives segment positions during flight, not only on settings changes.
7. **Cache net-wave constants.** Edge damping is computed once, impact distance/attenuation
   once per hit, and time decay once per frame. Only one sine per vertex remains per animated
   frame. The net returns to its rest buffer once, then stops uploads until another hit. Tests
   compare the new wave with the original equation to six decimal places.
8. **Stop paused frame scheduling.** Backgrounding or a paused gameplay overlay cancels the RAF
   loop instead of waking it every display frame. Resume schedules one frame and resets its
   clock, preventing catch-up simulation. The visible menu background remains animated.
9. **Avoid unnecessary graphics-resource churn.** Bloom/AA/resolution changes no longer dispose
   shadow maps and invalidate every scene material. Shadow work occurs only for shadow changes;
   post passes are resized only for changed dimensions/DPR. Rebuilt/disposed post stacks now
   dispose each pass's targets/materials as well as the composer's own targets, avoiding retained
   GPU allocations across repeated preset changes.
10. **Reduce HUD DOM writes.** Power text/fill/ARIA/class updates occur only when the displayed
    percentage or overpowered state changes. The hidden FPS monitor no longer receives DOM
    updates. Renderer statistics now aggregate the complete frame (including post passes),
    rather than reporting just the last full-screen draw.

## Verification

- `npm run check`: TypeScript plus unit tests, including music state transitions and performance
  invariants. Performance tests cover coalesced input, guide-off, RAF pause/resume, hidden walls,
  persistent trail buffers, selective shadow rebuilding, post resize/disposal, and net equivalence.
- `npm run build`: production bundling, including the three soundtrack MP3 files.
- `npm run test:e2e`: real Chromium/WebGL shots, goals, replay, challenges, graphics changes,
  menus, roster, and mobile/touch controls. Music tests exercise actual audio decoding/playback,
  startup attempts, previous/next/ended, volume, mute, and desktop/phone layouts.

These are reduced-work/resource-lifetime checks, **not a hardware FPS benchmark**. Software
WebGL in the test worker is not representative of an Android GPU; no percentage speedup or
frame-rate guarantee is claimed. For device comparison, use the same graphics preset, viewport,
player and shot before/after, and measure menu, charging, flight, goal effects and repeated
settings changes after warm-up. The monitor's draw count is now a full-frame total, so it should
not be compared directly with the old final-pass-only count.

## Additional pass: rebounds and richer animation

Eight further optimizations accompany the new woodwork physics/animations:

1. **One pose evaluation per athlete.** Run-up, keeper, idle and reaction math runs once;
   the joint transforms are copied to the alternate LOD. Both levels stay current without
   evaluating every sine/easing expression twice. LOD distances and mesh detail are unchanged.
2. **Freeze rigid athlete-local matrices.** Face, clothing, boot and glove surfaces keep their
   local matrices. Their parent head/elbow/leg joints still animate and propagate world transforms.
3. **Reusable replay recording.** A bounded `Float64Array` records up to 640 snapshots (over
   ten seconds at 60 Hz), reusing the allocation for every shot instead of allocating nested
   position/keeper/glove objects each sample. Full JavaScript numeric precision is retained.
4. **In-place replay interpolation.** Playback updates existing ball/keeper/vector objects.
   Keeper position, dive and glove position now interpolate as smoothly as the ball, instead of
   cloning one keeper snapshot each frame. Replays do not invoke scoring or impact audio again.
5. **Direct trajectory-buffer writes.** The visible guide uses the same sampler as the public
   physics preview but writes directly into its existing GPU array, without an intermediate
   list of point objects. Tests compare every coordinate with the old object preview.
6. **Cheaper collision hot paths.** Live simulation reuses previous/end-position scratch vectors;
   defensive-wall tests use scalar slab bounds rather than two temporary box objects per defender.
   Cheap depth-range rejection avoids detailed wall/frame work when the ball is nowhere near them.
7. **Append-only trail updates.** New segments are copied/uploaded once per rendered frame, not
   once per physics sample; only the appended range is uploaded until the bounded trail fills.
   At capacity a full update preserves the existing moving-window appearance.
8. **Reuse synthesized-noise samples.** Kick/impact noise buffers are cached by duration.
   Finished oscillator/source/filter/gain graphs explicitly disconnect instead of retaining
   one-shot audio connections across a long session.

## Mobile interaction and resource pass

1. **1024 px maximum shadow map.** The High preset keeps its render scale, MSAA, SMAA, and bloom,
   but its maximum shadow size is now 1024 px. Balanced also tops out at 1024 px; Performance
   still disables dynamic shadows. Older saved Custom values of 2048 migrate safely to 1024.
2. **Half-rate shadow refresh.** Dynamic shadow maps update every other render frame (30 Hz on a
   60 Hz display) while simulation, camera, and scene rendering keep their original cadence. The
   first frame, a kick reset, and a shadow-quality change still mark the map dirty immediately.
3. **Coalesced setup updates.** Multiple position/technique changes in one frame schedule one
   Arena settings update, keeping the latest input and avoiding repeated resets/trajectory work.
   Discrete transitions flush the pending update before a kick or view change.
4. **Coalesced resize work.** ResizeObserver notifications and render-scale changes share one RAF
   resize, avoiding redundant post-stack/render-target reallocations during mobile browser-chrome
   and orientation changes.
5. **Lazy optional Python dependency.** The Android art script imports Pillow only when its image
   generation functions run; importing the utility itself does not eagerly load the package.
   Python has no `lazy import` prefix keyword, so this uses a normal function-local import.
6. **Phone render budget.** On phones, Balanced starts at 75% render scale, 512 px shadows and no
   bloom; Performance uses half-scale, no dynamic shadows, SMAA or bloom. The device-pixel ratio
   is capped at 2× before the selected scale, cutting high-DPI fill-rate while leaving desktop
   pixel density alone. The resolution selector and performance monitor report the effective size.

The stadium still uses atmosphere-dependent dynamic lighting. Its generated crowd atlas, player
contact-shadow texture, and shared PMREM studio environment are already baked/cached assets; a
single static scene lightmap would conflict with the three switchable lighting moods. These
changes do not claim a device-specific FPS uplift; they reduce shadow memory/work and redundant
CPU/GPU resource updates while preserving the scene's detail and visible-frame cadence.

The earlier non-mobile optimizations leave scene geometry, texture detail, LOD distances, and
visible-frame cadence unchanged. The phone profile deliberately reduces pixel workload, bloom
and shadow cost while preserving the scene; moving shadows refresh every other render frame
(about 30 Hz on a 60 Hz display). New head/elbow joints reuse existing surfaces. The rebound
solver has a bounded four-contact loop per 120 Hz tick; that correctness work is not claimed as
a speedup. Tests verify work/storage invariants, not a particular FPS improvement on a physical
GPU.


## Quality-preserving pass — 15 October 2026

This pass adds **eight** optimizations. It does not change graphics presets, render scale,
texture dimensions or anisotropy, mesh detail/LOD distances, bloom appearance, lighting,
shadow resolution/refresh cadence, or simulation/render frequency.

1. **Cache normal-map luminance.** Decode each source texel once into a temporary full-precision
   height buffer instead of four times per output texel. Neighbor-row offsets are computed once
   per row. Ball/kit normal maps retain the original byte output and wrapped edges. This trades
   a short-lived 8-byte-per-texel CPU buffer for less generation work; it adds no GPU memory.
2. **Hoist turf row constants.** Mowing stripe and row-curve calculations run once per row rather
   than once per pixel (2,048 versus 2,097,152 evaluations at the existing texture size). Seeded
   grain order, turf pixel bytes, and the 1024×2048 texture remain unchanged.
3. **Short-circuit keeper reach checks.** A body hit skips glove/arm work, and a glove hit skips
   the arm calculation. Circular reach checks use squared distances instead of square roots.
   Reach sizes, strict circle comparisons, body ellipse, and penalty adjustments are unchanged.
4. **Skip hidden trace uploads.** With guides off, shots still record the bounded CPU history for
   replay and later toggling, but do not copy segments or upload them to the GPU. Re-enabling
   guides rebuilds the complete current trail, including shots recorded while guides were off.
5. **Keep post targets across quality-only changes.** Quality changes update the existing bloom
   strength in place. They no longer rebuild the unchanged composer/pass topology. MSAA,
   SMAA, and bloom on/off changes still rebuild as required; the same output pipeline remains.
6. **Avoid shadow shader churn on size changes.** Changing shadow-map dimensions replaces only
   the shadow target. Materials are invalidated only when shadows are enabled/disabled, and
   each shared material is invalidated once rather than once per mesh.
7. **Reuse run-up scratch positions.** The curved approach writes into two reusable objects
   rather than allocating two positions per run-up frame. Position/yaw equations are unchanged.
8. **Complete GPU resource cleanup.** Arena teardown deduplicates shared geometry/material/texture
   disposal, frees instancing buffers and light shadow targets, and disposes the owned studio
   PMREM render target (including its framebuffer). The temporary studio scene is disposed after
   baking. A late crowd-image load cannot attach a new texture to an already-disposed stadium.
   Cached player texture canvases remain available for re-upload if a new arena is constructed.

### Verification for this pass

- `npm run check`: **104 unit tests pass**, with TypeScript checking. New tests compare turf and
  normal-map bytes against the previous formulas, compare thousands of keeper reach decisions,
  check unchanged run-up positions, hidden-trace restoration, post-target reuse, selective shadow
  invalidation, and deduplicated resource disposal.
- `npm run build`: passes. Vite still reports the existing >500 kB Three.js chunk warning.
- `npm run test:e2e`: **14 Chromium/WebGL tests pass**, covering scoring/rebounds, replay,
  challenges, roster/settings, music, and phone/touch layouts.

These checks establish behavioral equivalence and avoided work, not a measured phone FPS
increase. Physical Android GPU, sustained frame-time, memory, and thermal measurements are
still needed. Compare identical presets, atmosphere, player, viewport, and shots after warm-up;
include repeated graphics changes and arena teardown/recreation when measuring resource churn.


## Follow-up pass before PR — 15 October 2026

Five further changes preserve the same graphics and gameplay:

1. **Atomic/no-op renderer resizes.** Use Three.js `setDrawingBufferSize` to apply logical size
   and DPR together instead of `setPixelRatio` (which itself resizes) followed by `setSize`.
   Identical observer notifications no longer reset the canvas. Post configuration and camera
   projection still update, including the initial configuration and orientation/DPR changes.
2. **Scanline normal-map workspace.** Refine the earlier luminance cache to three rolling
   full-precision rows instead of a full-image array. For the 1024×512 ball normal map the
   temporary height workspace shrinks from 4 MiB to 24 KiB. Generated bytes are unchanged;
   tests include toroidal edges, single-pixel dimensions, and heights divisible by three.
3. **Lazy wall-jump math.** Cache segment depth bounds once per wall check and evaluate the
   jump only after a defender passes depth rejection. Distant flight ticks skip the jump sine;
   potential contacts still use exactly the original jump and slab equations.
4. **Retain resolution option nodes.** Rebuild the three resolution labels only when viewport,
   DPR, or mobile classification changes, not on every contact/distance/settings input. Setting
   the selected resolution still happens immediately and labels retain their effective pixel sizes.
5. **Coalesce preference persistence.** A burst of settings inputs schedules one localStorage
   serialization/write per animation frame, using the latest state. UI changes remain immediate.
   Pending saves flush synchronously on pagehide, backgrounding (including Capacitor lifecycle),
   and discrete transitions that flush Arena settings, so suspended RAFs cannot lose preferences.

Validation: `npm run check` passes **111 unit tests** and TypeScript; `npm run build` passes.
The browser suite has **15 tests**, including a new real-DOM test for stable resolution nodes,
latest-state lifecycle persistence, and reload. Its native range-input assertion uses the actual
min-relative step-snapped value rather than assuming an integer-metre grid. The existing Vite
Three.js chunk-size advisory remains. No physical-phone FPS, battery, or thermal claim is made.


## Broadcast / human-anatomy pass — 16 October 2026

This pass trades waste in the old overlapping-primitive athletes for clearer anatomy, a CC0
human face, fitted hair and national training-kit detail. It does **not** lower render scale,
shadow resolution/rate, AA, bloom, crowd/turf texture dimensions, or physics frequency.

### Four additional optimizations

1. **Fused HDR output + grade.** Tone mapping, sRGB conversion and the broadcast grade execute
   in one `BroadcastOutputPass`, removing one full-screen texture read/write and draw per frame.
   SMAA remains after sRGB conversion. The new grade is deliberately less saturated, less warm
   and less vignetted; this is an artistic change, not removal of tone mapping or antialiasing.
2. **Shared anatomical geometry templates.** Build each outfield/keeper detail template once,
   then reuse vertex/index buffers among instances. Purpose-shaped cloth and limbs replace
   overlapping high-segment primitive volumes. The sampled Ronaldo high rig moves from
   **80,128 triangles to approximately 21,200**, including a CC0 human head and fitted quiff.
   This is about 74% fewer high-rig triangles with a more anatomical silhouette. The upgraded
   distant rig is more detailed than before (about 7,000 rather than 3,432 triangles); this is
   explicitly not an across-the-board triangle reduction. Exact counts vary with hair/beard.
3. **Skip invisible LOD matrices correctly.** Arena updates the camera, selects athlete LODs,
   then propagates scene matrices. Hidden `RigRoot` subtrees skip descendant recomposition and
   matrix multiplication. A newly selected rig receives its current pose and matrix update in
   that same frame. The 30 m transition threshold is retained; no animation cadence is reduced.
4. **Share materials and use bounded opaque kit atlases.** High/low rigs reuse one palette per
   player. Profile changes swap atlas contents without invalidating already-mapped shaders.
   Kit name/number/badge artwork is in one opaque surface, with no separate transparent decal
   mesh. The six-entry atlas cache is bounded; previously used model/hair/kit GPU resources are
   also released at arena teardown. Fixed camera optics are cached on resize.

### Graphics changes within that budget

- Validated, locally bundled MakeHuman CC0 head geometry (about 130 kB total for both binary
  LODs), with original fitted hair/beards, proportional faces, shaped shoulders/limbs/cloth and
  individual fingers in the near rig. These are generic human faces, not scanned likenesses.
- Seven player-specific hair families and original national-colour training kits (Argentina
  stripes, Croatia checks, coordinated shorts/socks/trim, names/numbers, turquoise specials).
  No copied federation crests, sponsors or licensed current-season uniform claim.
- Existing PBR lighting rebalanced into a warm key, cool sky fill and turf bounce, with matte
  skin/cloth and baked shape shading. Same scene-light count and shadow budget, no SSAO/SSR,
  depth-of-field render targets, hair alpha overdraw or extra shadow-casting spotlights.
- GPU crowd-strip motion: quiet breathing and a travelling goal cheer, with anchored bottom
  vertices and conservative culling bounds. No extra crowd draw, CPU poses or frame uploads.
- Optical perspective compression: pull back and narrow the lens so the distant goal/keeper
  read larger without changing their physical size. Separate attract/replay lenses remain.

### Validation / limits

Unit checks cover mesh decoding, invalid/corrupt assets, shared geometry/material identity,
triangle budgets, all seven hairstyles, base/special identity, national patterns, visible-only
matrix updates, fused post ordering and long-lens projection. Chromium renders every hair
family through bloom + SMAA, checks offline head loading, and exercises mobile input, scoring,
replay, challenges and settings. APK sync includes both models and the complete CC0 notice;
Android CI verifies their bundled bytes as well as the existing offline media.

This is a reduced-work/resource-budget validation, **not a phone FPS guarantee**. Software
WebGL test duration and alternating shadow/non-shadow draw counts are not Android benchmarks.
The new materials also receive shadows and the distant head has more detail, while the long
lens changes which stadium cells are visible. Measure identical presets/positions on a real
phone in ready, run-up, flight, crowd reaction and replay before claiming equal/better sustained
FPS, battery life, or thermal behaviour. No proprietary football-game visual parity is claimed.


Final local verification for this pass: **122 unit tests + TypeScript pass**, **16 Chromium/WebGL
E2E tests pass**, and **production build / Capacitor Android sync pass**. Both anatomy files
and their license notices match the Android asset bundle byte-for-byte. Android Gradle APK/lint
compilation and physical-device GPU profiling have not been run locally for this pass.

## Native phone resolution fix — 17 October 2026

Native (100%) now bypasses the mobile 2× DPR cap. A 772×360 CSS viewport at DPR 4 can
select and actually allocate a 3088×1440 drawing buffer, rather than being limited to
1544×720. The reduced 75%/Half phone modes retain the existing capped power-saving budget,
and default presets are unchanged. The option labels explicitly distinguish Native from
capped modes and use the same floor rounding as Three.js. Labels refresh on resize/rotation
without replacing option nodes on unrelated setup input.

Tests verify the DPR calculation, native preference persistence, actual 3088×1440 canvas
backing-buffer allocation, portrait rotation to 1440×3088, and returning to capped modes.
Native means the resolution exposed by Android/WebView or the browser for the game viewport;
it cannot override an Android FHD display mode or include space occupied by browser chrome.
Rendering four times as many pixels as the old 2× cap on a DPR-4 phone costs more GPU work;
Native is an explicit quality choice, not the new default or a promised FPS improvement.

Validation: TypeScript + all 127 unit tests, all 17 browser tests, production build, and
Capacitor Android asset sync passed. No physical-phone FPS or thermal benchmark was run.


## True native percentages and cheaper smoothing — 17 October 2026

- All devices now use `validDeviceDpr * renderScale`. For 3088×1440 native, 75% is
  2316×1080 and 50% is 1544×720 (56.25% and 25% of native pixel count respectively).
- High uses native + FXAA, bloom and 1024 shadows. Balanced uses 75% + FXAA without bloom;
  phone Balanced shadows remain 512. Performance uses 50%, no AA/bloom/dynamic shadows.
- The HDR targets have zero MSAA samples. FXAA adds one full-screen pass after the fused
  output/grade; optional SMAA retains its three internal edge/weight/blend stages. AA modes
  are exclusive, never stacked. Legacy saved multisampling migrates to FXAA.
- Reference elevation uses the same quadratic drag as flight; a single-entry calibration
  cache avoids repeating the solve while only release power changes during charging.
- Hair remains cached and opaque with one merged draw. Curl detail uses small rooted clumps,
  not oversized beads. Joint caps and neckline sealing trade a little geometry for no holes;
  shared buffers/LOD, palette sharing and hidden-rig pruning remain intact.
- The ball now has spherical 32-panel colour/seam maps, separate relief (rather than treating
  black paint as a depression), lower anisotropy and 48×32 tessellation versus 64×48 before.
- Card diffraction is CSS only and transitions on hover/focus/selection; no per-frame JS,
  continuously animated 38-card shader, extra asset download or AA render target.

True 75% on a DPR-4 phone is more work than the old misleading capped mode. These changes
remove unnecessary GPU work; they do not guarantee higher FPS at higher real resolution.
Physical-phone FPS, battery and thermal measurements still need a real device.
