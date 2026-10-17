import type { Foot } from './game/physics';

/** Fan-made training attributes. These are NOT official EA/FC ratings or live-season stats. */
export interface TakerAttributes {
  power: number;
  curve: number;
  knuckle: number;
  control: number;
}
export interface TakerAppearance { shirt: string; shorts: string; trim: string; skin: string; hair: string; beard: boolean; height: number }
/** `standard` is the base card. `special` is the turquoise variant with a handwritten name. */
export type Edition = 'standard' | 'special';
export interface TakerProfile {
  id: string;
  /** Base player id this card belongs to (equal to `id` for standard cards). */
  baseId: string;
  edition: Edition;
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
  appearance: TakerAppearance;
  /** Only the four photographed players have a licensed local portrait; others use generated monogram art. */
  portrait: string | null;
  photoDate: string | null;
  photoSource: string | null;
  credit: string | null;
}
export const PHOTO_LICENSE = 'https://creativecommons.org/licenses/by-sa/4.0/';
const photoCredit = 'Bryan Berlin / WikiPortraits · CC BY-SA 4.0';

/** Unlicensed web photos for personal use. Only the four credited photos above carry a CC licence. */
const UNLICENSED = 'Unlicensed web photo, personal use only. Rights remain with the photographer.';
const PHOTO_EXTRA: Record<string, { portrait: string; photoSource: string }> = {
  haaland: { portrait: './players/haaland.jpg', photoSource: 'https://timesofindia.indiatimes.com/sports/football/top-stories/stick-together-and-smile-erling-haalands-message-after-man-citys-explosive-verdict/articleshow/134806973.cms' },
  debruyne: { portrait: './players/debruyne.jpg', photoSource: 'https://gettyimages.com/photos/kevin-de-bruyne?page=2' },
  neymar: { portrait: './players/neymar.jpg', photoSource: 'https://www.gettyimages.in/photos/neymar-portrait' },
  vandijk: { portrait: './players/vandijk.jpg', photoSource: 'https://gettyimages.com/photos/virgil-van-dijk-netherlands' },
  kane: { portrait: './players/kane.jpg', photoSource: 'https://www.gettyimages.com.br/fotos/harry-kane-portrait' },
  vinicius: { portrait: './players/vinicius.jpg', photoSource: 'https://www.nytimes.com/athletic/6455491/2025/06/27/vinicius-jr-real-madrid-club-world-cup/' },
  bellingham: { portrait: './players/bellingham.jpg', photoSource: 'https://www.gettyimages.co.uk/editorial-images/sport/event/jude-bellingham/776168773' },
  yamal: { portrait: './players/yamal.jpg', photoSource: 'https://www.gettyimages.com/detail/news-photo/lamine-yamal-of-fc-barcelona-poses-for-a-portrait-during-news-photo/2232611768' },
  modric: { portrait: './players/modric.jpg', photoSource: 'https://www.gettyimages.in/photos/luka-modric' },
  lewandowski: { portrait: './players/lewandowski.jpg', photoSource: 'https://www.gettyimages.no/photos/robert-lewandowski-portrait' },
  'alexander-arnold': { portrait: './players/alexander-arnold.jpg', photoSource: 'https://gettyimages.pt/fotos/trent-alexander-arnold' },
  griezmann: { portrait: './players/griezmann.jpg', photoSource: 'https://gettyimages.com/photos/griezman?family=editorial&page=3' },
  wirtz: { portrait: './players/wirtz.jpg', photoSource: 'https://www.gettyimages.fi/photos/florian-wirtz' },
  julian: { portrait: './players/julian.jpg', photoSource: 'https://www.gettyimages.in/photos/julian-alvarez' },
  kubo: { portrait: './players/kubo.jpg', photoSource: 'https://gettyimages.co.uk/photos/takefusa-kubo' },
  luisdiaz: { portrait: './players/luisdiaz.jpg', photoSource: 'https://www.gettyimages.fr/photos/luis-diaz-football' },
  odegaard: { portrait: './players/odegaard.jpg', photoSource: 'https://www.gettyimages.com.au/photos/martin-%C3%B8degaard' },
};
function resolvePhoto(base: BaseSpec & { id: string }): Pick<TakerProfile, 'portrait' | 'photoDate' | 'photoSource' | 'credit'> {
  const extra = PHOTO_EXTRA[base.id];
  return {
    portrait: base.portrait ?? extra?.portrait ?? null,
    photoDate: base.photoDate ?? null,
    photoSource: base.photoSource ?? extra?.photoSource ?? null,
    credit: base.credit ?? (extra ? UNLICENSED : null),
  };
}

type BaseSpec = Omit<TakerProfile, 'id' | 'baseId' | 'edition' | 'portrait' | 'photoDate' | 'photoSource' | 'credit'> & Partial<Pick<TakerProfile, 'portrait' | 'photoDate' | 'photoSource' | 'credit'>>;

/** Real, well-known players with fan-made training numbers. Ratings and attributes are not EA or FC data. */
const BASE: (BaseSpec & { id: string })[] = [
  { id: 'ronaldo', name: 'Cristiano Ronaldo', shortName: 'Ronaldo', nation: 'Portugal', nationCode: 'PT', foot: 'right', number: 7, rating: 95,
    specialty: 'Power specialist', description: 'A powerful, low-spin strike with a pronounced late wobble. Take a step back, hit the centre, and let it move.',
    attributes: { power: 99, curve: 87, knuckle: 99, control: 92 },
    appearance: { shirt: '#b82b38', shorts: '#123b33', trim: '#e4ca83', skin: '#b97e59', hair: '#271e1a', beard: false, height: 1.87 },
    portrait: './players/ronaldo.webp', photoDate: '2 July 2026', photoSource: 'https://commons.wikimedia.org/wiki/File:Cristiano_Ronaldo_Croatia_v_Portugal_2_July_2026-075.jpg', credit: photoCredit },
  { id: 'messi', name: 'Lionel Messi', shortName: 'Messi', nation: 'Argentina', nationCode: 'AR', foot: 'left', number: 10, rating: 97,
    specialty: 'Finesse specialist', description: 'A left-footed artist. Exceptional sidespin and a controlled flight reward a well-placed, curling strike.',
    attributes: { power: 87, curve: 99, knuckle: 70, control: 99 },
    appearance: { shirt: '#c4e6ed', shorts: '#142735', trim: '#f6f3e2', skin: '#c39574', hair: '#3a2e24', beard: true, height: 1.70 },
    portrait: './players/messi.webp', photoDate: '7 July 2026', photoSource: 'https://commons.wikimedia.org/wiki/File:Leo_Messi_Argentina_v_Egypt_7_July_2026-1.jpg', credit: photoCredit },
  { id: 'mbappe', name: 'Kylian Mbappé', shortName: 'Mbappé', nation: 'France', nationCode: 'FR', foot: 'right', number: 10, rating: 93,
    specialty: 'Driven specialist', description: 'Fast, direct, decisive. A high launch speed makes driven shots and long-range strikes arrive in a hurry.',
    attributes: { power: 96, curve: 84, knuckle: 89, control: 89 },
    appearance: { shirt: '#18356d', shorts: '#172645', trim: '#d9cda5', skin: '#936140', hair: '#201b18', beard: false, height: 1.78 },
    portrait: './players/mbappe.webp', photoDate: '16 June 2026', photoSource: 'https://commons.wikimedia.org/wiki/File:Kylian_Mbappe_France_v_Senegal_16_June_2026-391_(cropped).jpg', credit: photoCredit },
  { id: 'salah', name: 'Mohamed Salah', shortName: 'Salah', nation: 'Egypt', nationCode: 'EG', foot: 'left', number: 10, rating: 94,
    specialty: 'Curve specialist', description: 'Shape it with the left. Strong curl with a little extra pace is ideal for finding the far corner from an angle.',
    attributes: { power: 91, curve: 96, knuckle: 76, control: 95 },
    appearance: { shirt: '#cc3b32', shorts: '#e5e3d8', trim: '#1e282e', skin: '#ad784f', hair: '#25201b', beard: true, height: 1.75 },
    portrait: './players/salah.webp', photoDate: '7 July 2026', photoSource: 'https://commons.wikimedia.org/wiki/File:Mohamed_Salah_Argentina_v_Egypt_7_July_2026-163_(cropped).jpg', credit: photoCredit },
  { id: 'haaland', name: 'Erling Haaland', shortName: 'Haaland', nation: 'Norway', nationCode: 'NO', foot: 'left', number: 9, rating: 92,
    specialty: 'Power striker', description: 'A big left-footed hammer. Hit it with conviction and let the power do the talking.',
    attributes: { power: 94, curve: 72, knuckle: 88, control: 80 },
    appearance: { shirt: '#2f6fc0', shorts: '#14243f', trim: '#e7edf5', skin: '#e4b48f', hair: '#c9a86a', beard: false, height: 1.94 } },
  { id: 'debruyne', name: 'Kevin De Bruyne', shortName: 'De Bruyne', nation: 'Belgium', nationCode: 'BE', foot: 'right', number: 17, rating: 91,
    specialty: 'Curve playmaker', description: 'Vision and a right-footed curler. A patient, bending pass into the top corner from the edge of the box.',
    attributes: { power: 84, curve: 93, knuckle: 66, control: 94 },
    appearance: { shirt: '#e8642c', shorts: '#1d2a36', trim: '#fff1d6', skin: '#e2b48f', hair: '#8a5a36', beard: true, height: 1.81 } },
  { id: 'neymar', name: 'Neymar Jr', shortName: 'Neymar', nation: 'Brazil', nationCode: 'BR', foot: 'right', number: 10, rating: 90,
    specialty: 'Technical finesse', description: 'Quick feet and a flicked finish. Light touch, late swerve, and a little flair.',
    attributes: { power: 80, curve: 91, knuckle: 70, control: 97 },
    appearance: { shirt: '#f2c94c', shorts: '#1d3b8c', trim: '#1d3b8c', skin: '#b57d5a', hair: '#1b1512', beard: false, height: 1.75 } },
  { id: 'vandijk', name: 'Virgil van Dijk', shortName: 'Van Dijk', nation: 'Netherlands', nationCode: 'NL', foot: 'right', number: 4, rating: 90,
    specialty: 'Heavy hitter', description: 'A commanding right-footed strike. Less curl, more force, and a thunderous approach.',
    attributes: { power: 92, curve: 70, knuckle: 78, control: 80 },
    appearance: { shirt: '#e35d1a', shorts: '#1f2430', trim: '#f7f2e4', skin: '#e0b28f', hair: '#2b201a', beard: false, height: 1.93 } },
  { id: 'kane', name: 'Harry Kane', shortName: 'Kane', nation: 'England', nationCode: 'GB', foot: 'right', number: 9, rating: 91,
    specialty: 'Clinical finisher', description: 'Composed under pressure. Good knuckle, reliable contact, and a calm eye for the far post.',
    attributes: { power: 88, curve: 78, knuckle: 82, control: 90 },
    appearance: { shirt: '#ecebe6', shorts: '#1d2b4a', trim: '#1d2b4a', skin: '#e6b991', hair: '#4a3420', beard: false, height: 1.88 } },
  { id: 'vinicius', name: 'Vinícius Júnior', shortName: 'Vinícius', nation: 'Brazil', nationCode: 'BR', foot: 'right', number: 7, rating: 89,
    specialty: 'Speed merchant', description: 'Explosive run-up and a quick, direct strike. Good control keeps the shot on line.',
    attributes: { power: 86, curve: 80, knuckle: 74, control: 92 },
    appearance: { shirt: '#2f8f5b', shorts: '#f2f2ee', trim: '#f2f2ee', skin: '#7a4f32', hair: '#130e0c', beard: false, height: 1.76 } },
  { id: 'bellingham', name: 'Jude Bellingham', shortName: 'Bellingham', nation: 'England', nationCode: 'GB', foot: 'right', number: 5, rating: 90,
    specialty: 'Box-to-box shooter', description: 'Strength, timing, and a right-footed drive. Strike it through the wall with confidence.',
    attributes: { power: 90, curve: 82, knuckle: 80, control: 88 },
    appearance: { shirt: '#1f5c99', shorts: '#ecebe6', trim: '#d9b44a', skin: '#e0b28f', hair: '#3c2a1c', beard: false, height: 1.86 } },
  { id: 'yamal', name: 'Lamine Yamal', shortName: 'Yamal', nation: 'Spain', nationCode: 'ES', foot: 'left', number: 19, rating: 89,
    specialty: 'Creative curler', description: 'Young, fearless, and very precise. A controlled left-footed curler to the far side.',
    attributes: { power: 78, curve: 92, knuckle: 65, control: 96 },
    appearance: { shirt: '#c1282e', shorts: '#1b3a7a', trim: '#f2c94c', skin: '#a9744d', hair: '#d7b779', beard: false, height: 1.80 } },
  { id: 'modric', name: 'Luka Modrić', shortName: 'Modrić', nation: 'Croatia', nationCode: 'HR', foot: 'right', number: 10, rating: 88,
    specialty: 'Metronome curler', description: 'Calm, economical technique. Small contact changes give big, measured movement.',
    attributes: { power: 72, curve: 90, knuckle: 60, control: 98 },
    appearance: { shirt: '#f1f1ee', shorts: '#1c1c1c', trim: '#c4202b', skin: '#c39070', hair: '#bcb7b1', beard: false, height: 1.72 } },
  { id: 'lewandowski', name: 'Robert Lewandowski', shortName: 'Lewandowski', nation: 'Poland', nationCode: 'PL', foot: 'right', number: 9, rating: 91,
    specialty: 'Penalty-box poacher', description: 'A right-footed finisher. Quick hands on the ball, sharp knuckle when you need the keeper guessing.',
    attributes: { power: 90, curve: 74, knuckle: 84, control: 91 },
    appearance: { shirt: '#e6e6e0', shorts: '#c4202b', trim: '#1d2b4a', skin: '#e0b28f', hair: '#4e3a2a', beard: true, height: 1.85 } },
  { id: 'alexander-arnold', name: 'Trent Alexander-Arnold', shortName: 'Alexander-Arnold', nation: 'England', nationCode: 'GB', foot: 'right', number: 66, rating: 87,
    specialty: 'Set-piece crafter', description: 'Dead-ball specialist. A right-footed delivery with swing and a long, curling arc.',
    attributes: { power: 84, curve: 91, knuckle: 62, control: 86 },
    appearance: { shirt: '#7fc4e6', shorts: '#1f2f40', trim: '#f2f2ee', skin: '#e5b48e', hair: '#3b2a1e', beard: false, height: 1.80 } },
  { id: 'saka', name: 'Bukayo Saka', shortName: 'Saka', nation: 'England', nationCode: 'GB', foot: 'right', number: 7, rating: 87,
    specialty: 'Inside-foot finesse', description: 'Calm in the box and clean on the inside of the right foot.',
    attributes: { power: 76, curve: 84, knuckle: 62, control: 90 },
    appearance: { shirt: '#f5f5f5', shorts: '#f5f5f5', trim: '#c8102e', skin: '#8d5e44', hair: '#1c1510', beard: false, height: 1.78 } },
  { id: 'rodri', name: 'Rodri', shortName: 'Rodri', nation: 'Spain', nationCode: 'ES', foot: 'right', number: 16, rating: 90,
    specialty: 'Metronome', description: 'Measured and patient. Hits the same dependable line every time.',
    attributes: { power: 74, curve: 70, knuckle: 66, control: 95 },
    appearance: { shirt: '#c1282e', shorts: '#ffffff', trim: '#f2c94c', skin: '#c08d5f', hair: '#2a1d15', beard: false, height: 1.91 } },
  { id: 'pedri', name: 'Pedro González', shortName: 'Pedri', nation: 'Spain', nationCode: 'ES', foot: 'right', number: 8, rating: 88,
    specialty: 'Silky technician', description: 'Light touch and quick feet. Curls it low and soft.',
    attributes: { power: 70, curve: 84, knuckle: 58, control: 94 },
    appearance: { shirt: '#c1282e', shorts: '#1b3a7a', trim: '#f2c94c', skin: '#b98260', hair: '#3a2a1e', beard: false, height: 1.74 } },
  { id: 'dembele', name: 'Ousmane Dembélé', shortName: 'Dembélé', nation: 'France', nationCode: 'FR', foot: 'left', number: 10, rating: 88,
    specialty: 'Two-footed dribbler', description: 'Equally strong with either foot. Unpredictable from any angle.',
    attributes: { power: 80, curve: 80, knuckle: 70, control: 88 },
    appearance: { shirt: '#1f3c88', shorts: '#ffffff', trim: '#c8102e', skin: '#8a5a3c', hair: '#140e0b', beard: false, height: 1.78 } },
  { id: 'vitinha', name: 'Vítor Machado Ferreira', shortName: 'Vitinha', nation: 'Portugal', nationCode: 'PT', foot: 'right', number: 17, rating: 86,
    specialty: 'Precise placer', description: 'Compact and composed. Places the ball where the keeper is not.',
    attributes: { power: 68, curve: 78, knuckle: 60, control: 92 },
    appearance: { shirt: '#b5121b', shorts: '#006600', trim: '#f2c94c', skin: '#b07a58', hair: '#1f1712', beard: false, height: 1.72 } },
  { id: 'griezmann', name: 'Antoine Griezmann', shortName: 'Griezmann', nation: 'France', nationCode: 'FR', foot: 'right', number: 7, rating: 83,
    specialty: 'Link-up specialist', description: 'Clever in tight spaces. Finds a clean angle and places it low.',
    attributes: { power: 84, curve: 90, knuckle: 70, control: 93 },
    appearance: { shirt: '#1d4ed8', shorts: '#ffffff', trim: '#ffffff', skin: '#1f1712', hair: '#1f1712', beard: false, height: 1.76 } },
  { id: 'musiala', name: 'Jamal Musiala', shortName: 'Musiala', nation: 'Germany', nationCode: 'DE', foot: 'right', number: 14, rating: 81,
    specialty: 'Dribble specialist', description: 'Quick feet and a low centre of gravity. Good at creating a shooting window.',
    attributes: { power: 78, curve: 88, knuckle: 66, control: 95 },
    appearance: { shirt: '#dc2626', shorts: '#ffffff', trim: '#111111', skin: '#3b2a20', hair: '#1f1712', beard: false, height: 1.84 } },
  { id: 'wirtz', name: 'Florian Wirtz', shortName: 'Wirtz', nation: 'Germany', nationCode: 'DE', foot: 'right', number: 10, rating: 83,
    specialty: 'Curve specialist', description: 'A clean curler from the edge of the box. Patient and precise.',
    attributes: { power: 80, curve: 93, knuckle: 69, control: 94 },
    appearance: { shirt: '#ffffff', shorts: '#111111', trim: '#dc2626', skin: '#e0b48e', hair: '#1f1712', beard: false, height: 1.76 } },
  { id: 'lautaro', name: 'Lautaro Martínez', shortName: 'Lautaro', nation: 'Argentina', nationCode: 'AR', foot: 'right', number: 10, rating: 81,
    specialty: 'Driven specialist', description: 'Compact and sharp. A low, driven strike is his best option.',
    attributes: { power: 86, curve: 78, knuckle: 79, control: 87 },
    appearance: { shirt: '#7dd3fc', shorts: '#1e3a8a', trim: '#ffffff', skin: '#9a6a48', hair: '#1f1712', beard: false, height: 1.74 } },
  { id: 'julian', name: 'Julián Álvarez', shortName: 'Álvarez', nation: 'Argentina', nationCode: 'AR', foot: 'right', number: 9, rating: 79,
    specialty: 'Precise placer', description: 'Calm in front of goal. Places it low into the corner.',
    attributes: { power: 79, curve: 82, knuckle: 70, control: 90 },
    appearance: { shirt: '#7dd3fc', shorts: '#1e3a8a', trim: '#ffffff', skin: '#c49070', hair: '#1f1712', beard: false, height: 1.70 } },
  { id: 'barella', name: 'Nicolò Barella', shortName: 'Barella', nation: 'Italy', nationCode: 'IT', foot: 'right', number: 23, rating: 78,
    specialty: 'Power specialist', description: 'Box-to-box energy. A short backswing, a strong drive.',
    attributes: { power: 84, curve: 79, knuckle: 68, control: 86 },
    appearance: { shirt: '#0b5fa5', shorts: '#1f2937', trim: '#ffffff', skin: '#b5835f', hair: '#1f1712', beard: false, height: 1.70 } },
  { id: 'dimarco', name: 'Federico Dimarco', shortName: 'Dimarco', nation: 'Italy', nationCode: 'IT', foot: 'left', number: 32, rating: 77,
    specialty: 'Curve specialist', description: 'A left-footed wing-back who curls it from distance with a lot of spin.',
    attributes: { power: 78, curve: 88, knuckle: 62, control: 82 },
    appearance: { shirt: '#1e40af', shorts: '#0f172a', trim: '#ffffff', skin: '#e0b48e', hair: '#1f1712', beard: false, height: 1.78 } },
  { id: 'kubo', name: 'Takefusa Kubo', shortName: 'Kubo', nation: 'Japan', nationCode: 'JP', foot: 'left', number: 14, rating: 77,
    specialty: 'Finesse specialist', description: 'Light touch, neat turns. Likes the far post with the left.',
    attributes: { power: 74, curve: 88, knuckle: 58, control: 91 },
    appearance: { shirt: '#1e3a8a', shorts: '#f8fafc', trim: '#dc2626', skin: '#c68a5e', hair: '#1f1712', beard: false, height: 1.72 } },
  { id: 'dovbyk', name: 'Artem Dovbyk', shortName: 'Dovbyk', nation: 'Ukraine', nationCode: 'UA', foot: 'right', number: 11, rating: 77,
    specialty: 'Power striker', description: 'A physical forward. A firm finish when the box is crowded.',
    attributes: { power: 88, curve: 67, knuckle: 80, control: 79 },
    appearance: { shirt: '#facc15', shorts: '#1e3a8a', trim: '#facc15', skin: '#c08a62', hair: '#1f1712', beard: false, height: 1.90 } },
  { id: 'luisdiaz', name: 'Luis Díaz', shortName: 'Díaz', nation: 'Colombia', nationCode: 'CO', foot: 'left', number: 7, rating: 80,
    specialty: 'Driven specialist', description: 'Pace and a direct, quick strike with the left foot.',
    attributes: { power: 84, curve: 80, knuckle: 72, control: 87 },
    appearance: { shirt: '#fde047', shorts: '#1e3a8a', trim: '#dc2626', skin: '#8d5e44', hair: '#1f1712', beard: false, height: 1.80 } },
  { id: 'kulusevski', name: 'Dejan Kulusevski', shortName: 'Kulusevski', nation: 'Sweden', nationCode: 'SE', foot: 'right', number: 11, rating: 76,
    specialty: 'Precise placer', description: 'Quick decision-maker. Likes to wrap it into the corner.',
    attributes: { power: 78, curve: 82, knuckle: 64, control: 85 },
    appearance: { shirt: '#ffffff', shorts: '#1e3a8a', trim: '#fde047', skin: '#e2b99a', hair: '#1f1712', beard: false, height: 1.86 } },
  { id: 'hojlund', name: 'Rasmus Højlund', shortName: 'Højlund', nation: 'Denmark', nationCode: 'DK', foot: 'right', number: 9, rating: 79,
    specialty: 'Power striker', description: 'Long-striding forward who hits the ball hard and goes for the top corner.',
    attributes: { power: 88, curve: 70, knuckle: 78, control: 82 },
    appearance: { shirt: '#dc2626', shorts: '#ffffff', trim: '#ffffff', skin: '#e7bb9b', hair: '#1f1712', beard: false, height: 1.90 } },
  { id: 'odegaard', name: 'Martin Ødegaard', shortName: 'Ødegaard', nation: 'Norway', nationCode: 'NO', foot: 'right', number: 8, rating: 80,
    specialty: 'Finesse specialist', description: 'A composed playmaker. A clever touch and a precise finish.',
    attributes: { power: 77, curve: 88, knuckle: 64, control: 94 },
    appearance: { shirt: '#dc2626', shorts: '#1e3a8a', trim: '#ffffff', skin: '#f1c7a6', hair: '#1f1712', beard: false, height: 1.78 } },
  { id: 'bruno', name: 'Bruno Fernandes', shortName: 'Bruno', nation: 'Portugal', nationCode: 'PT', foot: 'right', number: 8, rating: 85,
    specialty: 'Power specialist', description: 'A confident shooter. Strong from distance with a pronounced dip.',
    attributes: { power: 89, curve: 82, knuckle: 82, control: 89 },
    appearance: { shirt: '#b82b38', shorts: '#123b33', trim: '#e4ca83', skin: '#c79a77', hair: '#1f1712', beard: false, height: 1.79 } },
  { id: 'foden', name: 'Phil Foden', shortName: 'Foden', nation: 'England', nationCode: 'GB', foot: 'left', number: 47, rating: 78,
    specialty: 'Finesse specialist', description: 'Left-footed and tidy. Works the ball into the space by the post.',
    attributes: { power: 75, curve: 85, knuckle: 62, control: 93 },
    appearance: { shirt: '#ffffff', shorts: '#1f2937', trim: '#c8102e', skin: '#e0b48e', hair: '#1f1712', beard: false, height: 1.70 } },
];

/** Turquoise special: a sharper card with a handwritten name and a clean turquoise kit. */
const TURQUOISE = { shirt: '#2fd8c8', shorts: '#0c4f52', trim: '#f4fffd' };
/** Card rating is the average of the four stats, minus one: the number always matches the stats shown. */
const overall = (a: { power: number; curve: number; knuckle: number; control: number }) => Math.round((a.power + a.curve + a.knuckle + a.control) / 4) - 1;
/** Only three turquoise specials exist for now. */
const SPECIAL_IDS = ['vinicius', 'yamal', 'mbappe'];
function specialOf(base: BaseSpec & { id: string }): TakerProfile {
  const bump = (value: number) => Math.min(99, value + 2);
  const attributes = { power: bump(base.attributes.power), curve: bump(base.attributes.curve), knuckle: bump(base.attributes.knuckle), control: bump(base.attributes.control) };
  return {
    ...base,
    id: `${base.id}-special`,
    baseId: base.id,
    edition: 'special',
    rating: overall(attributes),
    description: `Turquoise special. ${base.description}`,
    attributes,
    appearance: { ...base.appearance, shirt: TURQUOISE.shirt, shorts: TURQUOISE.shorts, trim: TURQUOISE.trim },
    ...resolvePhoto(base),
  };
}
const standardCards: TakerProfile[] = BASE.map(base => ({
  ...base, rating: overall(base.attributes), baseId: base.id, edition: 'standard',
  ...resolvePhoto(base),
}));
/** Standard cards first, then each player's turquoise special. */
export const PLAYERS: readonly TakerProfile[] = [...standardCards, ...BASE.filter(base => SPECIAL_IDS.includes(base.id)).map(specialOf)];

export const DEFAULT_PLAYER_ID = 'ronaldo';
export function getPlayer(id: string): TakerProfile { return PLAYERS.find(player => player.id === id) ?? PLAYERS[0]; }
export function isPlayerId(id: unknown): id is string { return typeof id === 'string' && PLAYERS.some(player => player.id === id); }
export function playerName(player: TakerProfile): string { return player.name; }
