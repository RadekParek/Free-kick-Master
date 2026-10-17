# Performance-only update — 18 October 2026

**30 new workload reductions. No graphics preset, resolution, model, texture, effect, animation cadence, physics rule or feature is removed or downgraded.** This changelog counts only changes since `d7896bf4a1fe718a201af7f50fe1c076f203b64a` (merged PR #11), not optimizations already shipped in earlier updates.

Native 3088 × 1440 remains available. The 75% and 50% choices remain true native fractions. High/Ultra bloom, DOF, AO, surface detail, lens finish, shadows, the animated crowd/net/flags, full-rate visible animation, recorded run-ups, replay cameras/statistics, all 57 cards and ICON/PlayStyle gameplay remain intact. There is no adaptive downscaling or new reduced-detail mode.

## Numbered optimization changelog

| # | New change | Work avoided / correctness boundary |
|---|---|---|
| 1 | Remove depth attachments from **all 11 bloom colour-only targets** (`post.ts`). | Bright extraction and the ten blur targets never consume depth. Scene/DOF/AO depth and every colour target's format, dimensions, samples and filtering stay unchanged. This is additional to PR #11's separate AA intermediate-depth change. |
| 2 | Disable unused depth testing/writing on bloom high-pass, blur/composite materials and FXAA. | Removes depth work from these full-screen colour draws, including FXAA's final canvas write. Does not alter scene-material depth, bloom blend behaviour, shader code or sample kernels. |
| 3 | Exit identical `PostStack.setSize` notifications before AA/DOF pixel-uniform writes. | Existing render-target resize guards are retained; the new guard also skips uniform setters. DPR-only changes still update every dependent size. |
| 4 | Cache thin-lens focal-length trigonometry by actual camera FOV. | Focus distance and near/far clipping uniforms stay live each frame; FOV changes invalidate the cache immediately. |
| 5 | Resolve collision limb topology once in each collider constructor. | Removes repeated interpolated bone-name strings/property lookups when rebuilding 16 posed capsules. Joint order and shape dimensions are unchanged. |
| 6 | Transform capsule endpoints directly with their affine world matrices. | Replaces 32 general-purpose `Vector3.applyMatrix4` calls and homogeneous divisions per body build; keeps sum order and exact endpoint coordinates. The former endpoint vectors were already reused, not per-tick allocations. |
| 7 | Add conservative, radius-expanded per-capsule AABB rejection. | Non-overlapping swept queries avoid exact segment solving. A roundoff guard includes tangencies; overlapping cases still use the original finite-segment contact algorithm. |
| 8 | Cache capsule direction/length and share swept-query direction/length across exact tests. | Avoids rebuilding common segment invariants for every narrow-phase check; point, parallel and degenerate segments retain the same handling. |
| 9 | Let `launchBall` reset caller-owned ball storage; reuse that ball through all conversion trials. | Preserves the default independent-object API while eliminating 63 ball/position/velocity triples per 64-trial request. Every launch field, including wake phase and contact counters, is reset. |
| 10 | Reuse synchronous guide-sampling ball and previous-point workspace. | Removes four repeated dynamics-object allocations after warm-up. Public object previews still return independently owned points; persistent Float32 guides retain identical bytes. No guide sampling/cadence change. |
| 11 | Reuse conversion trial setup/aim/contact records. | Avoids 63 further setup/aim/contact triples. Inputs remain unmodified; seeded random calls retain their exact order and distributions. |
| 12 | Reset conversion keeper/glove dynamics in place. | Avoids 63 keeper/glove pairs. A request retains its configured yaw/anatomy, while every dynamic field is restored for each independent trial. |
| 13 | Compute the keeper-plane contact point only after a body save is confirmed. | Missed goal-line crossings no longer construct an unused point. Saved-event coordinates and reverse/rebound crossing semantics are unchanged. |
| 14 | Compute nominal recommended launch power once. | Removes a duplicate distance/hypotenuse calculation for attributed players; the same value feeds control penalty and reference-speed calibration. |
| 15 | Skip quaternion conversion when a dirty Euler pose ends at its last flushed rotation. | Handles repeated writes and reset-then-restore animation patterns. Direct quaternion edits and changes to any of the six Euler orders still invalidate correctly. This extends, rather than recounts, earlier deferred-Euler batching. |
| 16 | Cache each athlete's actual deferred-bone list. | Removes repeated `instanceof` checks over every animated joint at each pose flush; the same bones are still flushed. |
| 17 | Diff low-LOD joint copies. | Unchanged positions are not rewritten; identical quaternion copies no longer trigger Three's quaternion-to-Euler conversion. LOD thresholds, geometry, pose evaluation and synchronization remain unchanged. |
| 18 | Add coherent timestamp cursors to flight and run-up recordings. | Ordinary playback finds its current/next interval without a full binary search. Backward/random seeks use the original logarithmic search, preserving duplicate timestamps, final contact samples, append/clear and clamping behaviour. |
| 19 | Avoid inverse trigonometry in replay's existing near-identical-quaternion branch. | Keeps the same linear weights and normalization. Full spherical interpolation still runs for larger rotations. |
| 20 | Share approach distance between the current and preceding run-up positions. | Removes one repeated hypotenuse per run-up update while preserving the complete curved ground path. |
| 21 | Reuse the face-ball heading and compare squared approach displacement. | Avoids a square root and a repeated fallback `atan2` without changing the travel/plant blend or model orientation. |
| 22 | Replace per-frame wall-pose callback closures with direct loops. | Covers standing, flight, result and replay phases. Identical visibility conditions, jump decisions, timestamps and pose calls; no additional culling or skipped frames. |
| 23 | Update motion trigonometry only for the active crowd representation. | Once photo crowd loads, dormant procedural uniforms stop computing four trigonometric values. During load/failure, procedural animation remains active and unused photo-motion math is skipped instead. Visible crowd cadence is unchanged. |
| 24 | Replace general structured-clone traversal with a typed, owned Settings snapshot. | Copies the full flat schema and all four nested mutable records. UI/arena settings do not alias; no settings or persistence semantics change. A schema-coverage test guards future nested additions. |
| 25 | Read the taker's world-space head anchor only when its PlayStyle badge can be visible. | Skips unnecessary matrix-chain reads during the menu, ordinary ready/result time, later flight and pause. Badge eligibility, anchor offset, timing and projection are unchanged; replay metrics still obtain their own anchors. |
| 26 | Dirty-check owned world-label visibility and formatted transforms before DOM access/writes. | Caches private presentation state, avoiding repeated class-list queries and same-transform assignments. Camera/point changes still project each frame; stationary labels cause zero DOM mutations in the browser test. |
| 27 | Memoize settled world-stat number formatting. | After the same 0.36-second count-up, stable target/precision values avoid formatting and DOM text reads. New metrics, changed numbers/precision and pending conversion results invalidate immediately. |
| 28 | Retain stable power-HUD element references at mount. | Removes repeated document selectors from charging callbacks. Existing percentage/threshold diffing, width updates, accessibility values and power behaviour are retained. |
| 29 | Capture roster card nodes once per modal instance. | Selection/filter operations reuse the existing 57-node list rather than querying and spreading it repeatedly. Reopening creates fresh references, not a stale global cache. |
| 30 | Build roster search records once per modal opening. | Name/nation/specialty/edition strings, player lookup, locale folding and accent normalization are not recomputed for all 57 cards on every key/filter event. Queries still normalize on input; all filters and accented searches retain the same results. |

## Measured evidence — not a handset FPS promise

### GPU allocation/state and pixels

- Real headless Chromium WebGL renders compare optimized output with the **original bloom/FXAA depth defaults restored**, using the exact same shader programs and scene.
- All **12 combinations** of AA off/FXAA/SMAA × DOF off/on × AO off/on produce **identical PNG pixel output**. Bloom and lens finish remain enabled. SMAA lookup images are decoded before comparison.
- Actual framebuffer attachment queries confirm **11 absent depth attachments** in the optimized bloom chain and **11 renderbuffers restored** for the reference chain. No GL errors.
- At native **3088 × 1440**, the unchanged bright/blur sizes cover **4,073,310 depth samples**. Eliminating their D24 storage removes approximately **11.65 MiB of logical depth payload**, or about **15.54 MiB on implementations storing each sample in 32 bits**. Actual allocation/padding is driver-dependent; this is not a measured Android VRAM number. HDR colour targets and real scene depth are not reduced.

### Reproducible CPU workloads

Run `node scripts/performance-benchmark.mjs` after `npm ci`. The pinned baseline commit must exist locally; shallow clones may need to fetch their history first. The script extracts only the pinned baseline modules using `git show` into ignored scratch storage: no branch switch, checkout modification or network is involved. It runs three warm-ups per side and nine alternating-order, interleaved measurements in the same Node process. All settings copies are retained to prevent dead-code/escape elimination.

Recorded on Node **v22.22.3**, sandbox **Intel Xeon 2.60 GHz**, 18 October. Full sample arrays and methodology are in [the measurement record](performance-benchmark-2026-10-18.json). Wall time is affected by JIT, GC and shared-host load.

| Synthetic workload | Baseline median | Updated median | Less CPU wall time in this run |
|---|---:|---:|---:|
| Five 64-trial conversion estimates | 40.311 ms | 37.598 ms | 6.7% |
| 10,000 full guide previews | 90.550 ms | 86.633 ms | 4.3% |
| 10,000 keeper poses + off-body sweeps | 27.255 ms | 18.378 ms | 32.6% |
| 10,000 mixed keeper/wall poses + sweeps | 30.855 ms | 22.904 ms | 25.8% |
| 60,000 joint poses, 75% unchanged rotations | 2.255 ms | 1.444 ms | 36.0% |
| 100,000 sequential replay samples | 42.692 ms | 35.589 ms | 16.6% |
| 10,000 owned Settings snapshots | 54.515 ms | 1.958 ms | 96.4% |

These are **isolated CPU workloads, not whole-game speedups**. In earlier same-process runs, preview medians were about 1% slower/within sample variation; treat its benefit primarily as allocation reduction, not an established timing gain. Conversion-trial reuse alone removes **504 short-lived setup/ball/keeper objects per 64-trial request** by source-level accounting (the JS engine can optimize some baseline allocations). Results do not establish physical-phone FPS, sustained thermals, battery life, GPU timing or a particular Android frame-rate gain.

## Regression and delivery validation

- `npm run check`: **255 unit tests across 17 files**, including 34 new tests. TypeScript passes.
- Sixteen fixtures were captured **before** the update: all recorded ball/keeper states and terminal events remain strictly equal, Float32 guide coordinates remain equal, and every 64-trial conversion result is identical. These are independent stored baseline results, not expectations regenerated from the optimized code.
- **12,000 seeded capsule queries** match exhaustive exact checks, including point/endpoint/swept cases; tangencies and degeneracies receive extra coverage. Affine endpoints match Three's general matrix transform exactly.
- Original run-up positions/yaw match across **3,870 pitch/foot/phase combinations**. All Euler orders, direct quaternion changes, repeated poses, settings ownership, arbitrary/duplicate-time replay seeks, clear/append, DPR-only resizing and focus invalidation are covered.
- New browser tests cover the 12 GPU variants, zero redundant stationary/hidden label mutations, live camera/value/count-up invalidation, hidden-anchor skipping, accent-preserving search, normalization counts and modal recreation.
- Full 28-test browser regression suite: **28/28 pass (8.8 minutes)**.
- Production build and `npm run android:sync`: **pass**. Offline verification: **all 103 build files byte-identical**, including 54 portraits, five songs and the simulation worker. Remote APK/lint checks: **pending CI**.

The existing scene assets, player catalogue, PlayStyles, soundtrack, shaders and graphics preset values are not changed. No new third-party assets or runtime dependencies are introduced.
