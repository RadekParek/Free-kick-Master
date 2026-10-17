# Free Kick Master 2.0

**The pitch is yours.** An original, playable 3D free-kick practice game for the browser and Android, built from an empty repository.

## Play

```bash
npm ci
npm run dev
```

Open the Vite URL. The server binds to `0.0.0.0` and accepts Arena preview hosts. No backend, accounts, API keys, asset CDN, or game-server connection is needed.

### Controls

- **Music:** your five custom songs (including Worms and Parado no bailão) start in shuffled order. The menu/in-game song-title button toggles music, with previous/next beside it. Browsers that block autoplay start after a tap or keypress. Music pauses while the app is backgrounded. [Soundtrack details](src/soundtracks/README.md).
- **Menu:** Play (five-kick challenges), Practice (free kicks), Players (the roster), Settings, and How to play. Practice fills the whole screen with only gameplay controls; **Back** returns to the menu.
- **Settings:** a full-screen, scrolling screen with Pitch & Keeper and Visuals & Sound tabs. Open it from the Settings button (or **Escape**) during play; **Back to the pitch** returns to the shot. The fullscreen button hides browser chrome where permitted.
- **Choose a player:** open Players from the menu, or press **T** in play. Search by name/nation, filter by foot or edition (standard, ICON or turquoise special), then select the card.
- **Set your spot:** in Settings, tap/drag the mini pitch or choose a flank; use the distance slider. Arrow keys work when the mini pitch is focused. Direct kicks stay outside the penalty area.
- **Aim:** drag the 3D pitch, tap near the goal, or use the arrow keys. Aim is a launch direction, not a guaranteed destination.
- **Contact:** drag the marker on the ball. Left/right contact adds opposite sidespin. Lower contact adds lift/backspin; higher contact lowers the launch and adds topspin. Curl, knuckleball, and driven presets are starting points.
- **Shoot:** hold the lime button or **Space**; release for the run-up and strike. The trajectory preview uses that power until charging, then your actual power.
- **Replay:** click the replay button or **R** after a shot. Replays use recorded states and do not count again.
- **Camera:** **V** or the camera button. **Escape** pauses in Settings. Settings also control sound, guides, haptics, and graphics quality.

Keyboard/assistive activation of the shoot button also supports Enter to start charging and Enter again to release. Maximum charge automatically releases after a short hold.

## Features

- A fully rendered 3D stadium: smoother articulated athletes, batched architecture, photographic-style baked crowd, procedural turf/ball, pitch markings, shadows, LED boards, goal frame, and animated net.
- **Main menu** in the style of modern football-game menus, with a full-screen gameplay view and a full-screen, scrollable settings screen.
- **30 roster cards:** 15 players, each with a turquoise special (higher ratings, turquoise foil, handwritten name). The ratings and attributes are placeholder fan-made values, not EA or FC27 data.
- **Ronaldo, Messi, Mbappé, and Salah** with credited real June/July 2026 photos. The other players use generated monogram art. All cards carry fan-made training ratings, not official FC27 cards or a complete or live database.
- **36% stronger base curl** and a visibly stronger, low-frequency knuckle wake with repeatable late changes of direction.
- **Floodlit night / golden hour / clear day**, native device-pixel resolution (no adaptive downscaling), distance-based LOD and culling, and a live performance monitor.
- Movable free-kick positions across the attacking training half; roughly 18–55 m radial range, with closer wide-angle positions.
- Regulation 7.32 × 2.44 m goal and a wall centred 9.15 m away, with 0–5 defenders.
- **Live woodwork rebounds:** inside-post and crossbar deflections can still score; angle-based, energy-losing round-frame collisions replace the old special case. Only the final result counts.
- **Richer animations:** head/elbow articulation, preparation, continuous follow-through, goal/miss reactions, keeper set-steps, varied reaches, landing and recovery.
- Fixed 120 Hz flight: gravity, drag, spin-induced movement, high-power knuckle wake, turf bounces, swept wall/frame collisions, full-ball goal-line checks.
- Five physically different keeper levels: reaction delay, lateral speed, reach, height, and anticipation—not a random save percentage.
- Foot selection, animated run-up and keeper dives, two camera angles, slow-motion recorded replay, synthesized audio.
- Session goals, attempts, conversion rate, streak, recent shots; saved preferences and personal bests.
- Three five-shot challenges: **Top bins only**, **From way out**, and **Bend the rules**.
- Fullscreen desktop and portrait layouts, plus a compact immersive landscape Android layout. No persistent dashboard takes space from the pitch.

## Android APK

The committed `android/` project is a **Capacitor Android app**, not a remote website shortcut. The production game, fonts, player photographs, crowd texture, geometry generation, and audio are bundled into the APK and run offline in an accelerated WebView.

The **[Android APK workflow](https://github.com/RadekParek/Free-kick-Master/actions/workflows/android.yml)** builds and uploads:

- `Free-Kick-Master-debug.apk` — installable, debug-signed personal-testing build
- `SHA256SUMS.txt`

A push to `main` or an `arena/**` branch, a PR to `main`, or a manual run triggers the workflow. Download the **Free-Kick-Master-Android** artifact from a successful run and extract the APK. You may need to be signed in to GitHub to download Actions artifacts.

To build locally with **Java 21 + Android SDK 35**:

```bash
npm ci
npm run android:apk
# android/app/build/outputs/apk/debug/app-debug.apk
```

For Android Studio: `npm run android:sync && npm run android:open`.

See [Android build/install notes](docs/ANDROID.md) for SDK setup, device requirements, signing, and troubleshooting. A release for public distribution needs your own private signing key; no release key is committed.

## Verification

```bash
npm run check       # TypeScript + deterministic physics/keeper tests
npm run build       # Production browser build
npm run test:e2e    # Real Chromium/WebGL interaction + responsive/touch tests
npm audit          # Dependency audit
```

Browser tests use the npm-distributed headless Chromium on Linux; set `PLAYWRIGHT_CHROMIUM_PATH` to use a system Chromium. On macOS/Windows install Playwright's Chromium (`npx playwright install chromium`). Screenshots and native build products are ignored, not checked into Git.

## What “FC-style” means here

EA documents the **aim → contact/spin → hold/release power** loop and trajectory preview. [2](https://help.ea.com/en/articles/ea-sports-fc/free-kicks/) This game independently implements that interaction model with touch controls. **It does not claim identical FC27 physics, animation, AI, attributes, or graphics.** Those algorithms are not published in that guide. No EA code, official card artwork, player scans, official game kits, or ripped game assets are used. Player photos are independently licensed from Wikimedia Commons, with credits and dates in-game and in [photo notices](public/players/LICENSE.md). 3D avatars combine original articulated bodies, fitted hairstyles and nation-inspired training kits with generic CC0 MakeHuman head anatomy—not scanned player likenesses. See [model provenance and license](public/models/README.md). The custom soundtrack uses user-supplied recordings; see [soundtrack notes](src/soundtracks/README.md) for redistribution considerations. Photograph copyright licenses do not grant athlete publicity or trademark rights for commercial distribution.

[Mechanics research and explicit approximations](docs/MECHANICS.md) · [Architecture](docs/ARCHITECTURE.md) · [Third-party notices](docs/THIRD_PARTY.md)

## Performance and roster expansion

Static stadium pieces are spatially batched by material with frozen transforms; distant crowds use one baked mesh with a procedural fallback. Guide/trail GPU buffers are reused, aim-preview updates are coalesced, invisible work is skipped, and paused scenes stop scheduling frames. Net deformation is cached and graphics changes rebuild only affected resources. Visible scenes retain the display frame rate; these optimizations do not change graphics preset values or add adaptive downscaling. See [the performance optimizations and verification notes](docs/PERFORMANCE.md). No physical-device frame-rate guarantee is made.

The curated catalogue is in `src/players.ts`. To add a player, add a validated profile and a locally bundled, appropriately licensed portrait, then update attribution. Search, filtering, selection, foot, attributes, and kit colours automatically use the catalogue. **There is no authenticated/live FC27 card feed or official full-card import in this build.** Do not relabel these original ratings as EA data.

## Stack

TypeScript · Three.js · Vite · Capacitor 7 · Vitest · Playwright. All rendering and gameplay run locally; no personal data is sent anywhere.


### Native scaling and realism update (17 October)

All render scales are actual percentages of the device-reported native viewport: 100%, 75%,
50%, with no hidden phone cap. High now uses native resolution and fast FXAA instead of MSAA;
Custom also offers SMAA or Off. [Upgrade notes](docs/REALISM_UPGRADE.md) cover seeded knuckle
flight, revised aerodynamics/turf response, closed player joints/necklines, catalogue-height
scaling, signature poses, outside-foot animation and original holographic-style shield cards.

## Latest cinematic / ICON update

See [the cinematic replay, ICON, DOF and performance update](docs/CINEMATIC_ICON_UPDATE.md) for recorded run-ups and rotation, immediate goal analysis, the 64-trial conversion estimate, model-aligned collisions, five-track playback and eight workload reductions. DOF defaults on only in High and can be toggled in Custom. The roster has 42 cards, including Roberto Carlos, Ronaldinho, Zidane and Beckham ICON tributes.

### Previous presentation update

See [player realism, PlayStyles and HyperMotionV-inspired analysis](docs/PLAYSTYLE_PRESENTATION_UPDATE.md) for the complete change log, GPU/CPU optimizations, validation and explicit technology/asset-rights limitations.
