import { constrainPosition, type Aim, type Contact, type Foot, type Outcome, type Position } from './game/physics';
import { DEFAULT_PLAYER_ID, getPlayer, isPlayerId } from './players';
import { DIFFICULTIES, type Difficulty } from './game/keeper';

export type Quality = 'high' | 'balanced' | 'low';
export type Preset = 'high' | 'balanced' | 'performance' | 'custom';
export type RenderScale = 1 | 0.75 | 0.5;
export type ShadowSize = 0 | 512 | 1024 | 2048;
/** Graphics options. Presets fill these in; Custom lets each one be changed. */
export interface GraphicsOptions { preset: Preset; resolution: RenderScale; msaa: 0 | 2; smaa: boolean; bloom: boolean; shadows: ShadowSize }
export const GRAPHICS_PRESETS: Record<Exclude<Preset, 'custom'>, Omit<GraphicsOptions, 'preset'>> = {
  // High renders at 75% of the native pixels and uses 2x MSAA; the screen scales the result back up.
  high: { resolution: 0.75, msaa: 2, smaa: true, bloom: true, shadows: 2048 },
  balanced: { resolution: 1, msaa: 0, smaa: true, bloom: true, shadows: 1024 },
  performance: { resolution: 1, msaa: 0, smaa: false, bloom: false, shadows: 0 },
};
/** Internal detail tier (grass density, athlete detail) derived from the graphics options. */
export const tierOf = (g: Omit<GraphicsOptions, 'preset'>): Quality => (g.shadows === 0 ? 'low' : g.shadows >= 2048 && g.msaa > 0 ? 'high' : 'balanced');
export type Atmosphere = 'night' | 'sunset' | 'day';
export interface Settings {
  playerId: string;
  atmosphere: Atmosphere;
  showFps: boolean;
  position: Position;
  aim: Aim;
  contact: Contact;
  foot: Foot;
  difficulty: Difficulty;
  wall: number;
  sound: boolean;
  guides: boolean;
  haptics: boolean;
  music: boolean;
  quality: Quality;
  graphics: GraphicsOptions;
}
export interface ShotResult {
  frameHits?: number;
  outcome: Outcome;
  distance: number;
  speed: number;
  power: number;
  point: { x: number; y: number };
  technique: string;
}
export interface Session {
  attempts: number;
  goals: number;
  streak: number;
  bestStreak: number;
  history: ShotResult[];
}
export const DEFAULT_SETTINGS: Settings = {
  playerId: DEFAULT_PLAYER_ID,
  atmosphere: 'night',
  showFps: false,
  position: { x: -6, z: 24 },
  aim: { x: 1.9, y: 1.9 },
  contact: { x: -0.43, y: 0.02 },
  foot: 'right',
  difficulty: 'amateur',
  wall: 4,
  sound: true,
  guides: true,
  haptics: true,
  music: true,
  quality: 'high',
  graphics: { preset: 'high', ...GRAPHICS_PRESETS.high },
};
// Phones and touch screens start on Balanced; desktops start on High.
if (typeof window !== 'undefined' && (window.innerWidth < 800 || window.matchMedia('(pointer: coarse)').matches)) {
  DEFAULT_SETTINGS.graphics = { preset: 'balanced', ...GRAPHICS_PRESETS.balanced };
}
DEFAULT_SETTINGS.quality = tierOf(DEFAULT_SETTINGS.graphics);
export const emptySession = (): Session => ({ attempts: 0, goals: 0, streak: 0, bestStreak: 0, history: [] });
const KEY = 'fkm.settings.v1';
export const BEST_KEY = 'fkm.personal-best.v1';

export function loadSettings(): Settings {
  const defaults = structuredClone(DEFAULT_SETTINGS);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
    if (saved.position && finite(saved.position.x) && finite(saved.position.z)) defaults.position = constrainPosition(saved.position);
    if (isPlayerId(saved.playerId)) defaults.playerId = saved.playerId;
    if (['night', 'sunset', 'day'].includes(saved.atmosphere)) defaults.atmosphere = saved.atmosphere;
    defaults.foot = getPlayer(defaults.playerId).foot;
    if (saved.foot === 'right' || saved.foot === 'left') defaults.foot = saved.foot;
    if (DIFFICULTIES.includes(saved.difficulty)) defaults.difficulty = saved.difficulty;
    if (Number.isInteger(saved.wall) && saved.wall >= 0 && saved.wall <= 5) defaults.wall = saved.wall;
    const pick = <T extends string | number | boolean>(value: unknown, options: readonly T[], fallback: T): T => (options as readonly unknown[]).includes(value) ? value as T : fallback;
    if (saved.graphics && typeof saved.graphics === 'object') {
      const g = saved.graphics;
      const preset = pick<Preset>(g.preset, ['high', 'balanced', 'performance', 'custom'], defaults.graphics.preset);
      defaults.graphics = preset === 'custom'
        ? { preset, resolution: pick<RenderScale>(g.resolution, [1, 0.75, 0.5], 1), msaa: pick<0 | 2>(g.msaa, [0, 2], 0), smaa: typeof g.smaa === 'boolean' ? g.smaa : true, bloom: typeof g.bloom === 'boolean' ? g.bloom : true, shadows: pick<ShadowSize>(g.shadows, [0, 512, 1024, 2048], 1024) }
        : { preset, ...GRAPHICS_PRESETS[preset as Exclude<Preset, 'custom'>] };
    } else if (['high', 'balanced', 'low'].includes(saved.quality)) {
      // Settings saved before the graphics options existed.
      const preset: Preset = saved.quality === 'low' ? 'performance' : saved.quality;
      defaults.graphics = { preset, ...GRAPHICS_PRESETS[preset as Exclude<Preset, 'custom'>] };
    }
    defaults.quality = tierOf(defaults.graphics);
    for (const key of ['sound', 'guides', 'haptics', 'showFps', 'music'] as const) {
      if (typeof saved[key] === 'boolean') defaults[key] = saved[key];
    }
    // Aiming and contact reset to a playable starting point on a fresh launch.
    defaults.contact.x = defaults.foot === 'right' ? -0.43 : 0.43;
  } catch { /* Storage can be unavailable in private browsing; the game still works. */ }
  return defaults;
}
export function saveSettings(settings: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Never block gameplay on storage. */ }
}
export function recordShot(session: Session, result: ShotResult): void {
  session.attempts++;
  if (result.outcome === 'goal') { session.goals++; session.streak++; }
  else session.streak = 0;
  session.bestStreak = Math.max(session.bestStreak, session.streak);
  session.history.push(result);
  if (session.history.length > 20) session.history.shift();
  try {
    const previous = Number(localStorage.getItem(BEST_KEY)) || 0;
    if (session.bestStreak > previous) localStorage.setItem(BEST_KEY, String(session.bestStreak));
  } catch { /* Optional local record. */ }
}
