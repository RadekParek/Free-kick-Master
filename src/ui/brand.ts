/**
 * Original FK brand mark: heavy italic letters, a speed slash, and a ball at the foot of the K.
 * Deliberately not a copy of any third-party logo.
 */
export const fkLogo = (className = 'fk-logo') => `<svg class="${className}" viewBox="0 0 330 150" role="img" aria-label="FK Free Kick Master">
  <defs>
    <linearGradient id="fk-lime" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3ffc2"/><stop offset=".45" stop-color="#b4ff37"/><stop offset="1" stop-color="#5fb300"/></linearGradient>
    <linearGradient id="fk-turq" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7ff5e6"/><stop offset="1" stop-color="#1fb8a8"/></linearGradient>
  </defs>
  <path d="M176 6 214 6 150 146 112 146Z" fill="url(#fk-turq)" opacity=".85"/>
  <path d="M222 6 236 6 172 146 158 146Z" fill="#ffffff" opacity=".22"/>
  <text x="6" y="118" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700" font-style="italic" font-size="142" letter-spacing="-4" fill="url(#fk-lime)" stroke="#0b1a08" stroke-width="5" paint-order="stroke" transform="skewX(-6)">FK</text>
  <g transform="translate(278 116)">
    <circle r="27" fill="#f7f9ef" stroke="#0b1a08" stroke-width="4"/>
    <path d="m0-10 9 7-3 11h-12l-3-11Z" fill="#0b1a08"/>
    <path d="M0-10v-12M9 -3l12-4M6 8l8 10M-6 8l-8 10M-9-3l-12-4" stroke="#0b1a08" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;

export const brandSymbol = () => `<svg class="brand-symbol" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40 19 8h7l-11 32Z" fill="#b4ff37"/><path d="M22 8h18l-4 9H27z" fill="#b4ff37"/><path d="M24 22h13l-4 9H20z" fill="#2fd8c8"/><circle cx="38" cy="38" r="7" fill="#f7f9ef"/></svg>`;
