import { createIcons, ArrowDownLeft, ArrowRight, ArrowUpRight, AudioLines, Check, ChevronDown, Crosshair, Flag, Flame, Focus, Goal, HelpCircle, Maximize, Minus, MousePointer2, Move, Play, Plus, RotateCcw, Settings2, Shield, Smartphone, Sparkles, Target, Trophy, Volume2, VolumeX, X, Zap } from 'lucide';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { PLAYERS, PHOTO_LICENSE, getPlayer } from '../players';
import { playerCard, takerHud } from './player-card';
import { Arena, type Phase } from '../game/arena';
import { GameAudio } from '../game/audio';
import { clamp, constrainPosition, distanceBounds, distanceToGoal, recommendedPower, strikeName, type Position } from '../game/physics';
import { DIFFICULTIES, KEEPER_PROFILES, type Difficulty } from '../game/keeper';
import { DEFAULT_SETTINGS, emptySession, loadSettings, recordShot, saveSettings, type Settings, type ShotResult } from '../state';

const icons = { ArrowDownLeft, ArrowRight, ArrowUpRight, AudioLines, Check, ChevronDown, Crosshair, Flag, Flame, Focus, Goal, HelpCircle, Maximize, Minus, MousePointer2, Move, Play, Plus, RotateCcw, Settings2, Shield, Smartphone, Sparkles, Target, Trophy, Volume2, VolumeX, X, Zap };
const icon = (name: string, className = '') => `<i data-lucide="${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}" class="${className}" aria-hidden="true"></i>`;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const $$ = <T extends HTMLElement = HTMLElement>(selector: string) => [...document.querySelectorAll<T>(selector)];
const drawIcons = () => {
  createIcons({ icons, attrs: { 'stroke-width': 1.7 } });
  // Existing icons do not need to be recreated on every pointer-driven settings update.
  document.querySelectorAll('svg[data-lucide]').forEach(svg => svg.removeAttribute('data-lucide'));
};
const logo = `<svg class="brand-symbol" viewBox="0 0 48 48" aria-hidden="true"><path d="M7 37 18 9h28l-4 9H26l-2 6h13l-4 9H20l-2 4Z" fill="currentColor"/><circle cx="38" cy="37" r="7" fill="currentColor"/><path d="m38 33 4 3-1 4h-5l-1-4Z" fill="#172219"/></svg>`;

interface Challenge {
  id: string; title: string; eyebrow: string; description: string; icon: string;
  positions: Position[]; difficulty: Difficulty; wall: number;
  accepts: (shot: ShotResult) => boolean;
}
const CHALLENGES: Challenge[] = [
  { id: 'top-bins', title: 'Top bins only.', eyebrow: '01 / PRECISION', description: 'Five kicks. Find either top corner: above 1.6 m and within 1.3 m of a post.', icon: 'Crosshair', difficulty: 'amateur', wall: 3,
    positions: [{ x: -5, z: 21 }, { x: 0, z: 22 }, { x: 5, z: 21 }, { x: -7, z: 23 }, { x: 7, z: 23 }], accepts: shot => shot.outcome === 'goal' && Math.abs(shot.point.x) >= 2.36 && shot.point.y >= 1.6 },
  { id: 'long-range', title: 'From way out.', eyebrow: '02 / POWER', description: 'Make distance your signature. Score five free kicks from 30 to 38 metres.', icon: 'Zap', difficulty: 'amateur', wall: 3,
    positions: [{ x: 0, z: 30 }, { x: -6, z: 31 }, { x: 6, z: 32 }, { x: -8, z: 34 }, { x: 0, z: 38 }], accepts: shot => shot.outcome === 'goal' },
  { id: 'wall-master', title: 'Bend the rules.', eyebrow: '03 / FINESSE', description: 'A five-player wall. A professional keeper. Five chances to make the net move.', icon: 'Shield', difficulty: 'pro', wall: 5,
    positions: [{ x: -9, z: 21 }, { x: 9, z: 21 }, { x: -12, z: 24 }, { x: 12, z: 24 }, { x: 0, z: 25 }], accepts: shot => shot.outcome === 'goal' },
];

export class GameApp {
  private settings = loadSettings();
  private session = emptySession();
  private arena: Arena | null = null;
  private audio = new GameAudio();
  private currentPhase: Phase = 'ready';
  private toastTimer = 0;
  private challenge: { definition: Challenge; attempts: number; hits: number; results: boolean[] } | null = null;
  private practiceSettings: Settings | null = null;
  private modalReturnFocus: HTMLElement | null = null;
  private powerPointer: number | null = null;
  private visible = true;

  async mount() {
    $('#app').innerHTML = this.layout();
    drawIcons();
    this.bindUI();
    this.syncUI();
    this.audio.enabled = this.settings.sound;
    await document.fonts.ready;
    try {
      this.arena = new Arena($('#arena'), this.settings, {
        phase: phase => this.onPhase(phase),
        power: power => this.onPower(power),
        result: result => this.onResult(result),
        aim: aim => { this.settings.aim = aim; this.updateAimReadout(); },
        target: (x, y, visible) => {
          const reticle = $('#aim-reticle');
          const transform = `translate(${Math.round(x * 10) / 10}px, ${Math.round(y * 10) / 10}px)`;
          if (reticle.style.transform !== transform) reticle.style.transform = transform;
          reticle.hidden = !visible;
        },
        error: message => this.showGraphicsError(message),
        performance: stats => {
          const monitor = $('#performance');
          monitor.textContent = `${stats.fps} FPS · ${stats.calls} DRAWS · ${stats.scale}%`;
          monitor.dataset.drawCalls = String(stats.calls);
          monitor.dataset.triangles = String(stats.triangles);
        },
      });
      $('#scene-loading').classList.add('loaded');
      $('#app').classList.add('is-ready');
      setTimeout(() => $('#scene-loading').remove(), 450);
      this.onPhase('ready');
    } catch (error) {
      console.error('Arena initialization failed', error);
      this.showGraphicsError('This device could not start WebGL 2. Try an up-to-date browser or Android System WebView with hardware acceleration enabled.');
    }
  }

  private layout() {
    return `<main class="app-shell game-shell">
      <section class="arena-card" aria-label="Fullscreen 3D free-kick arena">
        <div id="arena" class="arena-canvas"></div><div class="arena-vignette"></div>
        <header class="hud-header">
          <button class="brand" id="brand-home" aria-label="Free Kick Master — training ground">${logo}<span>FREEKICK <b>MASTER</b></span></button>
          <nav class="mode-nav" aria-label="Game mode"><button class="nav-button active" id="training-tab" aria-pressed="true">PRACTICE</button><button class="nav-button" id="challenges-tab" aria-pressed="false">CHALLENGES</button></nav>
          <div class="header-actions"><button class="icon-button" id="sound-button" aria-label="Mute sound" title="Toggle sound">${icon('Volume2')}</button><button class="icon-button" id="help-button" aria-label="How to play" title="How to play">${icon('HelpCircle')}</button><button class="icon-button" id="fullscreen-button" aria-label="Enter fullscreen" title="Fullscreen">${icon('Maximize')}</button><button class="settings-button" id="settings-button" aria-label="Settings">${icon('Settings2')}<span>SETTINGS</span></button></div>
        </header>
        <section class="hud-session" aria-label="Session score">
          <div class="session-live"><span class="status-dot"></span> TRAINING ARENA <span class="session-number">/ 26</span></div>
          <div class="score-line"><div><span>GOALS</span><strong id="stat-goals">0</strong></div><i></i><div><strong id="stat-attempts">0</strong><span>ATTEMPTS</span></div></div>
          <div class="session-meta"><span id="mode-pill"><span class="status-dot"></span> FREE PRACTICE</span><span id="streak-label">${icon('Flame')} <b>0</b></span></div>
        </section>
        <div class="pitch-info"><button id="position-button" class="position-button" aria-label="Change kick position and distance">${icon('Crosshair')}<strong id="stage-distance">24.7<span>m</span></strong><span>DISTANCE TO GOAL</span>${icon('ChevronDown')}</button><button id="keeper-button" class="keeper-badge" aria-label="Change goalkeeper difficulty">${icon('Shield')}<span id="keeper-hud">PRO · 4-MAN WALL</span></button></div>
                      <div class="aim-reticle" id="aim-reticle" hidden><span class="reticle-ring"></span><span class="reticle-center"></span><span class="reticle-label">AIM</span></div>
              <div class="scene-message" id="scene-message" hidden><span id="scene-message-label">SET YOUR POWER</span><strong id="scene-message-title">Make it count.</strong></div>
              <div class="shot-result" id="shot-result" aria-live="polite" hidden><span class="result-eyebrow" id="result-eyebrow">WHAT A HIT.</span><h2 id="result-title">GOAL!</h2><p id="result-description">Right where you wanted it.</p><div class="result-meta"><span id="result-distance"></span><span></span><span id="result-speed"></span></div></div>
              <div class="replay-label" id="replay-label" hidden><span></span> INSTANT REPLAY <b>0.55×</b></div>

        <div class="camera-rail"><button id="camera-button" aria-label="Switch to broadcast camera" title="Switch camera (V)">${icon('Focus')}</button><span id="atmosphere-label">FLOODLIT NIGHT</span><span id="performance" hidden></span></div>
        <div class="hud-bottom">
          <button class="taker-hud" id="taker-button" aria-label="Choose free-kick taker">${takerHud(getPlayer(this.settings.playerId))}</button>
          <section class="contact-section" aria-label="Shape your shot">
                              <div class="contact-pad" id="contact-pad" role="slider" tabindex="0" aria-label="Ball contact point. Arrow keys change spin and lift." aria-valuemin="-100" aria-valuemax="100" aria-valuenow="-43" aria-valuetext="Inside-foot curl">
                    <svg class="contact-ball" viewBox="0 0 120 120" aria-hidden="true"><defs><radialGradient id="ball-light" cx="34%" cy="25%" r="80%"><stop offset="0" stop-color="#fbfbef"/><stop offset=".65" stop-color="#d6dece"/><stop offset="1" stop-color="#8e9d88"/></radialGradient><clipPath id="ball-clip"><circle cx="60" cy="60" r="49"/></clipPath></defs><circle cx="60" cy="60" r="54" fill="none" stroke="#536143" stroke-dasharray="2 5"/><circle cx="60" cy="60" r="49" fill="url(#ball-light)"/><g clip-path="url(#ball-clip)" fill="#30453b" stroke="#53634e" stroke-width="1.3"><path d="m60 39 20 15-8 24H48l-8-24Z"/><path d="m27 17 6 19-19 15-17-9 7-24Z"/><path d="m91 17-4 19 19 15 17-9-7-24Z"/><path d="m17 87 20-3 11 22-14 16-20-8Z"/><path d="m103 87-20-3-11 22 14 16 20-8Z"/></g><g stroke="#899780" stroke-width="1" fill="none"><path d="m60 39 0-23m20 38 7-18M40 54l-7-18m15 42-11 6m35-6 11 6M33 36l27-20 27 20M14 51l3 36m89-36-3 36m-55 19h24"/></g><path d="M60 5v110M5 60h110" stroke="#192b1d" opacity=".3" stroke-dasharray="2 3"/></svg>
                    <span class="contact-marker" id="contact-marker"></span>
                  </div>

            <div class="contact-copy"><span class="hud-eyebrow">BALL CONTACT</span><h3 id="strike-name">Inside-foot curl</h3><span class="contact-instruction">Move the point. Shape the flight.</span><div class="strike-presets" aria-label="Shot technique presets"><button data-strike="curl" aria-pressed="true">CURL</button><button data-strike="knuckle" aria-pressed="false">KNUCKLE</button><button data-strike="driven" aria-pressed="false">DRIVEN</button></div></div>
          </section>
          <section class="power-section" aria-label="Shot power"><div class="power-heading"><span class="hud-eyebrow">SHOT POWER</span><span id="stage-foot">RIGHT FOOT</span></div>
                            <div class="power-readout"><strong><span id="power-value">0</span><small>%</small></strong><span id="power-tip">SUGGESTED <b id="recommended-power">63%</b>${icon('ArrowDownLeft')}</span></div>
                <div class="power-meter" id="power-meter" role="progressbar" aria-label="Shot power" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="power-fill" id="power-fill"></div><div class="power-sweetspot" id="power-sweetspot"></div><span class="meter-tick t1"></span><span class="meter-tick t2"></span><span class="meter-tick t3"></span></div>
                <div class="meter-caption"><span>PLACEMENT</span><span>POWER</span></div>
                <div class="shot-actions"><button class="shoot-button" id="shoot-button" disabled><span class="shoot-icon">${icon('ArrowUpRight')}</span><span class="shoot-copy"><strong id="shoot-label">HOLD TO SHOOT</strong><small id="shoot-caption">Release to strike</small></span><span class="shoot-arrow">${icon('ArrowRight')}</span></button><button class="replay-button" id="replay-button" disabled aria-label="Replay last shot (R)" title="Replay last shot (R)">${icon('RotateCcw')}</button></div>

          </section>
        </div>
        <div class="hud-footer"><div id="drag-hint">${icon('Move')} DRAG TO AIM <span>OR USE ARROW KEYS</span></div><span id="aim-readout">AIM 1.9 / 1.9</span><span class="footer-controls"><kbd>SPACE</kbd> HOLD & RELEASE <i>·</i> <kbd>R</kbd> REPLAY</span><span class="edition-mark">THE SET-PIECE EDITION <b>2.0</b></span></div>
        <div class="scene-loading" id="scene-loading"><div class="loading-ball">${logo}</div><strong>THE PITCH IS YOURS.</strong><span>PREPARING YOUR ARENA</span><div class="loading-line"></div></div>
      </section>
      <dialog id="setup-drawer" class="setup-drawer" aria-labelledby="setup-title">
        <div class="drawer-header"><span class="modal-eyebrow">YOUR GAME. YOUR RULES.</span><h2 id="setup-title">Training setup</h2><button id="close-settings" class="icon-button" aria-label="Close settings">${icon('X')}</button></div>
        <div class="drawer-tabs" role="tablist" aria-label="Settings section"><button role="tab" data-settings-tab="training" aria-selected="true" aria-controls="training-settings">PITCH & KEEPER</button><button role="tab" data-settings-tab="graphics" aria-selected="false" aria-controls="graphics-settings">VISUALS & SOUND</button></div>
        <div class="drawer-scroll">
          <div id="training-settings" role="tabpanel" class="setup-column">
                        <section class="panel position-panel">
              <div class="panel-heading"><h2>${icon('MousePointer2')} Set your spot</h2><span class="panel-kicker">THE SETUP</span></div>
              <p class="panel-description">Every angle. A different challenge.</p>
              <div class="pitch-map" id="pitch-map" role="slider" tabindex="0" aria-label="Free-kick position. Click to place, or use arrow keys." aria-valuemin="10" aria-valuemax="55" aria-valuenow="25" aria-valuetext="24.7 metres, left of centre">
                <svg viewBox="0 0 300 188" aria-hidden="true"><defs><pattern id="pitch-stripes" width="300" height="42" patternUnits="userSpaceOnUse"><rect width="300" height="21" fill="#263d2c"/><rect y="21" width="300" height="21" fill="#2a4230"/></pattern><pattern id="restricted-zone" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line y2="5" stroke="#9db68e" stroke-width="1" opacity=".13"/></pattern></defs><rect x="0" y="0" width="300" height="188" rx="7" fill="url(#pitch-stripes)"/><g fill="none" stroke="#839577" stroke-width="1.1" opacity=".6"><path d="M21 187V19H279V187"/><path d="M73.5 19v55.3h153V19M115.2 19v18.4h69.6V19"/><path d="M122 74.3a34.5 34.5 0 0 0 56 0"/><circle cx="150" cy="55.8" r="1.5" fill="#839577"/><path d="M21 19a7 7 0 0 0 7 7M279 19a7 7 0 0 1-7 7"/><path d="M135.8 19V12h28.4v7" stroke="#d6e5c7" stroke-width="2"/></g><rect x="73.5" y="20" width="153" height="54.3" fill="url(#restricted-zone)"/><path id="map-aimline" d="M127 108 150 19" fill="none" stroke="#c3f58d" stroke-width="1" stroke-dasharray="3 4" opacity=".55"/><g id="map-marker"><circle r="14" fill="#c2f970" opacity=".1"/><circle r="8.5" fill="none" stroke="#c2f970" opacity=".5"/><circle r="4" fill="#c2f970"/><path d="M0-16v-4M0 16v4M-16 0h-4M16 0h4" stroke="#c2f970"/></g><text x="150" y="176" text-anchor="middle" fill="#b1c29d" font-size="8" font-family="Manrope, sans-serif" letter-spacing="1.6">TAP ANYWHERE TO PLACE</text></svg>
              </div>
              <div class="distance-row"><label for="distance-slider">Distance to goal</label><strong id="distance-value">24.7 <span>m</span></strong></div>
              <input class="range-slider" type="range" id="distance-slider" min="17.5" max="55" step="0.1" value="24.5" aria-label="Distance to goal in metres" />
              <div class="range-labels"><span id="min-distance-label">18 m</span><span id="max-distance-label">46 m</span></div>
              <div class="spot-presets"><button data-spot="left">Left flank</button><button data-spot="central">Central</button><button data-spot="right">Right flank</button></div>
            </section>

            <section class="panel keeper-panel">
              <div class="panel-heading"><h2>${icon('Shield')} The goalkeeper</h2><span class="difficulty-level" id="difficulty-level">LVL 03</span></div>
              <div class="difficulty-name"><strong id="difficulty-name">Professional</strong><span class="difficulty-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div>
              <div class="difficulty-selector" aria-label="Goalkeeper difficulty">${DIFFICULTIES.map((d, i) => `<button data-difficulty="${d}" aria-label="${KEEPER_PROFILES[d].label} goalkeeper" title="${KEEPER_PROFILES[d].label}" aria-pressed="${d === 'pro'}"><span>${i + 1}</span></button>`).join('')}</div>
              <div class="range-labels difficulty-labels"><span>ROOKIE</span><span>LEGEND</span></div>
              <p class="keeper-description" id="keeper-description">Quick reactions. You’ll need a little precision.</p>
              <div class="wall-row"><span>${icon('Shield')} Defensive wall</span><div class="stepper"><button id="wall-minus" aria-label="Remove a defender">${icon('Minus')}</button><span id="wall-count">4</span><button id="wall-plus" aria-label="Add a defender">${icon('Plus')}</button></div></div>
            </section>


            <section class="panel foot-panel"><div class="panel-heading"><h2>Training foot</h2><span class="panel-kicker">SWITCH IT UP</span></div><div class="foot-toggle"><button data-foot="right" aria-pressed="true">R <span>Right foot</span></button><button data-foot="left" aria-pressed="false">L <span>Left foot</span></button></div></section>
            <section class="panel session-panel"><div class="panel-heading"><h2>Session record</h2><button id="reset-session" class="icon-button" aria-label="Reset session statistics">${icon('RotateCcw')}</button></div><div class="session-bottom"><div id="shot-history" class="shot-history">${'<i></i>'.repeat(10)}</div><strong id="stat-rate">—<small>%</small></strong></div></section>
          </div>
          <div id="graphics-settings" role="tabpanel" hidden>
            <div class="settings-list">
              <label class="setting-row quality-setting"><span><strong>Graphics quality</strong><small>Shadow detail, grass density, and pixel resolution</small></span><select id="setting-quality" aria-label="Graphics quality"><option value="high">High</option><option value="balanced">Balanced</option><option value="low">Performance</option></select></label>
              <label class="setting-row quality-setting"><span><strong>Stadium atmosphere</strong><small>A new light on the beautiful game</small></span><select id="setting-atmosphere" aria-label="Stadium atmosphere"><option value="night">Floodlit night</option><option value="sunset">Golden hour</option><option value="day">Clear day</option></select></label>
              ${[['adaptiveResolution', 'Adaptive resolution', 'Temporarily lowers pixel resolution when rendering is slow.'], ['guides', 'Trajectory guide', 'Preview the actual spin, power, and player attributes.'], ['showFps', 'Performance monitor', 'Live frame rate, draw calls, and render resolution.'], ['sound', 'Stadium sound', 'Crowd ambience, ball strikes, and the sound of the net.'], ['haptics', 'Haptic feedback', 'Feel each strike on supported Android devices.']].map(([key, title, detail]) => `<label class="setting-row"><span><strong>${title}</strong><small>${detail}</small></span><input type="checkbox" id="setting-${key}"/><span class="toggle" aria-hidden="true"></span></label>`).join('')}
            </div>
            <p class="settings-note">High: 2048 px shadows. Balanced: 1024 px shadows. Performance: no dynamic shadows. Stadium geometry is batched and shot trails reuse GPU buffers in every mode.</p>
            <button id="photo-credits" class="text-link">Player photo credits & licenses ${icon('ArrowUpRight')}</button>
          </div>
        </div>
        <div class="drawer-footer"><div><button id="settings-help" class="text-link">${icon('HelpCircle')} HOW TO PLAY</button><button id="android-button" class="text-link">${icon('Smartphone')} ANDROID APK</button></div><button class="primary-button full-width" id="resume-button">BACK TO THE PITCH ${icon('Play')}</button></div>
      </dialog>
      <dialog class="modal" id="modal" aria-labelledby="modal-title"><div class="modal-inner" id="modal-content"></div></dialog>
      <div class="toast" id="toast" role="status" hidden></div>
    </main>`;
  }

  private bindUI() {
    $('#brand-home').addEventListener('click', () => this.returnToTraining());
    $('#training-tab').addEventListener('click', () => this.returnToTraining());
    $('#challenges-tab').addEventListener('click', () => this.showChallenges());
    $('#help-button').addEventListener('click', () => this.showHelp());
    $('#settings-button').addEventListener('click', () => this.showSettings());
    $('#position-button').addEventListener('click', () => this.showSettings());
    $('#keeper-button').addEventListener('click', () => this.showSettings());
    $('#taker-button').addEventListener('click', () => this.showPlayers());
    $('#close-settings').addEventListener('click', () => this.closeDrawer());
    $('#resume-button').addEventListener('click', () => this.closeDrawer());
    $('#settings-help').addEventListener('click', () => this.showHelp());
    $('#photo-credits').addEventListener('click', () => this.showPhotoCredits());
    $$('[data-settings-tab]').forEach(button => button.addEventListener('click', () => this.settingsTab(button.dataset.settingsTab!)));
    for (const key of ['sound', 'guides', 'haptics', 'adaptiveResolution', 'showFps'] as const) {
      $(`#setting-${key}`).addEventListener('change', event => {
        this.settings[key] = (event.target as HTMLInputElement).checked;
        if (key === 'sound') this.audio.setEnabled(this.settings.sound);
        this.applySettings();
      });
    }
    $('#setting-quality').addEventListener('change', event => {
      this.settings.quality = (event.target as HTMLSelectElement).value as Settings['quality'];
      this.applySettings();
    });
    $('#setting-atmosphere').addEventListener('change', event => {
      this.settings.atmosphere = (event.target as HTMLSelectElement).value as Settings['atmosphere'];
      this.applySettings();
    });
    const drawer = $<HTMLDialogElement>('#setup-drawer');
    drawer.addEventListener('click', event => { if (event.target === drawer) this.closeDrawer(); });
    drawer.addEventListener('cancel', event => { event.preventDefault(); this.closeDrawer(); });
    drawer.addEventListener('close', () => this.resumeIfVisible());
    $('#android-button').addEventListener('click', () => this.showAndroid());
    $('#sound-button').addEventListener('click', () => {
      this.settings.sound = !this.settings.sound;
      this.audio.setEnabled(this.settings.sound);
      this.syncSound();
      saveSettings(this.settings);
      this.toast(this.settings.sound ? 'Sound on. Listen for the net.' : 'Sound muted. Stay in the zone.');
    });
    $('#camera-button').addEventListener('click', () => {
      const mode = this.arena?.toggleCamera();
      $('#camera-button').setAttribute('aria-label', `Switch to ${mode === 'player' ? 'broadcast' : 'player'} camera`);
      this.toast(mode === 'player' ? 'Player camera' : 'Broadcast camera');
    });
    $('#fullscreen-button').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch { this.toast('Fullscreen is not available in this viewer. Open the game in its own tab.'); }
    });
    document.addEventListener('fullscreenchange', () => $('#fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'));
    this.bindContactPad();
    this.bindPitchMap();
    $$<HTMLButtonElement>('[data-foot]').forEach(button => button.addEventListener('click', () => {
      if (!this.canSetup()) return;
      const foot = button.dataset.foot as 'left' | 'right';
      if (foot !== this.settings.foot) this.settings.contact.x *= -1;
      this.settings.foot = foot;
      this.applySettings();
    }));
    $$<HTMLButtonElement>('[data-strike]').forEach(button => button.addEventListener('click', () => {
      if (!this.canSetup()) return;
      const side = this.settings.foot === 'right' ? -1 : 1;
      this.settings.contact = button.dataset.strike === 'curl' ? { x: side * 0.53, y: 0.06 } : button.dataset.strike === 'knuckle' ? { x: 0, y: 0 } : { x: 0.04, y: 0.75 };
      this.applySettings();
      if (button.dataset.strike === 'knuckle') this.toast('Keep the contact central. Use over 64% power for the knuckleball wake.');
      if (button.dataset.strike === 'driven') this.toast('A low, fast strike. Aim around the wall, not through it.');
    }));
    $$<HTMLButtonElement>('[data-spot]').forEach(button => button.addEventListener('click', () => {
      if (!this.canSetup() || this.challenge) return;
      const x = button.dataset.spot === 'left' ? -10 : button.dataset.spot === 'right' ? 10 : 0;
      this.settings.position = { x, z: 24 };
      this.applySettings();
    }));
    $('#distance-slider').addEventListener('input', event => {
      if (!this.canSetup() || this.challenge) return;
      const distance = Number((event.target as HTMLInputElement).value);
      const angle = Math.atan2(this.settings.position.x, this.settings.position.z);
      this.settings.position = constrainPosition({ x: Math.sin(angle) * distance, z: Math.cos(angle) * distance });
      this.applySettings();
    });
    $$<HTMLButtonElement>('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
      if (!this.canSetup() || this.challenge) return;
      this.settings.difficulty = button.dataset.difficulty as Difficulty;
      this.applySettings();
    }));
    for (const [id, delta] of [['wall-minus', -1], ['wall-plus', 1]] as const) {
      $(`#${id}`).addEventListener('click', () => {
        if (!this.canSetup() || this.challenge) return;
        this.settings.wall = clamp(this.settings.wall + delta, 0, 5);
        this.applySettings();
      });
    }
    const shoot = $('#shoot-button');
    shoot.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      if (this.currentPhase === 'result') { this.nextKick(); return; }
      if (this.startCharge()) {
        this.powerPointer = event.pointerId;
        shoot.setPointerCapture(event.pointerId);
      }
    });
    shoot.addEventListener('pointerup', event => {
      if (this.powerPointer !== event.pointerId) return;
      this.powerPointer = null;
      this.arena?.release();
    });
    shoot.addEventListener('pointercancel', () => { this.powerPointer = null; this.arena?.cancelCharge(); });
    shoot.addEventListener('lostpointercapture', () => {
      if (this.powerPointer !== null) { this.powerPointer = null; this.arena?.cancelCharge(); }
    });
    // Enter / assistive-technology activation offers tap-to-start, tap-to-release as well as hold.
    shoot.addEventListener('click', event => {
      if (event.detail !== 0) return;
      if (this.currentPhase === 'result') this.nextKick();
      else if (this.currentPhase === 'charging') this.arena?.release();
      else this.startCharge();
    });
    $('#replay-button').addEventListener('click', () => this.arena?.replay());
    $('#reset-session').addEventListener('click', () => this.showReset());
    this.bindKeyboard();
    const modal = $<HTMLDialogElement>('#modal');
    modal.addEventListener('click', event => { if (event.target === modal) this.closeModal(); });
    modal.addEventListener('cancel', event => { event.preventDefault(); this.closeModal(); });
    modal.addEventListener('close', () => {
      this.resumeIfVisible();
      const focus = this.modalReturnFocus?.getClientRects().length ? this.modalReturnFocus : $('#settings-button');
      if (!this.overlayOpen()) focus?.focus({ preventScroll: true });
    });
    document.addEventListener('visibilitychange', () => this.setVisible(!document.hidden));
    window.addEventListener('blur', () => { this.powerPointer = null; this.arena?.cancelCharge(); });
    document.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    const paused = !visible || this.overlayOpen();
    this.arena?.setPaused(paused);
    if (paused) this.audio.pause(); else this.audio.resume();
  }

  handleBack() {
    if ($<HTMLDialogElement>('#modal').open) this.closeModal();
    else if ($<HTMLDialogElement>('#setup-drawer').open) this.closeDrawer();
    else this.showSettings();
  }

  private bindKeyboard() {
    document.addEventListener('keydown', event => {
      if (this.overlayOpen()) return;
      if ((event.target as HTMLElement).closest('input, select, textarea, [role="slider"]')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.repeat) return;
        if (this.currentPhase === 'result') this.nextKick(); else this.startCharge();
      } else if (event.code.startsWith('Arrow')) {
        event.preventDefault();
        const amount = event.shiftKey ? 0.3 : 0.12;
        this.arena?.adjustAim(event.code === 'ArrowLeft' ? -amount : event.code === 'ArrowRight' ? amount : 0, event.code === 'ArrowUp' ? amount : event.code === 'ArrowDown' ? -amount : 0);
      } else if (event.code === 'KeyR' && !event.repeat) this.arena?.replay();
      else if (event.code === 'KeyV' && !event.repeat) $('#camera-button').click();
      else if (event.code === 'KeyT' && !event.repeat) this.showPlayers();
      else if (event.code === 'Escape') this.showSettings();
    });
    document.addEventListener('keyup', event => {
      if (event.code === 'Space' && this.currentPhase === 'charging') {
        event.preventDefault();
        this.arena?.release();
      }
    });
  }

  private bindContactPad() {
    const pad = $('#contact-pad');
    let pointer: number | null = null;
    const change = (x: number, y: number) => {
      const radius = Math.hypot(x, y);
      this.settings.contact = { x: x / Math.max(1, radius), y: y / Math.max(1, radius) };
      this.applySettings();
    };
    const fromPointer = (event: PointerEvent) => {
      const rect = pad.getBoundingClientRect();
      change((event.clientX - rect.left - rect.width / 2) / (rect.width * 0.4), (rect.height / 2 - event.clientY + rect.top) / (rect.height * 0.4));
    };
    pad.addEventListener('pointerdown', event => {
      if (!this.canSetup() || !event.isPrimary) return;
      event.preventDefault();
      pointer = event.pointerId;
      pad.setPointerCapture(pointer);
      fromPointer(event);
    });
    pad.addEventListener('pointermove', event => { if (event.pointerId === pointer) fromPointer(event); });
    pad.addEventListener('pointerup', () => pointer = null);
    pad.addEventListener('pointercancel', () => pointer = null);
    pad.addEventListener('keydown', event => {
      if (!this.canSetup() || !event.code.startsWith('Arrow')) return;
      event.preventDefault();
      const c = this.settings.contact;
      change(c.x + (event.code === 'ArrowLeft' ? -0.07 : event.code === 'ArrowRight' ? 0.07 : 0), c.y + (event.code === 'ArrowUp' ? 0.07 : event.code === 'ArrowDown' ? -0.07 : 0));
    });
  }

  private bindPitchMap() {
    const map = $('#pitch-map');
    let pointer: number | null = null;
    const fromPointer = (event: PointerEvent) => {
      const rect = map.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width * 300;
      const y = (event.clientY - rect.top) / rect.height * 188;
      this.settings.position = constrainPosition({ x: (x - 150) / 129 * 34, z: (y - 19) / 3.35 });
      this.applySettings();
    };
    map.addEventListener('pointerdown', event => {
      if (!this.canSetup() || this.challenge || !event.isPrimary) return;
      event.preventDefault();
      pointer = event.pointerId;
      map.setPointerCapture(pointer);
      fromPointer(event);
    });
    map.addEventListener('pointermove', event => { if (event.pointerId === pointer) fromPointer(event); });
    map.addEventListener('pointerup', () => pointer = null);
    map.addEventListener('pointercancel', () => pointer = null);
    map.addEventListener('keydown', event => {
      if (!this.canSetup() || this.challenge || !event.code.startsWith('Arrow')) return;
      event.preventDefault();
      const p = this.settings.position;
      this.settings.position = constrainPosition({ x: p.x + (event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : 0), z: p.z + (event.code === 'ArrowUp' ? -1 : event.code === 'ArrowDown' ? 1 : 0) });
      this.applySettings();
    });
  }

  private canSetup() { return this.currentPhase === 'ready' || this.currentPhase === 'result'; }
  private applySettings() {
    this.arena?.updateSettings(this.settings);
    this.syncUI();
    saveSettings(this.settings);
  }

  private syncUI() {
    const s = this.settings;
    if ($('#taker-button').dataset.player !== s.playerId) {
      $('#taker-button').innerHTML = takerHud(getPlayer(s.playerId));
      $('#taker-button').dataset.player = s.playerId;
    }
    $('#keeper-hud').textContent = `${KEEPER_PROFILES[s.difficulty].label.toUpperCase()} · ${s.wall ? `${s.wall}-MAN WALL` : 'NO WALL'}`;
    $('#atmosphere-label').textContent = { night: 'FLOODLIT NIGHT', sunset: 'GOLDEN HOUR', day: 'CLEAR DAY' }[s.atmosphere];
    $('#performance').hidden = !s.showFps;
    $<HTMLSelectElement>('#setting-quality').value = s.quality;
    $<HTMLSelectElement>('#setting-atmosphere').value = s.atmosphere;
    for (const key of ['sound', 'guides', 'haptics', 'adaptiveResolution', 'showFps'] as const) $<HTMLInputElement>(`#setting-${key}`).checked = s[key];
    const distance = distanceToGoal(s.position);
    $('#distance-value').innerHTML = `${distance.toFixed(1)} <span>m</span>`;
    $('#stage-distance').innerHTML = `${distance.toFixed(1)}<span>m</span>`;
    $('#stage-foot').textContent = s.foot === 'right' ? 'RIGHT FOOT' : 'LEFT FOOT';
    const slider = $<HTMLInputElement>('#distance-slider');
    const bounds = distanceBounds(s.position);
    slider.min = bounds.min.toFixed(2);
    slider.max = bounds.max.toFixed(2);
    slider.value = String(distance);
    slider.setAttribute('aria-valuetext', `${distance.toFixed(1)} metres. Range depends on the selected angle.`);
    slider.style.setProperty('--range-progress', `${clamp((distance - bounds.min) / (bounds.max - bounds.min) * 100, 0, 100)}%`);
    $('#min-distance-label').textContent = `${bounds.min.toFixed(1)} m`;
    $('#max-distance-label').textContent = `${bounds.max.toFixed(1)} m`;
    const mapX = 150 + s.position.x / 34 * 129;
    const mapY = 19 + s.position.z * 3.35;
    document.querySelector('#map-marker')!.setAttribute('transform', `translate(${mapX} ${mapY})`);
    document.querySelector('#map-aimline')!.setAttribute('d', `M${mapX} ${mapY}L150 19`);
    $('#pitch-map').setAttribute('aria-valuenow', distance.toFixed(1));
    $('#pitch-map').setAttribute('aria-valuetext', `${distance.toFixed(1)} metres, ${Math.abs(s.position.x) < 1 ? 'central' : s.position.x < 0 ? 'left' : 'right'}`);
    $$('[data-spot]').forEach(button => button.classList.toggle('selected', button.dataset.spot === (s.position.x < -8 ? 'left' : s.position.x > 8 ? 'right' : Math.abs(s.position.x) < 1 ? 'central' : 'none')));
    this.syncContact();
    const profile = KEEPER_PROFILES[s.difficulty];
    const level = DIFFICULTIES.indexOf(s.difficulty);
    $('#difficulty-name').textContent = profile.label;
    $('#difficulty-level').textContent = `LVL 0${level + 1}`;
    $('#keeper-description').textContent = profile.description;
    $$('[data-difficulty]').forEach((button, i) => {
      button.classList.toggle('filled', i <= level);
      button.classList.toggle('selected', i === level);
      button.setAttribute('aria-pressed', String(i === level));
    });
    $$('.difficulty-dots i').forEach((dot, i) => dot.classList.toggle('filled', i <= level));
    $('#wall-count').textContent = String(s.wall);
    const power = recommendedPower(s.position);
    $('#recommended-power').textContent = `${Math.round(power * 100)}%`;
    $('#power-sweetspot').style.left = `${power * 100 - 3}%`;
    this.syncSound();
    this.updateAimReadout();
    this.updateDisabled();
  }

  private syncContact() {
    const s = this.settings;
    $('#contact-marker').style.left = `${50 + s.contact.x * 40}%`;
    $('#contact-marker').style.top = `${50 - s.contact.y * 40}%`;
    const name = strikeName(s.contact, s.foot);
    $('#strike-name').textContent = name;
    $('#contact-pad').setAttribute('aria-valuenow', String(Math.round(s.contact.x * 100)));
    $('#contact-pad').setAttribute('aria-valuetext', `${name}. Horizontal contact ${Math.round(s.contact.x * 100)} percent, vertical ${Math.round(s.contact.y * 100)} percent.`);
    $$('[data-foot]').forEach(button => {
      const selected = button.dataset.foot === s.foot;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $$('[data-strike]').forEach(button => {
      const selected = button.dataset.strike === (name.includes('curl') ? 'curl' : name === 'Knuckleball' ? 'knuckle' : name === 'Low driven' ? 'driven' : '');
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  private syncSound() {
    $('#sound-button').innerHTML = icon(this.settings.sound ? 'Volume2' : 'VolumeX');
    $('#sound-button').setAttribute('aria-label', this.settings.sound ? 'Mute sound' : 'Enable sound');
    $('#sound-button').classList.toggle('muted', !this.settings.sound);
    drawIcons();
  }
  private updateAimReadout() {
    $('#aim-readout').textContent = `AIM ${this.settings.aim.x.toFixed(1)} / ${this.settings.aim.y.toFixed(1)} m`;
  }

  private updateDisabled() {
    const locked = !this.canSetup();
    $<HTMLButtonElement>('#taker-button').disabled = locked;
    $$<HTMLButtonElement>('[data-foot], [data-strike]').forEach(button => button.disabled = locked);
    $$<HTMLButtonElement>('[data-spot], [data-difficulty]').forEach(button => button.disabled = locked || !!this.challenge);
    $<HTMLInputElement>('#distance-slider').disabled = locked || !!this.challenge;
    $<HTMLButtonElement>('#wall-minus').disabled = locked || !!this.challenge || this.settings.wall === 0;
    $<HTMLButtonElement>('#wall-plus').disabled = locked || !!this.challenge || this.settings.wall === 5;
    $('#pitch-map').classList.toggle('locked', locked || !!this.challenge);
    $('#pitch-map').setAttribute('aria-disabled', String(locked || !!this.challenge));
    $('#contact-pad').setAttribute('aria-disabled', String(locked));
    $<HTMLButtonElement>('#reset-session').disabled = locked;
  }

  private startCharge(): boolean {
    this.audio.unlock();
    const started = this.arena?.charge() || false;
    if (started) this.haptic('impact');
    return started;
  }

  private onPhase(phase: Phase) {
    this.currentPhase = phase;
    const active = phase === 'runup' || phase === 'flight' || phase === 'replay';
    $<HTMLButtonElement>('#shoot-button').disabled = active || !this.arena;
    $('#shoot-button').classList.toggle('charging', phase === 'charging');
    $('#shoot-button').classList.toggle('next-kick', phase === 'result');
    const labels: Record<Phase, [string, string]> = {
      ready: ['HOLD TO SHOOT', 'Release to strike'], charging: ['RELEASE TO STRIKE', 'Find your sweet spot'],
      runup: ['MAKE IT COUNT.', 'Eyes on the ball'], flight: ['ON ITS WAY…', 'Watch the flight'],
      result: [this.challenge?.attempts === 5 ? 'VIEW RESULTS' : 'NEXT FREE KICK', 'Another chance. A better finish.'], replay: ['INSTANT REPLAY', 'A different perspective'],
    };
    $('#shoot-label').textContent = labels[phase][0];
    $('#shoot-caption').textContent = labels[phase][1];
    $<HTMLButtonElement>('#replay-button').disabled = phase !== 'result';
    $('#shot-result').hidden = phase !== 'result';
    $('#replay-label').hidden = phase !== 'replay';
    $('#drag-hint').hidden = phase !== 'ready';
    $('#scene-message').hidden = phase !== 'charging' && phase !== 'runup';
    $('#scene-message-label').textContent = phase === 'charging' ? 'HOLD. BUILD. RELEASE.' : 'THE MOMENT IS YOURS';
    $('#scene-message-title').textContent = phase === 'charging' ? 'Find your power.' : 'Make it count.';
    $('#app').setAttribute('data-phase', phase);
    if (phase === 'flight') { this.audio.kick(); this.haptic('impact'); }
    if (phase === 'ready') this.onPower(0);
    this.updateDisabled();
  }

  private onPower(power: number) {
    const percent = Math.round(power * 100);
    $('#power-value').textContent = String(percent);
    $('#power-fill').style.width = `${percent}%`;
    $('#power-meter').setAttribute('aria-valuenow', String(percent));
    $('#power-meter').classList.toggle('overpowered', power > 0.85);
  }

  private onResult(result: ShotResult) {
    recordShot(this.session, result);
    this.audio.result(result.outcome === 'goal', result.outcome === 'post');
    if (result.outcome === 'goal') this.haptic('success');
    const topBins = result.outcome === 'goal' && Math.abs(result.point.x) >= 2.36 && result.point.y >= 1.6;
    const copy = {
      goal: [topBins ? 'ABSOLUTELY UNSAVEABLE.' : 'THAT’S HOW IT’S DONE.', topBins ? 'TOP BINS!' : 'WHAT A GOAL!', 'A little technique. A lot of satisfaction.'],
      saved: ['A STRONG HAND.', 'DENIED.', 'Find the other corner. Give it a little more curve.'],
      wall: ['THE WALL HOLDS.', 'BLOCKED.', 'Try a wider aim, more lift, or a different contact point.'],
      post: ['INCHES IN IT.', 'WOODWORK.', 'So close. A small adjustment makes all the difference.'],
      wide: ['JUST OFF TARGET.', 'WIDE.', 'Bring your aim inside or ease off the sidespin.'],
      over: ['A LITTLE TOO MUCH.', 'OVER THE BAR.', 'Lower your aim or release the power a little earlier.'],
      short: ['NOT QUITE THERE.', 'NEEDS MORE.', 'Build a little more power for this distance.'],
    }[result.outcome];
    $('#result-eyebrow').textContent = copy[0];
    $('#result-title').textContent = copy[1];
    $('#result-description').textContent = copy[2];
    $('#result-distance').textContent = `${result.distance.toFixed(1)} M`;
    $('#result-speed').textContent = `${Math.round(result.speed)} KM/H`;
    $('#shot-result').classList.toggle('is-goal', result.outcome === 'goal');
    if (this.challenge) {
      const hit = this.challenge.definition.accepts(result);
      this.challenge.attempts++;
      this.challenge.hits += Number(hit);
      this.challenge.results.push(hit);
      this.updateMode();
      if (this.challenge.attempts === 5) {
        $('#shoot-label').textContent = 'VIEW RESULTS';
        $('#shoot-caption').textContent = `${this.challenge.hits} of 5 targets completed`;
        this.saveChallengeBest();
      }
    }
    this.syncStats();
  }

  private syncStats() {
    const s = this.session;
    $('#stat-goals').textContent = String(s.goals);
    $('#stat-attempts').textContent = String(s.attempts);
    $('#stat-rate').innerHTML = `${s.attempts ? Math.round(s.goals / s.attempts * 100) : '—'}<small>%</small>`;
    const last = s.history.slice(-10);
    $('#shot-history').innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${last[i] ? last[i].outcome === 'goal' ? 'goal' : 'miss' : ''}" title="${last[i] ? last[i].outcome : 'Not taken'}"></i>`).join('');
    $('#shot-history').setAttribute('aria-label', `Last ${last.length} shots: ${last.map(shot => shot.outcome).join(', ') || 'none yet'}`);
    $('#streak-label b').textContent = String(s.streak);
  }

  private nextKick() {
    if (!this.arena || this.currentPhase !== 'result') return;
    if (this.challenge?.attempts === 5) { this.showChallengeResult(); return; }
    if (this.challenge) {
      this.settings.position = this.challenge.definition.positions[this.challenge.attempts];
      this.arena.reset();
      this.applySettings();
      this.updateMode();
    } else this.arena.reset();
  }

  private updateMode() {
    const active = !!this.challenge;
    $('#training-tab').classList.toggle('active', !active);
    $('#training-tab').setAttribute('aria-pressed', String(!active));
    $('#challenges-tab').classList.toggle('active', active);
    $('#challenges-tab').setAttribute('aria-pressed', String(active));
    $('#mode-pill').innerHTML = active ? `${icon('Trophy')} ${this.challenge!.definition.title.replace('.', '').toUpperCase()} <b>${Math.min(5, this.challenge!.attempts + 1)}/5</b>` : '<span class="status-dot"></span> FREE PRACTICE';
    drawIcons();
    this.updateDisabled();
  }

  private returnToTraining() {
    if (!this.challenge) { this.toast('Your training ground. Take as many kicks as you like.'); return; }
    if (this.currentPhase === 'flight' || this.currentPhase === 'runup' || this.currentPhase === 'replay') { this.toast('Let this kick finish first.'); return; }
    this.challenge = null;
    if (this.practiceSettings) this.settings = structuredClone(this.practiceSettings);
    this.practiceSettings = null;
    this.arena?.reset();
    this.applySettings();
    this.updateMode();
    this.closeModal();
    this.toast('Back to free practice. No limits.');
  }

  private openModal(content: string, className = '') {
    $<HTMLDialogElement>('#setup-drawer').close();
    const modal = $<HTMLDialogElement>('#modal');
    if (!modal.open) this.modalReturnFocus = document.activeElement as HTMLElement;
    modal.className = `modal ${className}`;
    $('#modal-content').innerHTML = `<button class="modal-close icon-button" data-close aria-label="Close dialog">${icon('X')}</button>${content}`;
    this.arena?.setPaused(true);
    this.audio.pause();
    if (!modal.open) modal.showModal();
    $('[data-close]').addEventListener('click', () => this.closeModal());
    drawIcons();
  }
  private closeModal() {
    $<HTMLDialogElement>('#modal').close();
    // The native `close` event is queued. Resume synchronously so an immediate
    // Space press after selecting a challenge is not lost while still paused.
    this.resumeIfVisible();
  }

  private showHelp() {
    this.openModal(`<span class="modal-eyebrow">A GAME OF SMALL ADJUSTMENTS</span><h2 id="modal-title">Own the dead ball.</h2><p class="modal-intro">The goal is simple. The perfect free kick takes a little practice.</p>
      <div class="help-steps">
        <div><span>01</span><div><h3>Find your angle.</h3><p>Tap the mini pitch to place the ball, then set the distance. Drag the 3D pitch to aim, or tap a point near the goal.</p></div>${icon('MousePointer2')}</div>
        <div><span>02</span><div><h3>Make it bend.</h3><p>Move the contact marker on the ball. Strike its left side to curl right; its right side to curl left. Low contact adds lift. High contact drives it down.</p></div>${icon('Sparkles')}</div>
        <div><span>03</span><div><h3>Hold. Then let it fly.</h3><p>Hold the shoot button to build power. Release to strike. The lime mark suggests a starting power, not a guaranteed goal. The guide updates as you charge.</p></div>${icon('Zap')}</div>
      </div><div class="keyboard-guide"><span><kbd>SPACE</kbd> Hold & release</span><span><kbd>↑ ↓ ← →</kbd> Aim</span><span><kbd>R</kbd> Replay</span><span><kbd>V</kbd> Camera</span></div>
      <p class="modal-footnote">Aim sets your launch direction; spin and power change where the ball actually goes. This is an original simulator inspired by the documented EA SPORTS FC control loop, not an EA product or an exact copy of its physics.</p><button class="primary-button full-width" id="help-play">LET’S FIND THE TOP CORNER ${icon('ArrowRight')}</button>`, 'help-modal');
    $('#help-play').addEventListener('click', () => this.closeModal());
  }

  private overlayOpen() { return $<HTMLDialogElement>('#modal').open || $<HTMLDialogElement>('#setup-drawer').open; }
  private resumeIfVisible() {
    const paused = !this.visible || this.overlayOpen();
    this.arena?.setPaused(paused);
    if (paused) this.audio.pause(); else this.audio.resume();
  }
  private settingsTab(tab: string) {
    $$('[data-settings-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.settingsTab === tab)));
    $('#training-settings').hidden = tab !== 'training';
    $('#graphics-settings').hidden = tab !== 'graphics';
  }
  private showSettings() {
    this.settingsTab('training');
    this.syncUI();
    this.arena?.setPaused(true);
    this.audio.pause();
    const drawer = $<HTMLDialogElement>('#setup-drawer');
    if (!drawer.open) drawer.showModal();
  }
  private closeDrawer() {
    $<HTMLDialogElement>('#setup-drawer').close();
    this.resumeIfVisible();
    if (!this.overlayOpen()) $('#settings-button').focus({ preventScroll: true });
  }

  private showPlayers() {
    if (!this.canSetup()) return;
    let selection = this.settings.playerId;
    const selected = getPlayer(selection);
    this.openModal(`<div class="roster-heading"><span class="modal-eyebrow">THE DIFFERENCE IS IN THE DETAILS</span><h2 id="modal-title">Choose your <em>specialist.</em></h2><p>Four players. Four ways to find the top corner.</p><span class="roster-count">04 <small>PLAYERS</small></span></div>
      <div class="roster-toolbar"><label class="player-search-label">${icon('Focus')}<input type="search" id="player-search" placeholder="Search player or nation" aria-label="Search players" autocomplete="off"/></label><div class="roster-filters" aria-label="Filter players by foot"><button data-roster-filter="all" aria-pressed="true">ALL PLAYERS</button><button data-roster-filter="right" aria-pressed="false">RIGHT FOOT</button><button data-roster-filter="left" aria-pressed="false">LEFT FOOT</button></div></div><div id="roster-empty" class="roster-empty" role="status" hidden>No players match. Try another name or nation.</div><div class="player-grid" aria-label="Free-kick takers">${PLAYERS.map(player => playerCard(player, player.id === selection)).join('')}</div>
      <div class="roster-selection"><div><span class="hud-eyebrow">SELECTED PLAYER</span><h3 id="selected-player-name">${selected.name}</h3><p id="selected-player-description">${selected.description}</p></div><button class="primary-button" id="confirm-player">TAKE THE KICK ${icon('ArrowRight')}</button></div>
      <div class="roster-footnote"><span>Original training ratings, not official FC ratings. Real 2026 photographs.</span><button class="text-link" id="roster-credits">PHOTO CREDITS & LICENSES ${icon('ArrowUpRight')}</button></div>`, 'players-modal');
    $$<HTMLButtonElement>('.player-card[data-player]').forEach(button => button.addEventListener('click', () => {
      selection = button.dataset.player!;
      $$('.player-card[data-player]').forEach(card => {
        card.classList.toggle('selected', card.dataset.player === selection);
        card.setAttribute('aria-pressed', String(card.dataset.player === selection));
      });
      const player = getPlayer(selection);
      $('#selected-player-name').textContent = player.name;
      $('#selected-player-description').textContent = player.description;
    }));
    let footFilter = 'all';
    const filterPlayers = () => {
      const query = $<HTMLInputElement>('#player-search').value.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let count = 0;
      $$<HTMLButtonElement>('.player-card[data-player]').forEach(card => {
        const player = getPlayer(card.dataset.player!);
        const text = `${player.name} ${player.nation} ${player.specialty}`.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        card.hidden = !text.includes(query) || (footFilter !== 'all' && player.foot !== footFilter);
        if (!card.hidden) count++;
      });
      $('#roster-empty').hidden = count > 0;
      $('.roster-count').innerHTML = `${String(count).padStart(2, '0')} <small>PLAYERS</small>`;
    };
    $('#player-search').addEventListener('input', filterPlayers);
    $$('[data-roster-filter]').forEach(button => button.addEventListener('click', () => {
      footFilter = button.dataset.rosterFilter!;
      $$('[data-roster-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      filterPlayers();
    }));
    $('#confirm-player').addEventListener('click', () => {
      const player = getPlayer(selection);
      this.settings.playerId = player.id;
      this.settings.foot = player.foot;
      this.settings.contact = { x: player.foot === 'right' ? -0.43 : 0.43, y: 0.02 };
      this.applySettings();
      this.closeModal();
      this.toast(`${player.name}. ${player.specialty}. Your moment.`);
    });
    $('#roster-credits').addEventListener('click', () => this.showPhotoCredits());
  }

  private showPhotoCredits() {
    this.openModal(`<span class="modal-eyebrow">REAL PHOTOGRAPHS. PROPER CREDIT.</span><h2 id="modal-title">Player photography</h2><p class="modal-intro">Photos are bundled locally for offline play. The dates below identify the actual photographs, not a claim of a live photo feed.</p><div class="photo-credit-list">${PLAYERS.map(player => `<article><img src="${player.portrait}" alt="${player.name}" width="64" height="80"/><div><h3>${player.name}</h3><p>${player.photoDate} · ${player.credit}</p><a href="${player.photoSource}" target="_blank" rel="noopener noreferrer">Original photograph ↗</a></div></article>`).join('')}</div><p class="modal-footnote">Photographs by Bryan Berlin / WikiPortraits, licensed <a href="${PHOTO_LICENSE}" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>. Adaptations: portrait crop, soft background masking, resize, and WebP conversion; adapted photos remain CC BY-SA 4.0. Card artwork, training ratings, kits, and 3D avatars are original, not official EA assets. No player, photographer, federation, EA, or FIFA endorsement is implied. Image copyright licenses do not grant athlete publicity or trademark rights for commercial distribution.</p>`, 'credits-modal');
  }

  private showAndroid() {
    this.openModal(`<span class="modal-eyebrow">TAKE THE PITCH WITH YOU</span><h2 id="modal-title">Made for match day.<br>And any other day.</h2><p class="modal-intro">The Android edition runs the same 3D game locally. No connection required once installed.</p><div class="android-feature-list"><span>${icon('Check')} Touch-first aim and power controls</span><span>${icon('Check')} Landscape, fullscreen training</span><span>${icon('Check')} Local preferences and haptic feedback</span></div><div class="android-build-note"><strong>Get the APK</strong><p>Download <b>Free-Kick-Master-debug.apk</b> from the <b>Android APK</b> workflow’s latest successful run in this project’s GitHub Actions. On your phone, allow installation from your browser or file manager when prompted.</p><small>Android 6.0+ with a current Android System WebView and WebGL 2 support. Debug-signed for personal testing; store distribution requires a private release key.</small></div><a class="primary-button full-width" href="https://github.com/RadekParek/Free-kick-Master/actions/workflows/android.yml" target="_blank" rel="noopener noreferrer">OPEN ANDROID BUILDS ${icon('ArrowUpRight')}</a>`, 'android-modal');
  }

  private showReset() {
    this.openModal(`<span class="modal-eyebrow">A CLEAN SLATE</span><h2 id="modal-title">Start fresh?</h2><p class="modal-intro">Reset this session’s goals, attempts, and streak. Your setup and personal best stay saved on this device.</p><div class="modal-button-row"><button class="secondary-button" id="cancel-reset">KEEP PLAYING</button><button class="primary-button" id="confirm-reset">RESET SESSION ${icon('RotateCcw')}</button></div>`);
    $('#cancel-reset').addEventListener('click', () => this.closeModal());
    $('#confirm-reset').addEventListener('click', () => {
      this.session = emptySession();
      this.syncStats();
      this.closeModal();
      this.toast('New session. New possibilities.');
    });
  }

  private showChallenges() {
    this.openModal(`<span class="modal-eyebrow">PUT YOUR PRACTICE TO THE TEST</span><h2 id="modal-title">A little friendly pressure.</h2><p class="modal-intro">Five kicks. One objective. How many can you make count?</p><div class="challenge-grid">${CHALLENGES.map(challenge => `<article class="challenge-card"><div class="challenge-card-icon">${icon(challenge.icon)}</div><span>${challenge.eyebrow}</span><h3>${challenge.title}</h3><p>${challenge.description}</p><div class="challenge-best">PERSONAL BEST <b>${this.challengeBest(challenge.id)} / 5</b></div><button class="secondary-button" data-start-challenge="${challenge.id}">TAKE THE CHALLENGE ${icon('ArrowRight')}</button></article>`).join('')}</div><p class="modal-footnote">Position, wall, and goalkeeper are fixed in challenges. Ball contact, foot, aim, and power are all yours.</p>`, 'challenges-modal');
    $$<HTMLButtonElement>('[data-start-challenge]').forEach(button => button.addEventListener('click', () => {
      if (!this.canSetup()) { this.toast('Finish your current kick before starting a challenge.'); return; }
      this.startChallenge(CHALLENGES.find(c => c.id === button.dataset.startChallenge)!);
    }));
  }

  private startChallenge(definition: Challenge) {
    if (!this.challenge) this.practiceSettings = structuredClone(this.settings);
    this.challenge = { definition, attempts: 0, hits: 0, results: [] };
    this.settings.position = { ...definition.positions[0] };
    this.settings.wall = definition.wall;
    this.settings.difficulty = definition.difficulty;
    this.settings.aim = { ...DEFAULT_SETTINGS.aim };
    this.arena?.reset();
    this.applySettings();
    this.updateMode();
    this.closeModal();
    this.toast(`${definition.title} Five kicks. Make them count.`);
  }

  private challengeBest(id: string) {
    try { return clamp(Number(localStorage.getItem(`fkm.challenge.${id}`)) || 0, 0, 5); } catch { return 0; }
  }
  private saveChallengeBest() {
    if (!this.challenge) return;
    try { localStorage.setItem(`fkm.challenge.${this.challenge.definition.id}`, String(Math.max(this.challenge.hits, this.challengeBest(this.challenge.definition.id)))); } catch { /* Optional offline record. */ }
  }
  private showChallengeResult() {
    if (!this.challenge) return;
    const { definition, hits, results } = this.challenge;
    this.openModal(`<span class="modal-eyebrow">CHALLENGE COMPLETE / ${definition.title.toUpperCase()}</span><h2 id="modal-title">${hits === 5 ? 'Perfection has a name.' : hits >= 3 ? 'Now that’s a statement.' : 'The next one is yours.'}</h2><div class="challenge-score"><strong>${hits}<small>/ 5</small></strong><span>TARGETS COMPLETED</span></div><div class="challenge-results">${results.map(hit => `<span class="${hit ? 'hit' : ''}">${icon(hit ? 'Check' : 'X')}</span>`).join('')}</div><p class="modal-intro centered">Personal best: ${this.challengeBest(definition.id)} / 5. Keep shaping your signature shot.</p><div class="modal-button-row"><button class="secondary-button" id="back-training">FREE PRACTICE</button><button class="primary-button" id="retry-challenge">ONE MORE ROUND ${icon('RotateCcw')}</button></div>`);
    $('#back-training').addEventListener('click', () => this.returnToTraining());
    $('#retry-challenge').addEventListener('click', () => this.startChallenge(definition));
  }

  private showGraphicsError(message: string) {
    const loader = document.querySelector('#scene-loading');
    if (loader) loader.remove();
    this.openModal(`<span class="modal-eyebrow">LET’S GET YOU BACK ON THE PITCH</span><h2 id="modal-title">Graphics unavailable.</h2><p class="modal-intro">${message}</p><button class="primary-button full-width" id="reload-game">RELOAD ARENA ${icon('RotateCcw')}</button>`);
    $('#reload-game').addEventListener('click', () => window.location.reload());
  }

  private haptic(type: 'impact' | 'success') {
    if (!this.settings.haptics || !Capacitor.isNativePlatform()) return;
    const promise = type === 'impact' ? Haptics.impact({ style: ImpactStyle.Light }) : Haptics.notification({ type: NotificationType.Success });
    void promise.catch(() => { /* Device may have no vibration motor. */ });
  }
  private toast(message: string) {
    clearTimeout(this.toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    this.toastTimer = window.setTimeout(() => $('#toast').hidden = true, 3500);
  }
}
