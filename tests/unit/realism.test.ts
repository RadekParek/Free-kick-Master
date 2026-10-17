import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { launchBall, integrateBall, cloneBall, BALL_RADIUS, GRAVITY, FIXED_DT, dragCoefficient } from '../../src/game/physics';
import { idlePose, runPose, followThroughPose, type MotionRig } from '../../src/game/animation';
import { footballSurface } from '../../src/game/ball-surface';
import { createKeeper, updateKeeper } from '../../src/game/keeper';
import { getPlayer } from '../../src/players';
import { playerCard } from '../../src/ui/player-card';

const setup = { position: { x: 0, z: 30 }, aim: { x: 0, y: 2.4 }, contact: { x: 0, y: 0 }, foot: 'right' as const, power: .85 };
const bones = ['body','head','torso','leftLeg','rightLeg','leftShin','rightShin','leftArm','rightArm','leftForearm','rightForearm','leftFoot','rightFoot'] as const;
const rig = () => Object.fromEntries(bones.map(b => [b, new Object3D()])) as unknown as MotionRig;
const snapshot = (r: MotionRig) => bones.flatMap(b => [...r[b]!.position.toArray(), ...r[b]!.quaternion.toArray()]);
describe('realistic flight, contact and presentation', () => {
  it('varies seeded knuckle wakes without changing initial speed, aim, or deterministic replay', () => {
    const a = launchBall({ ...setup, seed: 12 }), b = launchBall({ ...setup, seed: 13 }), repeat = cloneBall(a);
    expect(a.velocity).toEqual(b.velocity);
    for (let i = 0; i < 120; i++) { integrateBall(a); integrateBall(b); integrateBall(repeat); }
    expect(a).toEqual(repeat);
    expect(Math.abs(a.position.x - b.position.x)).toBeGreaterThan(.05);
  });
  it('limits goalkeeper acceleration rather than snapping straight to maximum lateral speed', () => {
    const b = launchBall(setup); b.time = 1; b.position = { x: 3, y: 1.5, z: 8 };
    const k = createKeeper(0); updateKeeper(k, b, 'legend', FIXED_DT);
    expect(Math.abs(k.velocityX)).toBeLessThanOrEqual(14 * FIXED_DT + 1e-8);
  });
  it('does not randomize an ordinary curled shot', () => {
    const a = launchBall({ ...setup, contact: { x: .5, y: 0 }, seed: 12 });
    const b = launchBall({ ...setup, contact: { x: .5, y: 0 }, seed: 52 });
    for (let i = 0; i < 120; i++) { integrateBall(a); integrateBall(b); }
    expect(a.position).toEqual(b.position);
  });
  it('has gravity, not a discontinuous extra-apex drop, and drag opposes vertical motion', () => {
    const b = launchBall(setup); b.position.y = 10; b.knuckle = false; b.velocity = { x: 0, y: -.001, z: 0 };
    integrateBall(b);
    expect((b.velocity.y + .001) / FIXED_DT).toBeCloseTo(-GRAVITY, 4);
    expect(dragCoefficient(10)).toBeGreaterThan(dragCoefficient(30));
  });
  it('dissipates energy at a turf bounce and retains forward roll without penetrating grass', () => {
    const b = launchBall(setup); b.knuckle = false; b.position.y = BALL_RADIUS + .001; b.velocity = { x: 4, y: -6, z: -10 };
    const before = Math.hypot(...Object.values(b.velocity)); integrateBall(b);
    expect(b.bounces).toBe(1); expect(b.velocity.y).toBeGreaterThan(0);
    expect(Math.hypot(...Object.values(b.velocity))).toBeLessThan(before);
    expect(b.position.y).toBe(BALL_RADIUS);
    b.velocity.y = 0; b.position.y = BALL_RADIUS;
    const rollingSpeed = Math.hypot(b.velocity.x, b.velocity.z);
    for (let i = 0; i < 120; i++) integrateBall(b);
    expect(Math.hypot(b.velocity.x, b.velocity.z)).toBeGreaterThan(rollingSpeed * .6);
    expect(b.position.y).toBe(BALL_RADIUS);
  });
  it('uses distinct signature stances and cleans every animated joint when returning to idle', () => {
    const a = rig(), b = rig(); idlePose(a, 0, 'taker', 'ronaldo'); idlePose(b, 0, 'taker', 'neymar');
    expect(snapshot(a)).not.toEqual(snapshot(b));
    runPose(a, 1, 'right', { x: -.6, y: 0 }); idlePose(a, 0); idlePose(b, 0);
    expect(snapshot(a)).toEqual(snapshot(b));
  });
  it.each(['right','left'] as const)('turns the %s ankle inward for outside-foot contact and preserves impact continuity', foot => {
    const outside = rig(), inside = rig(), sign = foot === 'right' ? 1 : -1;
    const contact = { x: -.6 * sign, y: 0 };
    runPose(outside, 1, foot, contact); runPose(inside, 1, foot, { x: .6 * sign, y: 0 });
    const boot = foot === 'right' ? 'rightFoot' : 'leftFoot';
    expect(outside[boot]!.rotation.y * sign).toBeGreaterThan(0);
    expect(inside[boot]!.rotation.y * sign).toBeLessThan(0);
    const impact = snapshot(outside); followThroughPose(outside, 0, foot, contact);
    snapshot(outside).forEach((v,i) => expect(v).toBeCloseTo(impact[i], 8));
    expect(Math.abs((foot === 'right' ? outside.rightLeg : outside.leftLeg).rotation.x)).toBeLessThan(.3);
  });
  it('keeps Yamal blonde and left-footed, including his special edition', () => {
    for (const id of ['yamal','yamal-special']) {
      expect(getPlayer(id).appearance.hair).toBe('#d7b779');
      expect(getPlayer(id).foot).toBe('left');
      expect(getPlayer(id).appearance.height).toBe(1.8);
    }
  });
  it('generates opaque, repeatable panel colour and separate seam relief maps', () => {
    const a = footballSurface(64,32), b = footballSurface(64,32);
    expect(a).toEqual(b); expect(a.color.length).toBe(64*32*4);
    expect(a.color).not.toEqual(a.relief);
    for (let i = 3; i < a.color.length; i += 4) expect(a.color[i]).toBe(255);
  });
  it('gives special cards diffraction foil, an original seal, handwritten names and four honest stats', () => {
    const special = playerCard(getPlayer('yamal-special'));
    expect(special).toContain('card-hologram'); expect(special).toContain('card-seal');
    expect(special).toContain('card-name handwritten'); expect(special).toContain('<small>CTL</small>');
    expect(special).toContain('1.80 M');
    expect(playerCard(getPlayer('ronaldo'))).not.toContain('card-hologram');
  });
});
