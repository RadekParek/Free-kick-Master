import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { followThroughPose, idlePose, keeperPose, keeperRecoveryPose, preparePose, reactionPose, runPose, wallPose, type MotionRig } from '../../src/game/animation';
import { createKeeper } from '../../src/game/keeper';

const bones = ['body', 'head', 'torso', 'leftLeg', 'rightLeg', 'leftShin', 'rightShin', 'leftArm', 'rightArm', 'leftForearm', 'rightForearm'] as const;
function rig(): MotionRig { return Object.fromEntries(bones.map(name => [name, new Object3D()])) as unknown as MotionRig; }
function snapshot(r: MotionRig) { return bones.flatMap(bone => [...r[bone].position.toArray(), ...r[bone].quaternion.toArray()]); }

describe('articulated animation', () => {
  it('uses head, weight shift, and elbows during preparation', () => {
    const r = rig();
    idlePose(r, 1);
    const standing = snapshot(r);
    preparePose(r, 1, 0.6);
    expect(snapshot(r)).not.toEqual(standing);
    expect(r.head.rotation.x).toBeLessThan(-0.1);
    expect(r.leftForearm.rotation.x).toBeGreaterThan(0.2);
  });

  it.each(['left', 'right'] as const)('blends continuously from %s-foot contact into follow-through', foot => {
    const r = rig();
    runPose(r, 1, foot);
    const contact = snapshot(r);
    followThroughPose(r, 0, foot);
    snapshot(r).forEach((value, i) => expect(value).toBeCloseTo(contact[i], 8));
    followThroughPose(r, 0.85, foot);
    const leg = foot === 'right' ? r.rightLeg : r.leftLeg;
    expect(Math.abs(leg.rotation.x)).toBeLessThan(0.1);
    expect(Math.abs(r.body.rotation.x)).toBeLessThan(0.01);
  });

  it('gives goals and misses distinct reactions without triggering before the result', () => {
    const goal = rig(), miss = rig(), post = rig(), base = rig();
    followThroughPose(base, 1.5, 'right');
    reactionPose(goal, 'goal', 0, 1.5, 'right');
    expect(snapshot(goal)).toEqual(snapshot(base));
    reactionPose(goal, 'goal', 1, 1.5, 'right');
    reactionPose(miss, 'wide', 1, 1.5, 'right');
    reactionPose(post, 'post', 1, 1.5, 'right');
    expect(goal.rightArm.rotation.z).toBeGreaterThan(1);
    expect(miss.head.rotation.x).toBeLessThan(-0.1);
    expect(post.leftArm.rotation.z).toBeLessThan(-2);
  });

  it('varies keeper set-step, low dives and high reaches', () => {
    const r = rig(), k = createKeeper(0);
    keeperPose(r, k, 0, 0);
    const readyHeight = r.body.position.y;
    keeperPose(r, k, 0, 0.5);
    expect(r.body.position.y).toBeGreaterThan(readyHeight);
    k.dive = 0.8; k.targetY = k.glove.y = 0.4;
    keeperPose(r, k, 1);
    const low = snapshot(r);
    k.targetY = k.glove.y = 2.3;
    keeperPose(r, k, 1);
    expect(snapshot(r)).not.toEqual(low);
  });

  it('lands and recovers without changing keeper collision state, and resets all joints', () => {
    const r = rig(), k = createKeeper(0);
    k.dive = 0.85; k.direction = -1; k.glove.y = 1.8;
    const state = structuredClone(k);
    keeperPose(r, k, 1);
    const diving = snapshot(r);
    keeperRecoveryPose(r, k, 1, 0, 'saved');
    snapshot(r).forEach((value, i) => expect(value).toBeCloseTo(diving[i], 8));
    keeperRecoveryPose(r, k, 2, 0.6, 'saved');
    expect(Math.abs(r.body.rotation.z)).toBeGreaterThan(1);
    keeperRecoveryPose(r, k, 4, 2.2, 'saved');
    expect(Math.abs(r.body.rotation.z)).toBeLessThan(0.01);
    expect(k).toEqual(state);
    idlePose(r, 0);
    const clean = rig(); idlePose(clean, 0);
    expect(snapshot(r)).toEqual(snapshot(clean));
  });

  it('is deterministic, finite, and leaves the same pose when replayed at the same time', () => {
    const a = rig(), b = rig(), k = createKeeper(0);
    for (let i = 0; i <= 60; i++) {
      const t = i / 20;
      runPose(a, Math.min(t, 1), 'left');
      keeperRecoveryPose(a, k, t, t, 'goal');
      wallPose(a, Math.sin(t) * 0.1, t);
      reactionPose(a, 'goal', t, 1 + t, 'left');
      reactionPose(b, 'goal', t, 1 + t, 'left');
      expect(snapshot(a)).toEqual(snapshot(b));
      expect(snapshot(a).every(Number.isFinite)).toBe(true);
    }
  });
});
