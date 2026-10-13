# Third-party notices and asset provenance

All stadium geometry, kits, procedural textures, players, UI layout, logos, launcher art, and synthesized sound routines in this project are original. No EA, FC27, club, player-likeness, commercial stadium, music recording, or ripped game asset is bundled. EA SPORTS FC is referenced only to describe the requested gameplay inspiration; this is not an EA product or endorsement.

Runtime dependencies retain their upstream licences:

- **Three.js** — MIT, https://github.com/mrdoob/three.js
- **Capacitor** and its official App/Haptics plugins — MIT, https://github.com/ionic-team/capacitor
- **Lucide** icons — ISC, https://github.com/lucide-icons/lucide
- **Manrope** typeface — SIL Open Font License 1.1, distributed through `@fontsource/manrope`
- **Barlow Condensed** typeface — SIL Open Font License 1.1, distributed through `@fontsource/barlow-condensed`

Fonts are bundled locally so the installed Android game does not depend on a font CDN. Exact library versions and all transitive dependencies are recorded in `package-lock.json`; upstream package licence files are available in the installed npm packages. Development/test tools (TypeScript, Vite, Vitest, Playwright, and the test-only Chromium package) are not shipped as Android game code.
