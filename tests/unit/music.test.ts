import { describe, expect, it, vi } from 'vitest';
import { MENU_VOLUME, MusicPlayer, PLAY_VOLUME, type MusicStatus } from '../../src/game/music';

class FakeAudio extends EventTarget {
  preload = '';
  src = '';
  currentTime = 0;
  volume = 1;
  paused = true;
  play = vi.fn(async () => { this.paused = false; this.dispatchEvent(new Event('playing')); });
  pause = vi.fn(() => { this.paused = true; });
}
const tracks = ['First', 'Second', 'Third'].map(title => ({ title, url: `/${title}.mp3` }));
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup(random = () => 0) {
  const audio = new FakeAudio();
  const player = new MusicPlayer(audio as unknown as HTMLAudioElement, tracks, random);
  const status = vi.fn<(status: MusicStatus) => void>();
  player.onStatus = status;
  return { audio, player, status };
}

describe('custom soundtrack', () => {
  it('attempts startup without a gesture and shows the selected title', async () => {
    const { audio, player, status } = setup();
    expect(audio.play).not.toHaveBeenCalled();
    player.start();
    await settle();
    expect(audio.play).toHaveBeenCalledOnce();
    expect(audio.preload).toBe('metadata');
    expect(status).toHaveBeenLastCalledWith({ title: 'Second', enabled: true, playing: true, blocked: false });
  });

  it('shuffles each cycle without repeats, including the cycle boundary', () => {
    const { audio, player } = setup();
    const urls = [audio.src];
    for (let i = 0; i < 11; i++) { player.next(); urls.push(audio.src); }
    for (let i = 0; i < urls.length; i += 3) expect(new Set(urls.slice(i, i + 3)).size).toBe(3);
    for (let i = 1; i < urls.length; i++) expect(urls[i]).not.toBe(urls[i - 1]);
    expect(setup(() => 0.99).audio.src).not.toBe(urls[0]);
  });

  it('previous retraces history and next moves forward through it', () => {
    const { audio, player } = setup();
    const first = audio.src;
    player.next();
    const second = audio.src;
    player.previous();
    expect(audio.src).toBe(first);
    player.next();
    expect(audio.src).toBe(second);
    player.next(); player.next();
    const fourth = audio.src;
    player.previous(); player.next();
    expect(audio.src).toBe(fourth);
  });

  it('advances on ended and restarts the first song on previous with no history', async () => {
    const { audio, player } = setup();
    player.start();
    const first = audio.src;
    audio.currentTime = 12;
    player.previous();
    expect(audio.src).toBe(first);
    expect(audio.currentTime).toBe(0);
    audio.dispatchEvent(new Event('ended'));
    await settle();
    expect(audio.src).not.toBe(first);
    expect(audio.paused).toBe(false);
  });

  it('keeps the song on autoplay denial, then retries on a gesture', async () => {
    const { audio, player, status } = setup();
    audio.play.mockRejectedValueOnce({ name: 'NotAllowedError' });
    const first = audio.src;
    player.start();
    await settle();
    expect(status.mock.lastCall?.[0].blocked).toBe(true);
    expect(audio.src).toBe(first);
    player.unlock();
    await settle();
    expect(audio.paused).toBe(false);
    expect(status.mock.lastCall?.[0].blocked).toBe(false);
    player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('honors saved music-off, visibility and volume without restarting playback', async () => {
    const { audio, player } = setup();
    player.setEnabled(false);
    player.start(); player.unlock();
    expect(audio.play).not.toHaveBeenCalled();
    player.setEnabled(true);
    await settle();
    audio.currentTime = 42;
    player.setContext('play');
    expect(audio.volume).toBe(PLAY_VOLUME);
    player.setContext('menu');
    expect(audio.volume).toBe(MENU_VOLUME);
    expect(audio.play).toHaveBeenCalledOnce();
    player.setVisible(false);
    expect(audio.paused).toBe(true);
    player.unlock();
    expect(audio.paused).toBe(true);
    player.setVisible(true);
    await settle();
    expect(audio.paused).toBe(false);
    expect(audio.currentTime).toBe(42);
    player.setEnabled(false);
    player.setVisible(false); player.setVisible(true);
    expect(audio.paused).toBe(true);
  });

  it('skips unreadable tracks, stopping after one failed cycle', async () => {
    const { audio, player, status } = setup();
    audio.play.mockRejectedValue({ name: 'NotSupportedError' });
    player.start();
    await settle();
    expect(audio.play).toHaveBeenCalledTimes(3);
    expect(status.mock.lastCall?.[0].title).toBeNull();
    player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(3);
  });

  it('ignores obsolete play rejections after fast navigation', async () => {
    const { audio, player, status } = setup();
    let reject!: (reason: unknown) => void;
    audio.play.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    player.start();
    player.next();
    const current = audio.src;
    reject({ name: 'NotSupportedError' });
    await settle();
    expect(audio.src).toBe(current);
    expect(status.mock.lastCall?.[0].playing).toBe(true);
  });

  it('handles an empty or single-track playlist safely', async () => {
    const audio = new FakeAudio();
    const empty = new MusicPlayer(audio as unknown as HTMLAudioElement, []);
    const status = vi.fn();
    empty.onStatus = status;
    empty.start(); empty.next(); empty.previous();
    expect(audio.play).not.toHaveBeenCalled();
    expect(status.mock.lastCall?.[0].title).toBeNull();
    const single = new MusicPlayer(audio as unknown as HTMLAudioElement, tracks.slice(0, 1));
    single.start(); single.next();
    await settle();
    expect(audio.src).toBe('/First.mp3');
    expect(audio.paused).toBe(false);
  });
});
