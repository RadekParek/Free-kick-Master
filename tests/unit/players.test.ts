import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PLAYERS, getPlayer, isPlayerId } from '../../src/players';
import { FIXED_DT, SIDE_MAGNUS, cloneBall, getWall, integrateBall, launchBall, recommendedPower, shotSpeed, type ShotSetup } from '../../src/game/physics';
import { createKeeper } from '../../src/game/keeper';
import { advanceShot } from '../../src/game/simulation';

const setup: ShotSetup = { position: { x: 0, z: 30 }, aim: { x: 0, y: 1.8 }, contact: { x: 0, y: 0 }, foot: 'right', power: .72 };

describe('player catalogue and real offline portraits', () => {
  it('has unique, validated identities and bounded original training attributes', () => {
    expect(new Set(PLAYERS.map(player => player.id)).size).toBe(PLAYERS.length);
    for (const player of PLAYERS) {
      expect(isPlayerId(player.id)).toBe(true);
      expect(getPlayer(player.id)).toBe(player);
      expect(['left', 'right']).toContain(player.foot);
      for (const value of Object.values(player.attributes)) { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(100); }
      if (player.portrait) {
        expect(player.photoDate).toContain('2026');
        expect(player.photoSource).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
        expect(player.credit).toContain('CC BY-SA 4.0');
      } else {
        expect(player.photoSource).toBeNull();
      }
    }
  });
  it('rejects unknown identities without accepting arbitrary image URLs or attributes from storage', () => {
    expect(isPlayerId('../outside')).toBe(false);
    expect(isPlayerId({ id: 'ronaldo' })).toBe(false);
    expect(getPlayer('not-a-player').id).toBe('ronaldo');
  });
  it('ships all portraits as local WebP files, not network hotlinks', () => {
    for (const player of PLAYERS.filter(candidate => candidate.portrait)) {
      expect(player.portrait).toMatch(/^\.\/players\/[a-z]+\.webp$/);
      const path = `public/${player.portrait!.slice(2)}`;
      expect(existsSync(path)).toBe(true);
      const photo = readFileSync(path);
      expect(photo.subarray(0, 4).toString()).toBe('RIFF');
      expect(photo.subarray(8, 12).toString()).toBe('WEBP');
      expect(photo.byteLength).toBeGreaterThan(10000);
      expect(photo.byteLength).toBeLessThan(180000);
    }
  });
  it('ships crowd texture and attribution/license notices with the offline assets', () => {
    expect(existsSync('public/textures/stadium-crowd.webp')).toBe(true);
    expect(existsSync('public/players/LICENSE.md')).toBe(true);
  });
});

describe('stronger, attribute-driven ball flight', () => {
  it('gives Ronaldo more shot power and Messi more sidespin, not just different card art', () => {
    const ronaldo = getPlayer('ronaldo').attributes;
    const messi = getPlayer('messi').attributes;
    expect(shotSpeed(.7, ronaldo)).toBeGreaterThan(shotSpeed(.7, messi) * 1.1);
    const a = launchBall({ ...setup, contact: { x: -.6, y: 0 }, attributes: ronaldo });
    const b = launchBall({ ...setup, contact: { x: -.6, y: 0 }, attributes: messi });
    expect(b.sideSpin).toBeGreaterThan(a.sideSpin * 1.25);
  });
  it('increases curl displacement by over 25% relative to the v1 side-force coefficient', () => {
    const current = launchBall({ ...setup, contact: { x: -.6, y: 0 } });
    const old = cloneBall(current); old.sideSpin *= .005 / SIDE_MAGNUS;
    for (let i = 0; i < 110; i++) { integrateBall(current); integrateBall(old); }
    expect(current.position.x).toBeGreaterThan(old.position.x * 1.25);
    expect(SIDE_MAGNUS).toBeCloseTo(.0095, 4);
  });
  it('produces visible, repeated lateral knuckle transitions and a measurable late dip', () => {
    const ball = launchBall(setup);
    const straight = cloneBall(ball); straight.knuckle = false;
    let maxDisplacement = 0; let changes = 0; let lastDirection = 0;
    for (let i = 0; i < 132; i++) {
      integrateBall(ball); integrateBall(straight);
      maxDisplacement = Math.max(maxDisplacement, Math.abs(ball.position.x - straight.position.x));
      const direction = Math.sign(ball.velocity.x);
      if (direction && lastDirection && direction !== lastDirection) changes++;
      if (direction) lastDirection = direction;
    }
    expect(maxDisplacement).toBeGreaterThan(.6);
    expect(changes).toBeGreaterThanOrEqual(3);
    expect(ball.position.y).toBeLessThan(straight.position.y - .25);
  });
  it('makes the power specialist knuckle more strongly while remaining exactly reproducible', () => {
    const ronaldo = launchBall({ ...setup, attributes: getPlayer('ronaldo').attributes });
    const repeat = cloneBall(ronaldo);
    const messi = launchBall({ ...setup, attributes: getPlayer('messi').attributes });
    for (let i = 0; i < 112; i++) { integrateBall(ronaldo); integrateBall(repeat); integrateBall(messi); }
    expect(ronaldo).toEqual(repeat);
    expect(Math.abs(ronaldo.position.x)).toBeGreaterThan(Math.abs(messi.position.x) * 1.4);
  });
  it('keeps high control more stable under overcharge without random aiming errors', () => {
    const base = getPlayer('ronaldo').attributes;
    const precise = launchBall({ ...setup, power: 1, attributes: { ...base, control: 99 } });
    const lessPrecise = launchBall({ ...setup, power: 1, attributes: { ...base, control: 70 } });
    expect(lessPrecise.velocity.y).toBeGreaterThan(precise.velocity.y);
    expect(precise.velocity.x).toBe(lessPrecise.velocity.x);
  });
  it('resolves legal extreme shots for every player without NaNs or an endless flight', () => {
    for (const player of PLAYERS) for (const position of [{ x: 0, z: 17.5 }, { x: -30, z: 46 }, { x: 30, z: 10 }]) {
      for (const power of [.15, recommendedPower(position), .96]) for (const contact of [{ x: -.8, y: .1 }, { x: 0, y: 0 }]) {
        const ball = launchBall({ ...setup, attributes: player.attributes, position, power, contact });
        const keeper = createKeeper(position.x);
        const wall = getWall(position, 5);
        let result = null;
        for (let i = 0; i <= 5.2 / FIXED_DT && !result; i++) result = advanceShot(ball, keeper, wall, 'legend');
        expect(result).not.toBeNull();
        for (const value of Object.values(ball.position)) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});
