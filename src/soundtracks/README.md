# Custom soundtracks

These three existing recordings are bundled by Vite for offline playback:

- `01-feet-dont-fail-me-now.mp3` — Feet Don't Fail Me Now
- `02-haya-haya.mp3` — Hayya Hayya (Better Together)
- `06-ai-seu-te-pego.mp3` — Ai Se Eu Te Pego

The game attempts playback immediately on opening (unless Background music was saved as off).
Web browsers may require a tap or keypress before allowing audible playback; the game retries
on those gestures without skipping the selected song. Capacitor's Android host allows media
autoplay; physical-device verification is still recommended.

Each launch shuffles the playlist. All songs play once per shuffled cycle; the next cycle is
reshuffled and never immediately repeats the previous song. Previous retraces listening history
(up to 100 songs); at the beginning it restarts the first song. Next moves forward. The song-title
button toggles music on/off, or starts playback if the browser blocked it.

Controls appear only in the main menu, not in gameplay, settings, or dialogs. Playback continues
through those screens: full volume in the menu and 75% in play/practice. Backgrounding the game
pauses music; returning resumes at the same position, respecting the saved music toggle.
You can also toggle it in Settings → Visuals & Sound → Background music.

Only the selected song is loaded. Missing bundled files are filtered out; unreadable songs are
skipped, stopping after a failed cycle rather than retrying indefinitely.

To change the soundtrack, place appropriately licensed audio here and update `PLAYLIST` in
`src/game/music.ts` (file name and display title), then rebuild. Files elsewhere in `src/` are not
part of this playlist. These are user-supplied recordings; this project does not grant rights to
redistribute them.
