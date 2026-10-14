# Third-party notices and asset provenance

The stadium geometry, procedural turf/ball, training kits, articulated 3D avatars, UI/card layout, logo, launcher art, and synthesized sound routines are original. No EA code, official FC card artwork, ripped player scans, game textures, or commercial stadium models are bundled. The presentation is FC-inspired, not an EA/FIFA product or endorsement.

## Custom soundtrack

The three recordings in `src/soundtracks/` were supplied in this repository and are bundled for offline playback. No redistribution license for these recordings is established here. Obtain the appropriate rights before distributing builds containing them, or replace them with licensed tracks. See [soundtrack filenames and playback behavior](../src/soundtracks/README.md).

## Real player photographs

Four real, dated photographs by **Bryan Berlin / WikiPortraits** are included under **CC BY-SA 4.0**. The source dates are June/July 2026, checked on 13 October 2026. Full attribution, original-photo links, modification descriptions, and the license link are in [the bundled photo notice](../public/players/LICENSE.md) and the in-game **Photo credits & licenses** screen.

Adapted WebP portraits retain CC BY-SA 4.0. Modifications: resize, portrait crop, soft background mask, and WebP compression. Portraits are not AI-generated. These copyright licenses do **not** grant athlete publicity, federation/kit trademark, endorsement, or official football-game licensing rights. Obtain appropriate rights before commercially distributing a player-branded game.

## Generated crowd artwork

`public/textures/stadium-crowd.webp` is an AI-generated image of anonymous fictional supporters, compressed to WebP. It is used only as a distant stadium crowd texture, not represented as a real match photograph or a source of player portraits. Stadium architecture remains fully 3D. A procedural instanced crowd is retained as a fallback.

## Roster / ratings

The four-player catalogue is curated in `src/players.ts`; numerical ratings are original game-balancing values, **not** official EA FC27 ratings. This is not an official, exhaustive, current-season or live Ultimate Team card database. The card art is newly authored CSS, not downloaded EA assets. Real player names identify the requested selectable profiles; no player endorsement is claimed.

Runtime dependencies retain their upstream licences:

- **Three.js** — MIT, https://github.com/mrdoob/three.js
- **Capacitor** and its official App/Haptics plugins — MIT, https://github.com/ionic-team/capacitor
- **Lucide** icons — ISC, https://github.com/lucide-icons/lucide
- **Manrope** typeface — SIL Open Font License 1.1, distributed through `@fontsource/manrope`
- **Barlow Condensed** typeface — SIL Open Font License 1.1, distributed through `@fontsource/barlow-condensed`

Fonts are bundled locally so the installed Android game does not depend on a font CDN. Exact library versions and all transitive dependencies are recorded in `package-lock.json`; upstream package licence files are available in the installed npm packages. Development/test tools (TypeScript, Vite, Vitest, Playwright, and the test-only Chromium package) are not shipped as Android game code.
