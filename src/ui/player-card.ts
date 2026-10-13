import type { TakerProfile } from '../players';

export const flag = (code: string) => `<span class="nation-flag flag-${code.toLowerCase()}" aria-hidden="true"></span>`;

/** Original card artwork: CSS foil, geometric frame, and credited real portrait. */
export function playerCard(player: TakerProfile, selected = false): string {
  return `<button class="player-card ${selected ? 'selected' : ''}" data-player="${player.id}" aria-label="Select ${player.name}" aria-pressed="${selected}">
    <span class="card-foil"></span><span class="card-lines"></span>
    <span class="card-edition">MASTER SERIES <b>26</b></span>
    <span class="card-rating"><strong>${player.rating}</strong><small>FK</small>${flag(player.nationCode)}</span>
    <img class="card-portrait" src="${player.portrait}" alt="${player.name}, photographed ${player.photoDate}" width="500" height="750" loading="lazy" draggable="false" />
    <span class="card-shade"></span>
    <span class="card-info"><strong class="card-name">${player.shortName}</strong><span class="card-specialty">${player.specialty}</span>
      <span class="card-stats"><span><b>${player.attributes.power}</b><small>PWR</small></span><span><b>${player.attributes.curve}</b><small>CUR</small></span><span><b>${player.attributes.knuckle}</b><small>KNU</small></span></span>
      <span class="card-country">${player.nation} <i>·</i> ${player.foot === 'left' ? 'LEFT' : 'RIGHT'} FOOT</span>
    </span><span class="card-selected" aria-hidden="true">✓</span>
  </button>`;
}

export function takerHud(player: TakerProfile): string {
  return `<span class="mini-card"><span>${player.rating}<small>FK</small></span><img src="${player.portrait}" alt="" width="500" height="750" draggable="false" /></span>
    <span class="taker-copy"><span class="hud-eyebrow">YOUR FREE-KICK TAKER</span><strong id="taker-name">${player.shortName}</strong><span class="taker-meta">${flag(player.nationCode)} ${player.nation} <i>·</i> ${player.specialty}</span><span class="change-taker">CHANGE PLAYER <kbd>T</kbd><span>↗</span></span></span>`;
}
