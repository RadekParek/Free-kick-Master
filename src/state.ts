import { constrainPosition, type Aim, type Contact, type Foot, type Outcome, type Position } from './game/physics';
import { DEFAULT_PLAYER_ID, getPlayer, isPlayerId } from './players';
import { DIFFICULTIES, type Difficulty } from './game/keeper';

export type Quality = 'high' | 'balanced' | 'low';
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
  quality: Quality;
}
export interface ShotResult {
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
  difficulty: 'pro',
  wall: 4,
  sound: true,
  guides: true,
  haptics: true,
  quality: typeof window !== 'undefined' && (window.innerWidth < 800 || window.matchMedia('(pointer: coarse)').matches) ? 'balanced' : 'high',
};
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
    if (['high', 'balanced', 'low'].includes(saved.quality)) defaults.quality = saved.quality;
    for (const key of ['sound', 'guides', 'haptics', 'showFps'] as const) {
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
