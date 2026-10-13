import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, emptySession, loadSettings, recordShot, saveSettings, type ShotResult } from '../../src/state';

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('local preferences and session statistics', () => {
  it('loads defaults without storage', () => expect(loadSettings()).toEqual(DEFAULT_SETTINGS));
  it('rejects malformed settings while keeping valid independent preferences', () => {
    store.set('fkm.settings.v1', JSON.stringify({ position: { x: 'oops', z: null }, difficulty: 'impossible', quality: 'ultra', wall: 400, sound: false }));
    const loaded = loadSettings();
    expect(loaded.position).toEqual(DEFAULT_SETTINGS.position);
    expect(loaded.wall).toBe(4);
    expect(loaded.difficulty).toBe('pro');
    expect(loaded.sound).toBe(false);
  });
  it('persists a selected player and video options, and rejects invalid replacements', () => {
    saveSettings({ ...DEFAULT_SETTINGS, playerId: 'messi', foot: 'left', atmosphere: 'sunset', showFps: true });
    expect(loadSettings()).toMatchObject({ playerId: 'messi', foot: 'left', atmosphere: 'sunset', showFps: true });
    store.set('fkm.settings.v1', JSON.stringify({ playerId: 'unknown', atmosphere: 'storm', showFps: null }));
    expect(loadSettings()).toMatchObject({ playerId: 'ronaldo', atmosphere: 'night', showFps: false });
  });
  it('safely ignores broken JSON', () => {
    store.set('fkm.settings.v1', '{broken');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it('round-trips supported preferences and constrains illegal saved positions', () => {
    saveSettings({ ...DEFAULT_SETTINGS, position: { x: 100, z: 2 }, difficulty: 'legend', foot: 'left' });
    const loaded = loadSettings();
    expect(loaded.position).toEqual({ x: 30, z: 10 });
    expect(loaded.difficulty).toBe('legend');
    expect(loaded.foot).toBe('left');
    expect(loaded.contact.x).toBeGreaterThan(0);
  });
  it('still works when the browser denies storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
  it('records conversion, streaks, best, and bounded history', () => {
    const session = emptySession();
    const result: ShotResult = { outcome: 'goal', distance: 24, speed: 103, power: 0.6, point: { x: 2.8, y: 1.8 }, technique: 'Inside-foot curl' };
    recordShot(session, result);
    recordShot(session, result);
    recordShot(session, { ...result, outcome: 'saved' });
    expect(session.attempts).toBe(3);
    expect(session.goals).toBe(2);
    expect(session.streak).toBe(0);
    expect(session.bestStreak).toBe(2);
    expect(store.get('fkm.personal-best.v1')).toBe('2');
    for (let i = 0; i < 25; i++) recordShot(session, result);
    expect(session.history).toHaveLength(20);
  });
});
