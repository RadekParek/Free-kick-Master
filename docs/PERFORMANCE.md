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
