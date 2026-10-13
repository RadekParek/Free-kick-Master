import type { TakerProfile } from '../players';

export const flag = (code: string) => `<span class="nation-flag flag-${code.toLowerCase()}" aria-hidden="true"></span>`;

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
  const classes = ['player-card', special ? 'is-special' : '', selected ? 'selected' : '', interactive ? '' : 'is-showcase'].filter(Boolean).join(' ');
  const art = player.portrait
    ? `<img class="card-portrait" src="${player.portrait}" alt="${player.name}, photographed ${player.photoDate}" width="500" height="750" loading="lazy" draggable="false" />`
    : `<span class="card-monogram" aria-hidden="true">${monogram(player)}</span>`;
  const body = `<span class="card-foil"></span><span class="card-lines"></span>
    <span class="card-edition">${special ? 'TURQUOISE <b>SPECIAL</b>' : 'FK SERIES <b>01</b>'}</span>
    <span class="card-rating"><strong>${player.rating}</strong><small>FK</small>${flag(player.nationCode)}</span>
    ${art}
    <span class="card-shade"></span>
    <span class="card-info"><strong class="card-name ${special ? 'handwritten' : ''}">${player.shortName}</strong><span class="card-specialty">${player.specialty}</span>
      <span class="card-stats"><span><b>${player.attributes.power}</b><small>PWR</small></span><span><b>${player.attributes.curve}</b><small>CUR</small></span><span><b>${player.attributes.knuckle}</b><small>KNU</small></span></span>
      <span class="card-country">${player.nation} <i>·</i> ${player.foot === 'left' ? 'LEFT' : 'RIGHT'} FOOT</span>
    </span><span class="card-selected" aria-hidden="true">✓</span>`;
  if (!interactive) return `<div class="${classes}" aria-label="${player.name}">${body}</div>`;
  return `<button class="${classes}" data-player="${player.id}" aria-label="Select ${player.name}${special ? ', turquoise special' : ''}" aria-pressed="${selected}">${body}</button>`;
}

export function takerHud(player: TakerProfile): string {
  const special = player.edition === 'special';
  const art = player.portrait ? `<img src="${player.portrait}" alt="" width="500" height="750" draggable="false" />` : `<span class="card-monogram" aria-hidden="true">${monogram(player)}</span>`;
  return `<span class="mini-card ${special ? 'is-special' : ''}"><span>${player.rating}<small>FK</small></span>${art}</span>
    <span class="taker-copy"><span class="hud-eyebrow">${special ? 'TURQUOISE SPECIAL' : 'YOUR FREE-KICK TAKER'}</span><strong id="taker-name" class="${special ? 'handwritten' : ''}">${player.shortName}</strong><span class="taker-meta">${flag(player.nationCode)} ${player.nation}</span><span class="change-taker">CHANGE PLAYER <kbd>T</kbd></span></span>`;
}
