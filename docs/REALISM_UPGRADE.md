# Realism and graphics upgrade — 17 October 2026

This is an original offline training game. The comparison below uses football dimensions,
plausible physical behavior and football-card presentation conventions. It is **not** an
independent current FC27 asset audit, reverse engineering of its physics, a copy of its card
art, or a claim of visual parity with its scanned athletes and motion capture.

## Request-by-request implementation

| Request | Change | Verification / limit |
| --- | --- | --- |
| 75% and 50% must use maximum resolution | Full reported DPR × scale on phones and desktops; no hidden cap. Live labels use renderer floor rounding and refresh on rotation. | At 772×360 CSS / DPR 4: native 3088×1440, 75% 2316×1080, 50% 1544×720. Browser checks real canvas dimensions, including portrait rotation. |
| Replace expensive MSAA | Exclusive FXAA / SMAA / Off; zero-sample HDR and canvas targets. Presets use FXAA, except Performance (Off). Old custom MSAA settings migrate. | Unit target/sample/texel tests; real WebGL rendering through all modes. FXAA is faster/lighter but can soften fine text/detail. |
| More realistic ball physics | Size-5 radius 0.11 m, mass 0.43 kg, quadratic speed-dependent drag, capped lift, spin decay, no fake extra-apex gravity, dissipative bounces, spin/slip exchange and rolling resistance. | Gravity, energy dissipation, bounded flight, preview consistency and swept collisions. Aerodynamic/friction coefficients are approximations, not measured ball-brand/turf fits. |
| Identical knuckle inputs should vary | New phase seed once per live release; smooth speed-dependent wake, no per-tick random impulses. Stable seed-zero guide. | Same seeded shot repeats; different seeds diverge without changing initial aim/speed; ordinary curl remains deterministic. Replay samples captured states. |
| Ball and surroundings more convincing | Spherical 32-panel ball pattern and seam-only relief, physical-spin-axis visual rolling. Side/roof/back net contacts dissipate velocity; scored balls can rebound out of the open front without recounting. | No arbitrary mandatory dip, goal steering or goal/save random success rolls. Net geometry still uses a bounded visual ripple, not a full cloth solver. |
| Player seams / head / neck / transparent patches | Close rigid sections and imported neckline; overlapping elbow, shoulder and neck surfaces. Shorter neck placement, smaller inset eyes/eyelids and brows; cleaner shorts overlap. Skin/kit/hair remain opaque. | Open-boundary tests, opacity checks and actual model renders. Rigid procedural articulation, not a full continuous skinned celebrity body. |
| More detailed, correct hair | Rooted, directional hair volumes; smaller curl clumps and root shading replace oversized beads. Yamal standard/special are blonde and left-footed. | Cached high/low geometry and explicit profile tests. This is the requested blonde style, not a promise of a player's current haircut. |
| Real player heights | Fit both LODs to catalogue sole-to-skull height, excluding hair; calculate true geometry floor instead of dividing by assumed 1.83 m. Generic keeper is 1.90 m. | Every catalogue card checked at both LODs. Listed heights are approximate football-profile values, not fresh biometric measurements. |
| More believable keeper | Acceleration-limited lateral motion, pre-contact split-step, push-off, trailing-knee tuck, reach, landing and recovery. | Bounded-acceleration test; no change to outcome after replay. Save reach remains a simplified body/glove volume, not full glove IK. |
| Ronaldo/Neymar own standing pose | Ronaldo's wide, squared set stance; Neymar's asymmetric relaxed weight shift, with breathing and elbow motion. Preserved during preparation. | Distinct deterministic poses; reset tests prevent stale joint rotations. Authored interpretations, not motion-captured signatures. |
| Dramatic run-up / outside foot | 1.65-second accelerating curved approach, counter-rotation, planted support, ankle inversion/hip adduction for outside versus inside contact; low impact then higher follow-through. Horizontal final-plant correction keeps the boot at the ball. | Left/right mirroring, exact impact-to-follow-through continuity, real scene boot-contact checks. No full gait/contact IK. |
| FC-style cards / special foil / handwriting | Original arched shield, inset metallic frame, radial guilloché, more prominent rating, four honest training stats and height. Handwritten names. Turquoise diffraction gradients and an original FK seal respond to hover/focus/selection. | No copied FC artwork/logos or official rating claims. Reduced-motion preference honored; no continuous card animation loop. Existing portraits/provenance unchanged. |
| Optimize while upgrading | No MSAA or stacked AA, shared model geometry/LOD/materials, cached hair, bounded reference-angle cache, cheaper ball mesh/texture filtering and CSS-only foil. Subtler fused grading for less oversaturated skin/kit tones. | No physical-phone FPS or thermal claims. True native-relative resolutions can cost more than the old capped labels. |

## Deliberate limits

“More realistic” here does not mean a full real-world simulator or AAA scanned likenesses.
The game remains procedural and mobile-focused. It does not include wind simulation, a full
cloth/hair solver, full-body skinning/motion capture, exhaustive contact IK or an exact FC27
physics/card implementation. The guide cannot predict the particular random knuckle wake
that will be captured on a future release. Android/WebView must expose the phone's native
resolution; an OS FHD display setting or browser chrome cannot be overridden by JavaScript.

## Validation

- TypeScript and all **149 unit tests** passed (12 files).
- All **17 browser tests** passed, including real native/75%/50% buffers, rotation,
  all three AA modes, mirrored boot contacts, gameplay, challenge scoring and replay.
- Production build and Capacitor Android asset sync passed. The existing large Three.js
  chunk warning remains non-fatal. No APK compilation or physical-phone benchmark is claimed.
- Actual WebGL gameplay, model-study and roster screenshots were inspected. Model-study
  views use the real game assets/pipeline on a plain background, not the gameplay camera.
