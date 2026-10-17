import { playStyleFor, PLAYSTYLE_LABELS, type TakerProfile } from '../players';

function playStyleBadge(player: TakerProfile): string {
  const style = playStyleFor(player.baseId);
  return style ? `<span class="playstyle-badge" title="${PLAYSTYLE_LABELS[style]}" aria-label="${PLAYSTYLE_LABELS[style]}"><img src="./playstyles/${style}.png" alt="" width="32" height="32"/><small>${PLAYSTYLE_LABELS[style]}</small></span>` : '';
}


const FLAGS: Record<string, string> = {
  ma:'<rect width="30" height="20" fill="#c1272d"/><path d="m15 4 3.5 10-9-6.2h11l-9 6.2z" fill="none" stroke="#006233" stroke-width="1"/>',
  sn:'<rect width="10" height="20" fill="#00853f"/><rect x="10" width="10" height="20" fill="#fdef42"/><rect x="20" width="10" height="20" fill="#e31b23"/><path d="m15 6 1 3h3l-2.5 2 1 3-2.5-2-2.5 2 1-3-2.5-2h3z" fill="#00853f"/>',
  ge:'<rect width="30" height="20" fill="#fff"/><path d="M15 0v20M0 10h30" stroke="#ff0000" stroke-width="3"/><path d="M7 3v5M4.5 5.5h5M23 3v5M20.5 5.5h5M7 12v5M4.5 14.5h5M23 12v5M20.5 14.5h5" stroke="#ff0000" stroke-width="1.3"/>',
  pt: '<rect width="30" height="20" fill="#d80027"/><rect width="12" height="20" fill="#046a38"/><circle cx="12" cy="10" r="3.4" fill="#ffda44" stroke="#8a1b1b" stroke-width=".6"/>',
  ar: '<rect width="30" height="20" fill="#74acdf"/><rect y="6.67" width="30" height="6.66" fill="#fff"/><circle cx="15" cy="10" r="1.7" fill="#f6b40e"/>',
  fr: '<rect width="10" height="20" fill="#002395"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ed2939"/>',
  eg: '<rect width="30" height="20" fill="#ce1126"/><rect y="6.67" width="30" height="6.66" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#000"/><circle cx="15" cy="10" r="1.6" fill="#c09300"/>',
  no: '<rect width="30" height="20" fill="#ba0c2f"/><rect x="9" y="0" width="4" height="20" fill="#fff"/><rect y="8" width="30" height="4" fill="#fff"/><rect x="10" width="2" height="20" fill="#00205b"/><rect y="9" width="30" height="2" fill="#00205b"/>',
  be: '<rect width="10" height="20" fill="#000"/><rect x="10" width="10" height="20" fill="#fae042"/><rect x="20" width="10" height="20" fill="#ed2939"/>',
  br: '<rect width="30" height="20" fill="#009c3b"/><polygon points="15,2 28,10 15,18 2,10" fill="#ffdf00"/><circle cx="15" cy="10" r="4.2" fill="#002776"/>',
  nl: '<rect width="30" height="6.67" fill="#ae1c28"/><rect y="6.67" width="30" height="6.66" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#21468b"/>',
  gb: '<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.4"/><path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/><path d="M15 0V20M0 10H30" stroke="#c8102e" stroke-width="3.4"/>',
  es: '<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>',
  hr: '<rect width="30" height="6.67" fill="#ff0000"/><rect y="6.67" width="30" height="6.66" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#171796"/>',
  pl: '<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#dc143c"/>',
  de: '<rect width="30" height="6.67" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#d00"/><rect y="13.33" width="30" height="6.67" fill="#ffce00"/>',
  it: '<rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce2b37"/>',
  jp: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
  ua: '<rect width="30" height="10" fill="#005bbb"/><rect y="10" width="30" height="10" fill="#ffd500"/>',
  co: '<rect width="30" height="10" fill="#fcd116"/><rect y="10" width="30" height="5" fill="#003893"/><rect y="15" width="30" height="5" fill="#ce1126"/>',
  se: '<rect width="30" height="20" fill="#006aa7"/><rect x="8" width="4" height="20" fill="#fecc00"/><rect y="8" width="30" height="4" fill="#fecc00"/>',
  dk: '<rect width="30" height="20" fill="#c60c30"/><rect x="8" width="4" height="20" fill="#fff"/><rect y="8" width="30" height="4" fill="#fff"/>',
};

/** Accurate national flags as inline SVG, so the nation shown is always correct. */
export const flag = (code: string) => {
  const body = FLAGS[code.toLowerCase()] ?? '<rect width="30" height="20" fill="#334155"/>';
  return `<span class="nation-flag" aria-hidden="true"><svg viewBox="0 0 30 20" preserveAspectRatio="none">${body}</svg></span>`;
};

/** Initials for players without a licensed portrait. Original monogram art, not a likeness. */
export function monogram(player: TakerProfile): string {
  const words = player.name.replace(/[^\p{L}\s-]/gu, '').split(/[\s-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Original card artwork: CSS foil, geometric frame and, where licensed, a credited real portrait.
 * Turquoise specials use a turquoise foil and a handwritten name.
 */
export function playerCard(player: TakerProfile, selected = false, interactive = true): string {
  const special = player.edition === 'special';
  const classes = ['player-card', special ? 'is-special' : player.edition === 'icon' ? 'is-icon' : '', selected ? 'selected' : '', interactive ? '' : 'is-showcase'].filter(Boolean).join(' ');
  const art = player.portrait
    ? `<img class="card-portrait" src="${player.portrait}" alt="${player.name}" width="500" height="750" loading="lazy" draggable="false" />`
    : `<span class="card-monogram" aria-hidden="true">${monogram(player)}</span>`;
  const body = `<span class="card-foil" aria-hidden="true"></span><span class="card-lines" aria-hidden="true"></span><span class="card-frame" aria-hidden="true"></span>${special ? '<span class="card-hologram" aria-hidden="true"></span><span class="card-seal" aria-hidden="true">✦<small>FK</small></span>' : ''}
    <span class="card-edition">${special ? 'TURQUOISE <b>SPECIAL</b>' : player.edition === 'icon' ? 'HERITAGE <b>ICON</b>' : 'SET PIECE <b>ELITE</b>'}</span>
    <span class="card-rating"><strong>${player.rating}</strong><small>FK</small>${flag(player.nationCode)}</span>${playStyleBadge(player)}
    ${art}
    <span class="card-shade"></span>
    <span class="card-info"><strong class="card-name${special ? ' handwritten' : ''}">${player.shortName}</strong><span class="card-specialty">${player.specialty}</span>
      <span class="card-stats"><span><b>${player.attributes.power}</b><small>PWR</small></span><span><b>${player.attributes.curve}</b><small>CUR</small></span><span><b>${player.attributes.knuckle}</b><small>KNU</small></span><span><b>${player.attributes.control}</b><small>CTL</small></span></span>
      <span class="card-country">${player.nation} <i>·</i> ${player.appearance.height.toFixed(2)} M <i>·</i> ${player.foot === 'left' ? 'LEFT' : 'RIGHT'} FOOT</span>
    </span><span class="card-selected" aria-hidden="true">✓</span>`;
  if (!interactive) return `<div class="${classes}" aria-label="${player.name}">${body}</div>`;
  return `<button class="${classes}" data-player="${player.id}" aria-label="Select ${player.name}${special ? ', turquoise special' : player.edition === 'icon' ? ', ICON' : ''}" aria-pressed="${selected}">${body}</button>`;
}

export function takerHud(player: TakerProfile): string {
  const special = player.edition === 'special';
  const art = player.portrait ? `<img src="${player.portrait}" alt="" width="500" height="750" draggable="false" />` : `<span class="card-monogram" aria-hidden="true">${monogram(player)}</span>`;
  return `<span class="mini-card ${special ? 'is-special' : player.edition === 'icon' ? 'is-icon' : ''}"><span>${player.rating}<small>FK</small></span>${art}${playStyleBadge(player)}</span><span class="sr-only"><strong id="taker-name" class="${special ? 'handwritten' : ''}">${player.shortName}</strong></span>`;
}

/** Main-menu showcase: the equipped player's photo or monogram art, without the card frame. */
export function showcaseArt(player: TakerProfile): string {
  const special = player.edition === 'special' ? ' is-special' : player.edition === 'icon' ? ' is-icon' : '';
  if (player.portrait) return `<figure class="showcase-art${special}"><img src="${player.portrait}" alt="${player.name}" width="500" height="750" draggable="false" /></figure>`;
  return `<figure class="showcase-art showcase-mono${special}" aria-label="${player.name}"><span>${monogram(player)}</span></figure>`;
}
