# Player realism, PlayStyles and HyperMotionV-inspired presentation

Updated 17 October 2026. This includes the preceding 18-point update and the follow-up request to improve models, accept FC24–FC27 icons, expand analysis, optimize and create/merge a PR.

## What “HyperMotionV” means here

The replay visibly says **HyperMotionV** with **“INSPIRED · FAN-MADE REPLAY”** and **“FC / FIFA–INSPIRED PRESENTATION · NOT EA TECHNOLOGY.”** This is an original presentation inspired by FC/FIFA replays, not EA's proprietary volumetric-match-capture, trained animation systems, licensed engine or motion dataset. The naming is a reference, not a claim of integration or endorsement.

### Goal-analysis sequence

After 1.8 seconds of goal celebration, the recorded shot enters an 8.2-second sequence:

| Replay clock | View |
| --- | --- |
| 0–0.75s | Spatial scan, green title wipe, pitch grid, wide broadcast overview |
| 0.75–1.55s | Exact launch/contact freeze, low camera beside the taker |
| 1.55–4.8s | Recorded ball flight, tracking/orbit camera, progressively revealed white trajectory |
| 4.8–6.5s | Goal-entry freeze, close-up camera, entry ring and height ruler |
| 6.5–8.2s | Wide shot overview with measured data |

- Speed is launch speed, distance is the existing kick-to-goal-centre horizontal distance, entry height is the actual goal-line crossing height. No invented xG.
- The launch frame is now explicitly recorded before the first fixed tick; interpolation is aligned to the 60Hz replay samples.
- Physics and scoring are **not** run again during playback. No goals/attempts are recounted.
- **Skip** restores the saved result immediately. Pause suspends both playback and CSS title/progress animation.
- Non-goals retain ordinary 0.55× replay. All visible wording is “Replay,” not “Instant replay.”
- The white analysis trajectory and grid appear only in goal analysis; there is no live blue flight trail.

## More realistic player models

- Shorter exposed neck with a shaped jaw/neck transition, narrower throat and shoulder/collar shaping.
- More anatomical chest/waist contour and sewn-cloth folds; less cylindrical upper arms, elbow transitions, forearms and wrists.
- More natural eye spacing, separate dark pupils, curved dark brows, less chalky eye whites and individual iris colours.
- Conservative player-specific nose, chin, mouth and facial-width/depth variations; warm cheek/eye-socket vertex shading and subtle skin/hair normal detail.
- Fixed a real bug: `fitStature` was overwriting the player-specific athletic width. Build scaling now happens **after** stature fitting and is verified in browser tests.
- Specials share the base identity while keeping turquoise kits/cards. Exact stature, two articulated LODs, opaque surfaces and boot-to-ball alignment are retained.
- Existing base-rig budgets remain below **22,000 high / 7,000 low triangles** (before the separately attached hairstyle). Tests were not relaxed to accommodate the update.

**Limit:** these are improved original articulated models using the bundled CC0 head base, not photoreal celebrity scans, EA player models or motion-captured performances. Jointed procedural meshes still have visible limitations in close-up.

## PlayStyle+ icons and effects

The user now accepts **FC24–FC27**, so the unchanged original EA PNGs from the pinned FC26 mirror meet the requested version range. They are bundled locally/offline, not generated lookalikes. Pin, file mappings and rights notices are in `public/playstyles/README.md`. No unsupported FC27-specific byte-equivalence claim is made.

| Custom assignment | Gameplay |
| --- | --- |
| Finesse Shot+: Messi, Yamal | ×2.35 sidespin; +6% launch speed |
| Power Shot+: Ronaldo, Haaland | Exactly +10 km/h below 50%; +20 km/h at/above 50%, after attribute scaling |
| Dead Ball+: Neymar, Vinícius, Musiala, Dembélé | Full goal-line preview with six-second budget; 85% less overpower elevation error; stable wake matching preview |

Special cards inherit the base player's assignment. These assignments and training attributes are not official EA ratings. Dead Ball predicts unobstructed flight at the current power, not keeper/wall/post deflections.

## Additional UI and gameplay fixes carried into this PR

- Removed motivational charge messages, suggested-power text, sweet-spot marker and black power-block backing.
- Removed blue flight-trace geometry, history copying and GPU uploads entirely.
- Aim preview is a 2 CSS-pixel thick line; ordinary preview shows 80% of the path. Dead Ball+ shows the full path.
- Normal card names are typeset; handwritten names only on turquoise specials.
- Added all 14 missing local photographs: all 38 cards now have images. All 35 players appear in credits with sources/rights status. Some images are action shots rather than studio portraits.
- Corrected Saka, Griezmann, Dovbyk, Kulusevski, Højlund and Ødegaard to left-footed; Luis Díaz to right-footed. Migrates old incorrect defaults once, but preserves new deliberate alternate-foot choices.
- Icon-only Back and Pause/settings controls, retaining accessible names/tooltips.
- Camera arrows: 2° steps and ±20° limit, pivoting around the taker instead of the distant goal.
- General sidespin +~11%, knuckle wake strength +12%, retaining bounded aerodynamic forces and deterministic replay.
- Each wall defender independently has a 25% non-jump chance, rolled once per attempt and shared by collisions, live animation and replay. Existing independent 20% wall-gap behavior remains.
- Denser, thicker grass and a radial near-field patch that follows the kick without a visible square boundary.

## Safe CPU/GPU optimizations

No new automatic resolution, AA, shadow, texture, crowd or LOD-distance reduction is introduced. The model changes above are visual upgrades, not claimed to be pixel-identical to the old geometry.

1. **GPU net deformation:** the same damped sine/decay equation, same coefficients and 3-second settling window now execute in the vertex shader. Wave parameters upload once per impact; the net position buffer never rewrites/uploads every frame. Original colour, opacity, topology and padded culling bounds are retained. Reference-equation tests cover equivalence within floating-point tolerance.
2. **GPU analysis path reveal:** recorded positions/timestamps upload once. A reveal-time uniform clips the line in the shader; no per-render geometry changes or new point objects.
3. **GPU pitch scan:** one ground quad with derivative-antialiased grid/sweep shader; no CPU-generated grid vertices, full-screen render target or readback.
4. **GPU entry-ring pulse:** uniform-driven vertex motion rather than object transforms/geometry uploads.
5. **Shared-material deduplication:** studio environment setup changes each unique material once, and skips identical assignments, avoiding redundant material version/shader invalidations.
6. **Cached facial masks:** Gaussian landmark masks are precomputed once per owned face buffer; later profiles reuse them. Selecting another edition of the same identity skips redundant morphing/normals work.
7. **Indexed roster/PlayStyle lookup:** Maps replace repeated array scans, callbacks and temporary assignment arrays in the setup/preview path. Results and fallback behavior remain the same.
8. **Allocation-free analysis choreography:** one persistent frame scratch object, with DOM stage labels updated only at stage boundaries. No per-frame layout measurement/readback.
9. **No flight-trace workload:** old trace draw, buffer shifting and segment uploads are gone; replay recording remains independent.
10. **Grass efficiency:** 34,560 old field blades ×3 triangles = 103,680 triangles. Now 69,120 field blades +12,000 near blades ×1 triangle = 81,120: **2.35× blades, ~21.8% fewer triangles at High**. Grass, crowd and flags already animate on GPU. Near-field movement updates one frozen world matrix, not 12,000 instance matrices. Blades deliberately use a simple thick silhouette to fund the denser coverage.
11. **Existing safeguards retained:** persistent thick-guide storage, hidden-preview skipping, six-identity texture cache/eviction, static stadium transforms, articulated LODs, shader-driven vegetation/crowd and exclusive FXAA/SMAA.

### Why not rewrite in another language?

No profiling evidence justifies a Rust/C++/WASM rewrite here. A language change would not accelerate rasterization, fill rate or draw submission by itself; moving physics to GPU would require synchronization/readback and risk deterministic collisions/replay. The fixed 120Hz simulation therefore remains TypeScript. GPU work was moved only where it is independent presentation with a clear data-transfer saving. These are concrete workload reductions, not an unmeasured Android FPS guarantee.

## Validation

- **TypeScript + all 184 unit tests pass** (14 test files, final run).
- Targeted browser tests passed: all 38 rendered identities/boot contacts, automatic staged analysis, measured labels, shader compilation, pause/skip without recounting, and post-and-in replay.
- **All 19 browser tests pass** (final full run, 6.2 minutes), including portrait/landscape analysis layout and 3088×1440 native rendering.
- **Production build + Capacitor Android sync pass. All 80 production files match the Android bundle byte-for-byte**, including every icon, photo and provenance notice.
- Android Gradle APK/lint validation is performed by the PR CI; no physical-device profiling has been performed here.
- Inspected screenshots of scan/flight/entry UI and updated models.
- Existing non-fatal Three.js >500KB chunk warning remains.

## Remaining limitations / distribution notes

- Not EA's HyperMotionV engine or a photoreal scanned roster; no proprietary EA motion dataset is included.
- Physical-phone FPS, thermals and visual equivalence still need testing on the target Android device. Desktop software-WebGL tests cannot establish those results.
- EA icon/mark copyright and athlete publicity rights remain with their owners. Four original portraits retain CC BY-SA notices; many other photographs have no verified redistribution license. Obtain appropriate rights or replace assets before public/commercial distribution. A public GitHub mirror is not a copyright license. No watermark removal was performed.
- The official FC27 asset URLs remain documented for reference, but FC27-specific replacement is no longer required by the accepted FC24–FC27 scope.

The follow-up request explicitly authorizes a PR and merge; the earlier conditional “do not merge until literally everything” gate has been superseded. Merge will follow successful validation/CI, with these limitations disclosed rather than described as completed proprietary technology.
