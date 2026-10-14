/**
 * Background playlist, played in this order and looping. Files live in src/soundtracks/ and are
 * bundled by Vite; a track that is not in that folder is skipped (see src/soundtracks/README.md).
 */
export const PLAYLIST: readonly { file: string; title: string }[] = [
  { file: '01-feet-dont-fail-me-now.mp3', title: "Feet Don't Fail Me Now" },
  { file: '02-haya-haya.mp3', title: 'Haya Haya' },
  { file: '03-dai-dai.mp3', title: 'Dai Dai' },
  { file: '04-behind-the-sun.mp3', title: 'Behind the Sun' },
  { file: '05-big-talk.mp3', title: 'Big Talk' },
  { file: '06-ai-seu-te-pego.mp3', title: 'Ai Seu Te Pego' },
];

/** Every audio file in src/soundtracks, resolved to a URL at build time. */
const SOUNDTRACKS = import.meta.glob('../soundtracks/*.{mp3,ogg,m4a,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const urlFor = (file: string): string | undefined => Object.entries(SOUNDTRACKS).find(([path]) => path.endsWith(`/${file}`))?.[1];

/** Menu is full volume; gameplay and practice sit at 65%. */
export const MENU_VOLUME = 1;
export const PLAY_VOLUME = 0.65;

export class MusicPlayer {
  /** Called with the current title, or null when no track can play (files missing). */
  onStatus?: (title: string | null) => void;
  private readonly audio = new Audio();
  private index = 0;
  private enabled = true;
  private started = false;
  private context: 'menu' | 'play' = 'menu';
  private failures = 0;

  constructor() {
    this.audio.preload = 'auto';
    this.audio.addEventListener('playing', () => { this.failures = 0; this.onStatus?.(PLAYLIST[this.index].title); });
    this.audio.addEventListener('ended', () => this.advance());
    this.audio.addEventListener('error', () => this.failed());
  }

  /** Browsers only allow audio after a user gesture, so playback starts on the first pointer press. */
  unlock() { this.started = true; this.apply(); }

  setEnabled(on: boolean) { this.enabled = on; this.apply(); }

  setContext(context: 'menu' | 'play') { this.context = context; this.apply(); }

  private apply() {
    this.audio.volume = this.context === 'play' ? PLAY_VOLUME : MENU_VOLUME;
    if (!this.started || !this.enabled) { this.audio.pause(); return; }
    const url = urlFor(PLAYLIST[this.index].file);
    if (!url) { this.failed(); return; }
    if (this.audio.getAttribute('src') !== url) this.audio.src = url;
    void this.audio.play().catch(() => { /* Autoplay still blocked; the next gesture retries. */ });
  }

  private advance() {
    this.index = (this.index + 1) % PLAYLIST.length;
    this.audio.removeAttribute('src');
    this.apply();
  }

  private failed() {
    // A missing or unreadable file skips to the next track. If every track fails, stop trying.
    this.failures++;
    if (this.failures >= PLAYLIST.length) { this.audio.pause(); this.onStatus?.(null); return; }
    this.advance();
  }
}
