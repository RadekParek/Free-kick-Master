import type { Foot } from './game/physics';

/** Fan-made training attributes. These are NOT official EA/FC ratings or live-season stats. */
export interface TakerAttributes {
  power: number;
  curve: number;
  knuckle: number;
  control: number;
}
export interface TakerProfile {
  id: string;
  name: string;
  shortName: string;
  nation: string;
  nationCode: string;
  foot: Foot;
  number: number;
  rating: number;
  specialty: string;
  description: string;
  attributes: TakerAttributes;
  appearance: { shirt: string; shorts: string; trim: string; skin: string; hair: string; beard: boolean; height: number };
  portrait: string;
  photoDate: string;
  photoSource: string;
  credit: string;
}
const credit = 'Bryan Berlin / WikiPortraits · CC BY-SA 4.0';
export const PHOTO_LICENSE = 'https://creativecommons.org/licenses/by-sa/4.0/';
export const PLAYERS: readonly TakerProfile[] = [
  {
    id: 'ronaldo', name: 'Cristiano Ronaldo', shortName: 'Ronaldo', nation: 'Portugal', nationCode: 'PT', foot: 'right', number: 7, rating: 95,
    specialty: 'Power specialist', description: 'A powerful, low-spin strike with a pronounced late wobble. Take a step back, hit the centre, and let it move.',
    attributes: { power: 99, curve: 87, knuckle: 99, control: 92 },
    appearance: { shirt: '#b82b38', shorts: '#123b33', trim: '#e4ca83', skin: '#b97e59', hair: '#271e1a', beard: false, height: 1.87 },
    portrait: './players/ronaldo.webp', photoDate: '2 July 2026',
    photoSource: 'https://commons.wikimedia.org/wiki/File:Cristiano_Ronaldo_Croatia_v_Portugal_2_July_2026-075.jpg', credit,
  },
  {
    id: 'messi', name: 'Lionel Messi', shortName: 'Messi', nation: 'Argentina', nationCode: 'AR', foot: 'left', number: 10, rating: 97,
    specialty: 'Finesse specialist', description: 'A left-footed artist. Exceptional sidespin and a controlled flight reward a well-placed, curling strike.',
    attributes: { power: 87, curve: 99, knuckle: 70, control: 99 },
    appearance: { shirt: '#c4e6ed', shorts: '#142735', trim: '#f6f3e2', skin: '#c39574', hair: '#3a2e24', beard: true, height: 1.70 },
    portrait: './players/messi.webp', photoDate: '7 July 2026',
    photoSource: 'https://commons.wikimedia.org/wiki/File:Leo_Messi_Argentina_v_Egypt_7_July_2026-1.jpg', credit,
  },
  {
    id: 'mbappe', name: 'Kylian Mbappé', shortName: 'Mbappé', nation: 'France', nationCode: 'FR', foot: 'right', number: 10, rating: 93,
    specialty: 'Driven specialist', description: 'Fast, direct, decisive. A high launch speed makes driven shots and long-range strikes arrive in a hurry.',
    attributes: { power: 96, curve: 84, knuckle: 89, control: 89 },
    appearance: { shirt: '#18356d', shorts: '#172645', trim: '#d9cda5', skin: '#936140', hair: '#201b18', beard: false, height: 1.78 },
    portrait: './players/mbappe.webp', photoDate: '16 June 2026',
    photoSource: 'https://commons.wikimedia.org/wiki/File:Kylian_Mbappe_France_v_Senegal_16_June_2026-391_(cropped).jpg', credit,
  },
  {
    id: 'salah', name: 'Mohamed Salah', shortName: 'Salah', nation: 'Egypt', nationCode: 'EG', foot: 'left', number: 10, rating: 94,
    specialty: 'Curve specialist', description: 'Shape it with the left. Strong curl with a little extra pace is ideal for finding the far corner from an angle.',
    attributes: { power: 91, curve: 96, knuckle: 76, control: 95 },
    appearance: { shirt: '#cc3b32', shorts: '#e5e3d8', trim: '#1e282e', skin: '#ad784f', hair: '#25201b', beard: true, height: 1.75 },
    portrait: './players/salah.webp', photoDate: '7 July 2026',
    photoSource: 'https://commons.wikimedia.org/wiki/File:Mohamed_Salah_Argentina_v_Egypt_7_July_2026-163_(cropped).jpg', credit,
  },
];
export function getPlayer(id: string): TakerProfile { return PLAYERS.find(player => player.id === id) ?? PLAYERS[0]; }
export function isPlayerId(id: unknown): id is string { return typeof id === 'string' && PLAYERS.some(player => player.id === id); }
