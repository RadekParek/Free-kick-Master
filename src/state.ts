import { constrainPosition, type Aim, type Contact, type Foot, type Outcome, type Position } from './game/physics';
import { DEFAULT_PLAYER_ID, getPlayer, isPlayerId } from './players';
import { DIFFICULTIES, type Difficulty } from './game/keeper';

export type Quality = 'high' | 'balanced' | 'low';
export type Preset = 'ultra' | 'high' | 'balanced' | 'performance' | 'custom';
export type RenderScale = 1 | 0.75 | 0.5;
export type ShadowSize = 0 | 512 | 1024;
/** Graphics options. Presets fill these in; Custom lets each one be changed. */
export interface GraphicsOptions { preset: Preset; resolution: RenderScale; antialias: 'off' | 'fxaa' | 'smaa'; bloom: boolean; dof: boolean; shadows: ShadowSize; ambientOcclusion?: boolean; lensEffects?: boolean; surfaceDetail?: boolean }
export const GRAPHICS_PRESETS: Record<Exclude<Preset, 'custom'>, Omit<GraphicsOptions, 'preset'>> = {
  ultra: { resolution:1, antialias:'smaa', bloom:true, dof:true, shadows:1024, ambientOcclusion:true, lensEffects:true, surfaceDetail:true },
  // Single-pass FXAA replaces multisampled HDR targets; shadow resolution remains bounded.
  high: { resolution: 1, antialias: 'fxaa', bloom: true, dof: true, shadows: 1024 },
  balanced: { resolution: .75, antialias: 'fxaa', bloom: false, dof: false, shadows: 1024 },
  performance: { resolution: .5, antialias: 'off', bloom: false, dof: false, shadows: 0 },
};
const MOBILE_PRESETS: Partial<Record<Exclude<Preset, 'custom'>, Omit<GraphicsOptions, 'preset'>>> = {
  balanced: { resolution: 0.75, antialias: 'fxaa', bloom: false, dof: false, shadows: 512 },
  performance: { resolution: 0.5, antialias: 'off', bloom: false, dof: false, shadows: 0 },
};

export function isMobileDevice(): boolean {
  return typeof window !== 'undefined' && (window.innerWidth < 800 || window.matchMedia('(pointer: coarse)').matches);
}

/** Every scale is a true fraction of native, on every device. No hidden DPR cap. */
export function effectivePixelRatio(devicePixelRatio: number, resolution: RenderScale, _mobile: boolean): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return dpr * resolution;
}

export function graphicsForPreset(preset: Exclude<Preset, 'custom'>, mobile = isMobileDevice()): GraphicsOptions {
  return { preset, ...(mobile ? MOBILE_PRESETS[preset] ?? GRAPHICS_PRESETS[preset] : GRAPHICS_PRESETS[preset]) };
}

/** Internal detail tier (grass density, athlete detail) derived from the graphics options. */
export const tierOf = (g: Omit<GraphicsOptions, 'preset'>): Quality => (g.shadows === 0 ? 'low' : g.bloom && g.shadows === 1024 ? 'high' : 'balanced');
export type Atmosphere = 'night' | 'sunset' | 'day';
export const ATMOSPHERES: readonly Atmosphere[] = ['night', 'sunset', 'day'];

/** Return a different stadium mood for a fresh practice launch, while remaining easy to test. */
export function nextPracticeAtmosphere(current: Atmosphere, random = Math.random): Atmosphere {
  const choices = ATMOSPHERES.filter(atmosphere => atmosphere !== current);
  const sample = random();
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor((Number.isFinite(sample) ? sample : 0) * choices.length)));
  return choices[index];
}
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
/** Complete owned snapshot of the flat Settings schema and its four nested value records.
 * Keep this list in sync when adding nested settings; no shared mutable UI/game records. */
export function cloneSettings(settings: Settings): Settings {
  return { ...settings, position: { ...settings.position }, aim: { ...settings.aim },
    contact: { ...settings.contact }, graphics: { ...settings.graphics } };
}

export interface ShotResult {
  frameHits?: number;
  runupSpeed?: number;
  playerHeight?: number;
  keeperHeight?: number;
  /** Uncalibrated Monte Carlo estimate of this game model, never real-world xG. */
  estimatedChance?: number;
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
// Phones and touch screens start on a lower-cost Balanced profile; desktops start on High.
if (isMobileDevice()) DEFAULT_SETTINGS.graphics = graphicsForPreset('balanced');
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
    const correctedFoot = ['saka', 'griezmann', 'dovbyk', 'luisdiaz', 'kulusevski', 'hojlund', 'odegaard'].includes(getPlayer(defaults.playerId).baseId);
    // Old saves stored incorrect defaults as if they were manual choices. Migrate them once.
    if ((!correctedFoot || saved.rosterVersion >= 2) && (saved.foot === 'right' || saved.foot === 'left')) defaults.foot = saved.foot;
    if (DIFFICULTIES.includes(saved.difficulty)) defaults.difficulty = saved.difficulty;
    if (Number.isInteger(saved.wall) && saved.wall >= 0 && saved.wall <= 5) defaults.wall = saved.wall;
    const pick = <T extends string | number | boolean>(value: unknown, options: readonly T[], fallback: T): T => (options as readonly unknown[]).includes(value) ? value as T : fallback;
    if (saved.graphics && typeof saved.graphics === 'object') {
      const g = saved.graphics;
      const preset = pick<Preset>(g.preset, ['ultra', 'high', 'balanced', 'performance', 'custom'], defaults.graphics.preset);
      defaults.graphics = preset === 'custom'
        ? { preset, resolution: pick<RenderScale>(g.resolution, [1, 0.75, 0.5], 1), antialias: pick<GraphicsOptions['antialias']>(g.antialias, ['off', 'fxaa', 'smaa'], g.msaa === 2 ? 'fxaa' : g.smaa === false ? 'off' : 'smaa'), bloom: typeof g.bloom === 'boolean' ? g.bloom : true, dof: typeof g.dof === 'boolean' ? g.dof : false, ambientOcclusion: g.ambientOcclusion === true, lensEffects:g.lensEffects === true, surfaceDetail:g.surfaceDetail === true, shadows: pick<ShadowSize>(g.shadows, [0, 512, 1024], 1024) }
        : graphicsForPreset(preset as Exclude<Preset, 'custom'>);
    } else if (['high', 'balanced', 'low'].includes(saved.quality)) {
      // Settings saved before the graphics options existed.
      const preset: Exclude<Preset, 'custom'> = saved.quality === 'low' ? 'performance' : saved.quality;
      defaults.graphics = graphicsForPreset(preset);
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
  try { localStorage.setItem(KEY, JSON.stringify({ ...settings, rosterVersion: 2 })); } catch { /* Never block gameplay on storage. */ }
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
