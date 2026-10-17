# Custom soundtracks

Five user-supplied recordings are bundled by Vite for offline playback:

- `01-feet-dont-fail-me-now.mp3` — Feet Don't Fail Me Now
- `02-haya-haya.mp3` — Hayya Hayya (Better Together)
- `06-ai-seu-te-pego.mp3` — Ai Se Eu Te Pego
- `../Worms - Ashnikko (EAFC 24 SOUNDTRACK).mp3` — Worms · Ashnikko
- `../MC-L-Da-SnapYT.App.mp3` — Parado no bailão · MC L da Vinte & MC Gury

The two new original files are referenced in place, not duplicated into this directory.
The game attempts playback immediately unless Background music was saved as off. Browsers
may require a tap/key before audible playback; the selected song is retained for that retry.

Each launch shuffles all five tracks. Every song plays once per cycle; cycles never immediately
repeat the last song. Previous retraces up to 100 selections; Next moves forward. The title
button toggles music or unlocks browser-blocked playback. Only the selected recording loads.
Unreadable recordings are skipped with a bounded retry count.

The **same controls move between the main menu and gameplay**, retaining queue, listeners,
current audio element and position. Music is 100% volume in the menu and 75% in practice/play.
Controls hide in dialogs/settings and during cinematic analysis; playback continues.
Backgrounding pauses playback; returning respects the saved music toggle. Settings → Visuals
& Sound also exposes Background music. Native-device audio/thermal verification is recommended.

Update the `PLAYLIST` and explicit Vite glob in `src/game/music.ts` when adding files outside
this directory. No remote playback/CDN is used. These recordings were supplied by the repository
owner; this project does **not** grant redistribution rights to copyrighted music.
