import type { TakerProfile } from '../players';

export type HairStyle = 'quiff' | 'crop' | 'curls' | 'swept' | 'bun' | 'flow' | 'braids' | 'bald' | 'ponytail';
export type KitPattern = 'solid' | 'stripes' | 'checks' | 'sash';
export interface KitDesign {
  base: string; secondary: string; trim: string; shorts: string; socks: string; ink: string;
  pattern: KitPattern; code: string;
}
export interface PlayerLook { hair: HairStyle; width: number; jaw: number; beard: boolean }

// Recognisable silhouettes, not scanned likenesses. Base IDs keep special cards consistent.
const LOOKS: Record<string, PlayerLook> = {
  'roberto-carlos': { hair: 'bald', width: 1.06, jaw: 1.09, beard: false },
  zidane: { hair: 'bald', width: .97, jaw: 1.04, beard: false },
  ronaldinho: { hair: 'ponytail', width: 1.03, jaw: 1.04, beard: false },
  beckham: { hair: 'swept', width: .98, jaw: 1.08, beard: false },
  ronaldo: { hair: 'quiff', width: .96, jaw: 1.07, beard: false },
  messi: { hair: 'swept', width: 1.02, jaw: 1.03, beard: true },
  mbappe: { hair: 'crop', width: 1.04, jaw: 1.04, beard: false },
  salah: { hair: 'curls', width: .98, jaw: .96, beard: true },
  haaland: { hair: 'bun', width: 1.02, jaw: 1.1, beard: false },
  debruyne: { hair: 'swept', width: 1.01, jaw: 1.02, beard: true },
  neymar: { hair: 'quiff', width: .94, jaw: .94, beard: true },
  vandijk: { hair: 'bun', width: 1.02, jaw: 1.06, beard: true },
  kane: { hair: 'swept', width: 1.05, jaw: 1.09, beard: true },
  vinicius: { hair: 'braids', width: .96, jaw: .94, beard: false },
  bellingham: { hair: 'crop', width: .98, jaw: 1.03, beard: false },
  yamal: { hair: 'curls', width: .94, jaw: .94, beard: false },
  modric: { hair: 'flow', width: .94, jaw: .94, beard: true },
  'alexander-arnold': { hair: 'braids', width: 1, jaw: 1, beard: true },
  saka: { hair: 'curls', width: .98, jaw: .97, beard: false },
  dembele: { hair: 'crop', width: .96, jaw: .98, beard: false },
  griezmann: { hair: 'flow', width: .97, jaw: 1, beard: true },
  musiala: { hair: 'curls', width: .94, jaw: .93, beard: false },
  foden: { hair: 'crop', width: .96, jaw: .98, beard: false },
  lewandowski: { hair: 'quiff', width: .98, jaw: 1.06, beard: false },
  rodri: { hair: 'crop', width: 1.03, jaw: 1.04, beard: true },
  pedri: { hair: 'crop', width: .97, jaw: .97, beard: true },
  vitinha: { hair: 'swept', width: .96, jaw: .95, beard: true },
  wirtz: { hair: 'swept', width: .96, jaw: .96, beard: false },
  lautaro: { hair: 'crop', width: 1.04, jaw: 1.08, beard: true },
  julian: { hair: 'quiff', width: .98, jaw: 1, beard: false },
  barella: { hair: 'crop', width: 1, jaw: 1.04, beard: false },
  dimarco: { hair: 'crop', width: 1.03, jaw: 1.04, beard: true },
  kubo: { hair: 'swept', width: 1.02, jaw: .97, beard: false },
  dovbyk: { hair: 'crop', width: 1.04, jaw: 1.08, beard: true },
  luisdiaz: { hair: 'crop', width: .96, jaw: 1, beard: false },
  kulusevski: { hair: 'swept', width: 1.02, jaw: 1.04, beard: false },
  hojlund: { hair: 'quiff', width: 1.03, jaw: 1.08, beard: false },
  odegaard: { hair: 'swept', width: .98, jaw: .99, beard: false },
  bruno: { hair: 'quiff', width: .95, jaw: .98, beard: true },
};
export function playerLook(profile: TakerProfile): PlayerLook {
  return LOOKS[profile.baseId] ?? { hair: 'swept', width: 1, jaw: 1, beard: profile.appearance.beard };
}

// National home-kit colours, shorts, socks and characteristic patterns,
// deliberately no unlicensed federation crests, brand marks or sponsor artwork.
const NATIONS: Record<string, Partial<KitDesign>> = {
  PT: { base: '#ac202d', secondary: '#174d3a', trim: '#d9b967', shorts: '#173e33', socks: '#a11c2b', ink: '#f8ead0' },
  AR: { base: '#f3f4ed', secondary: '#79b9dc', trim: '#122737', shorts: '#152835', socks: '#f0f2e9', ink: '#152332', pattern: 'stripes' },
  FR: { base: '#182b54', secondary: '#233f70', trim: '#d1b473', shorts: '#162744', socks: '#b52b39', ink: '#e4cf97' },
  EG: { base: '#b62e27', trim: '#1c2228', shorts: '#eeeeea', socks: '#25282b', ink: '#f3e9d4' },
  NO: { base: '#b72c38', trim: '#e9edf0', shorts: '#172b49', socks: '#b72c38', ink: '#f2f0e5' },
  BE: { base: '#9f2631', trim: '#e5ba56', shorts: '#28282c', socks: '#9f2631', ink: '#edcf87' },
  BR: { base: '#e6c13e', secondary: '#d4ad28', trim: '#1c6549', shorts: '#1a3a7b', socks: '#eeeeda', ink: '#195b43' },
  NL: { base: '#e3752b', trim: '#162537', shorts: '#e3752b', socks: '#e3752b', ink: '#1b2b3a' },
  GB: { base: '#f0efe8', secondary: '#e4e4dd', trim: '#182b46', shorts: '#182b46', socks: '#efeee6', ink: '#192d47' },
  ES: { base: '#ad2634', trim: '#e5c45a', shorts: '#203653', socks: '#ac2634', ink: '#ecd271' },
  HR: { base: '#f0efe7', secondary: '#bc2b39', trim: '#26416b', shorts: '#f0efe7', socks: '#f0efe7', ink: '#213859', pattern: 'checks' },
  PL: { base: '#eeeeea', trim: '#b02b3c', shorts: '#b02b3c', socks: '#eeeeea', ink: '#ab2334' },
  DE: { base: '#ecece6', secondary: '#d7d8d1', trim: '#23282b', shorts: '#20262a', socks: '#ecece6', ink: '#23282b' },
  IT: { base: '#2356a0', trim: '#ddd5bd', shorts: '#e8e8e0', socks: '#2356a0', ink: '#e8e3ce' },
  JP: { base: '#214885', secondary: '#294f8c', trim: '#e8e9e4', shorts: '#eef0e8', socks: '#214885', ink: '#f1eee3' },
  UA: { base: '#e3c33e', trim: '#2c65a4', shorts: '#e3c33e', socks: '#e3c33e', ink: '#285a97' },
  CO: { base: '#e4c43e', trim: '#253d65', shorts: '#253d65', socks: '#a12b3d', ink: '#253d65' },
  SE: { base: '#e6c543', trim: '#2b5793', shorts: '#244b84', socks: '#e6c543', ink: '#244b84' },
  DK: { base: '#b22c3a', trim: '#edeae0', shorts: '#edeae0', socks: '#b22c3a', ink: '#f5efdd' },
};
export function kitDesign(profile: TakerProfile): KitDesign {
  const a = profile.appearance;
  const national = { base: a.shirt, secondary: a.shirt, trim: a.trim, shorts: a.shorts, socks: a.shirt,
    ink: '#f3eddb', pattern: 'solid' as KitPattern, code: profile.nationCode, ...NATIONS[profile.nationCode] };
  return profile.edition === 'special'
    ? { ...national, base: a.shirt, secondary: '#178f88', trim: a.trim, shorts: a.shorts, socks: a.shirt, ink: '#083c3a', pattern: 'sash' }
    : national;
}
