import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { PLAYERS, getPlayer, playStyleFor } from '../../src/players';
import { defenderJump, getWall, hitsWall, launchBall, previewShot, rollWallJump, shotSpeed, wallJump, type ShotSetup } from '../../src/game/physics';
import { playerCard } from '../../src/ui/player-card';
import { faceShape, identitySeed, personaliseFace } from '../../src/game/identity';
import { ReplayBuffer } from '../../src/game/replay';
import { createKeeper } from '../../src/game/keeper';

const setup: ShotSetup = { position: { x: 0, z: 30 }, aim: { x: 1.3, y: 2 }, contact: { x: -.43, y: 0 }, power: .8, foot: 'right' };
describe('custom PlayStyle+ effects and identity fixes', () => {
  it('assigns exactly the requested eight base players and inherits specials', () => {
    const base = PLAYERS.filter(p => p.edition === 'standard');
    expect(base.filter(p => playStyleFor(p.baseId) === 'finesse').map(p => p.id)).toEqual(['messi', 'yamal']);
    expect(base.filter(p => playStyleFor(p.baseId) === 'power').map(p => p.id)).toEqual(['ronaldo', 'haaland']);
    expect(base.filter(p => playStyleFor(p.baseId) === 'deadball').map(p => p.id)).toEqual(['neymar', 'vinicius', 'dembele', 'musiala']);
    expect(playStyleFor(getPlayer('vinicius-special').baseId)).toBe('deadball');
  });
  it.each([0, .2, .4999, .5, .5001, 1])('adds exact km/h for Power Shot+ at power %s', power => {
    const attributes = getPlayer('ronaldo').attributes;
    const difference = (shotSpeed(power, attributes, 'power') - shotSpeed(power, attributes)) * 3.6;
    expect(difference).toBeCloseTo(power < .5 ? 10 : 20, 10);
    const ball = launchBall({ ...setup, power, attributes, playStyle: 'power' });
    expect(Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z)).toBeCloseTo(shotSpeed(power, attributes, 'power'), 10);
  });
  it('gives Finesse Shot+ 2.35× sidespin and 6% more launch speed', () => {
    const normal = launchBall(setup), finesse = launchBall({ ...setup, playStyle: 'finesse' });
    expect(finesse.sideSpin / normal.sideSpin).toBeCloseTo(2.35);
    expect(Math.hypot(...Object.values(finesse.velocity)) / Math.hypot(...Object.values(normal.velocity))).toBeCloseTo(1.06);
  });
  it('makes Dead Ball+ repeatable even for full-path knuckle previews, with less overpower error', () => {
    const dead: ShotSetup = { ...setup, power: .95, contact: { x: 0, y: 0 }, playStyle: 'deadball', attributes: getPlayer('neymar').attributes };
    expect(previewShot({ ...dead, seed: 25 }, 6)).toEqual(previewShot({ ...dead, seed: 923 }, 6));
    const normal = launchBall({ ...dead, playStyle: undefined });
    const improved = launchBall(dead);
    expect(improved.velocity.y).toBeLessThan(normal.velocity.y);
    const path = previewShot(dead, 6);
    expect(path.at(-1)!.z).toBeCloseTo(-.11);
  });
  it.each(['saka', 'griezmann', 'dovbyk', 'kulusevski', 'hojlund', 'odegaard'])('sets the preferred left foot for %s', id => {
    expect(getPlayer(id).foot).toBe('left');
  });
  it('corrects Luis Díaz to right-footed and limits handwriting to specials', () => {
    expect(getPlayer('luisdiaz').foot).toBe('right');
    for (const p of PLAYERS) expect(playerCard(p).includes('card-name handwritten')).toBe(p.edition === 'special');
  });
  it('has a locally bundled photograph for every card and real PNG badge files', () => {
    expect(PLAYERS.every(p => p.portrait && p.photoSource && p.credit)).toBe(true);
    for (const style of ['finesse', 'power', 'deadball']) expect(readFileSync(`public/playstyles/${style}.png`).subarray(1, 4).toString()).toBe('PNG');
  });
  it('gives all base players stable distinct identities and shares special identities', () => {
    const base = PLAYERS.filter(p => p.edition === 'standard');
    expect(new Set(base.map(p => identitySeed(p.baseId))).size).toBe(35);
    expect(new Set(base.map(p => JSON.stringify(faceShape(p)))).size).toBe(35);
    expect(faceShape(getPlayer('yamal'))).toEqual(faceShape(getPlayer('yamal-special')));
  });
  it('does not deform shared model templates or accumulate face morphs when switching players', () => {
    const geometry = new THREE.SphereGeometry(.1, 12, 8).translate(0, .17, -.08);
    const material = new THREE.MeshStandardMaterial(); material.name = 'skin';
    const original = new Float32Array(geometry.attributes.position.array);
    const mesh = new THREE.Mesh(geometry, material), group = new THREE.Group(); group.add(mesh);
    personaliseFace(group, getPlayer('ronaldo'));
    const first = new Float32Array(mesh.geometry.attributes.position.array);
    personaliseFace(group, getPlayer('messi')); personaliseFace(group, getPlayer('ronaldo'));
    expect(mesh.geometry.attributes.position.array).toEqual(first);
    expect(geometry.attributes.position.array).toEqual(original);
    expect(first).not.toEqual(original);
  });
});
describe('per-defender no-jump roll', () => {
  it('rolls exactly the bottom fifteen percent of uniformly distributed random values', () => {
    const wall = Array.from({ length: 100 }, (_, x) => ({ x, z: 10 })); let sample = 0;
    rollWallJump(wall, () => (sample++ + .5) / 100);
    expect(wall.filter(p => defenderJump(p, .49) === 0)).toHaveLength(15);
    expect(wallJump(.49)).toBeCloseTo(.36);
  });
  it('uses the same non-jump decision in collision detection, without re-rolling', () => {
    const wall = getWall({ x: 0, z: 24 }, 1); const p = wall[0];
    const a = { x: p.x, y: 2.05, z: p.z + 1 }, b = { x: p.x, y: 2.05, z: p.z - 1 };
    p.noJump = false; expect(hitsWall(a, b, wall, .49)).toBe(true);
    p.noJump = true; expect(hitsWall(a, b, wall, .49)).toBe(false);
    expect(defenderJump(p, .49)).toBe(0);
  });
});
describe('recorded goal-analysis path', () => {
  it('copies only pre-goal samples, bounded by capacity, without modifying replay state', () => {
    const replay = new ReplayBuffer(8), ball = launchBall(setup), keeper = createKeeper(0);
    for (let i = 0; i < 5; i++) { ball.time = i / 60; ball.position.z = 30 - i; replay.record(ball, keeper); }
    const output = new Float32Array(24);
    expect(replay.copyPath(output, 2 / 60)).toBe(3);
    expect([...output.slice(0, 9)]).toEqual([0, expect.closeTo(.11), 30, 0, expect.closeTo(.11), 29, 0, expect.closeTo(.11), 28]);
    expect(replay.copyPath(new Float32Array(6))).toBe(2);
    expect(replay.length).toBe(5);
  });
});
