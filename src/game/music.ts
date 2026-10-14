/** Bundled custom soundtrack. Each session starts with a fresh shuffled queue. */
export const PLAYLIST: readonly { file: string; title: string }[] = [
  { file: '01-feet-dont-fail-me-now.mp3', title: "Feet Don't Fail Me Now" },
  { file: '02-haya-haya.mp3', title: 'Hayya Hayya (Better Together)' },
  { file: '06-ai-seu-te-pego.mp3', title: 'Ai Se Eu Te Pego' },
];
const SOUNDTRACKS = import.meta.glob('../soundtracks/*.{mp3,ogg,m4a,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export interface MusicTrack { title: string; url: string }
const TRACKS: MusicTrack[] = PLAYLIST.flatMap(track => {
  const url = SOUNDTRACKS[`../soundtracks/${track.file}`];
  return url ? [{ title: track.title, url }] : [];
});

export const MENU_VOLUME = 1;
export const PLAY_VOLUME = 0.75;
export interface MusicStatus { title: string | null; enabled: boolean; playing: boolean; blocked: boolean }

export class MusicPlayer {
  onStatus?: (status: MusicStatus) => void;
  private queue: number[] = [];
  private history: number[] = [];
  private cursor = -1;
  private enabled = true;
  private started = false;
  private visible = true;
  private blocked = false;
  private exhausted = false;
  private failures = 0;
  private version = 0;
  private pending = false;
  private failedVersion = -1;

  constructor(private readonly audio: HTMLAudioElement = new Audio(), private readonly tracks = TRACKS, private readonly random = Math.random) {
    // Load only the selected song, not the whole playlist.
    this.audio.preload = 'metadata';
    this.audio.addEventListener('playing', () => {
      this.failures = 0;
      this.blocked = false;
      this.notify();
    });
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('error', () => this.failed(this.version));
    this.advance();
  }

  /** Try immediately; a blocked browser can retry synchronously on a trusted gesture. */
  start() { this.started = true; this.apply(); }
  unlock() { this.start(); }
  setEnabled(on: boolean) { this.enabled = on; this.apply(); }
  setVisible(visible: boolean) { this.visible = visible; this.apply(); }
  setContext(context: 'menu' | 'play') {
    this.audio.volume = context === 'play' ? PLAY_VOLUME : MENU_VOLUME;
  }
  next() { this.failures = 0; this.exhausted = false; this.advance(); this.apply(); }
  previous() {
    this.failures = 0;
    this.exhausted = false;
    if (this.cursor > 0) this.cursor--;
    this.select();
    this.apply();
  }

  private advance() {
    if (this.cursor === this.history.length - 1 && this.tracks.length) {
      if (!this.queue.length) {
        this.queue = this.tracks.map((_, i) => i);
        for (let i = this.queue.length - 1; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1));
          [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
        // No immediate repeat at the boundary between shuffled cycles.
        if (this.queue.length > 1 && this.queue[0] === this.history[this.cursor]) {
          [this.queue[0], this.queue[1]] = [this.queue[1], this.queue[0]];
        }
      }
      this.history.push(this.queue.shift()!);
    }
    this.cursor++;
    // Bounded navigation history, even after very long sessions.
    if (this.history.length > 100) { this.history.shift(); this.cursor--; }
    this.select();
  }

  private select() {
    this.version++;
    this.pending = false;
    this.blocked = false;
    this.audio.pause();
    const track = this.tracks[this.history[this.cursor]];
    if (track) { this.audio.src = track.url; this.audio.currentTime = 0; }
    else this.exhausted = true;
  }

  private notify() {
    this.onStatus?.({
      title: this.exhausted ? null : this.tracks[this.history[this.cursor]]?.title ?? null,
      enabled: this.enabled, playing: !this.audio.paused, blocked: this.blocked,
    });
  }

  private apply() {
    if (!this.started || !this.enabled || !this.visible || this.exhausted) {
      this.version++;
      this.pending = false;
      this.audio.pause();
      this.notify();
      return;
    }
    this.notify();
    if (this.pending || !this.audio.paused) return;
    const version = this.version;
    this.pending = true;
    void this.audio.play().then(() => {
      if (version !== this.version) return;
      this.blocked = false;
      this.notify();
    }).catch((error: unknown) => {
      if (version !== this.version) return;
      const name = (error as { name?: string })?.name;
      if (name === 'NotAllowedError') { this.blocked = true; this.notify(); }
      else if (name !== 'AbortError') this.failed(version);
    }).finally(() => { if (version === this.version) this.pending = false; });
  }

  private failed(version: number) {
    // Media errors and play() rejections may describe the same failed attempt.
    if (version !== this.version || this.failedVersion === version || this.exhausted) return;
    this.failedVersion = version;
    if (++this.failures >= this.tracks.length) {
      this.exhausted = true;
      this.apply();
      return;
    }
    this.advance();
    this.apply();
  }
}
