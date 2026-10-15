# Performance changes — 14 October 2026

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
