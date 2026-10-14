import type { Object3D } from 'three';
import type { KeeperState } from './keeper';
import { clamp, lerp, type Foot, type Outcome } from './physics';

export type PlayerRole = 'taker' | 'wall' | 'keeper';
export interface MotionRig {
  body: Object3D; head: Object3D; torso: Object3D;
  leftLeg: Object3D; rightLeg: Object3D; leftShin: Object3D; rightShin: Object3D;
  leftArm: Object3D; rightArm: Object3D; leftForearm: Object3D; rightForearm: Object3D;
}
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

export function idlePose(rig: MotionRig, time: number, role: PlayerRole = 'taker') {
  const breath = Math.sin(time * 2.2), shift = Math.sin(time * 0.85);
  rig.body.position.set(shift * 0.012, breath * 0.007, 0);
  rig.head.rotation.set(0.025 * breath, Math.sin(time * 0.55) * 0.09, -shift * 0.018);
  rig.leftForearm.rotation.set(0.12, 0, 0);
  rig.rightForearm.rotation.set(0.12, 0, 0);
  rig.body.rotation.set(0, 0, 0);
  rig.leftLeg.rotation.set(0.03, 0, -0.03);
  rig.rightLeg.rotation.set(-0.04, 0, 0.03);
  // Subtle weight shift and toe tap keep standing athletes alive without any extra meshes.
  rig.leftShin.rotation.set(Math.max(0, Math.sin(time * 2.6)) * 0.035, 0, 0);
  rig.rightShin.rotation.set(Math.max(0, Math.sin(time * 2.6 + Math.PI)) * 0.035, 0, 0);
  rig.leftArm.rotation.set(-0.12 + Math.sin(time * 1.7) * 0.04, 0, -0.16);
  rig.rightArm.rotation.set(0.07 + Math.sin(time * 1.7 + 1) * 0.04, 0, 0.16);
  if (role === 'wall') {
    rig.leftArm.rotation.x = -0.25;
    rig.rightArm.rotation.x = -0.25;
    rig.leftArm.rotation.z = -0.32;
    rig.rightArm.rotation.z = 0.32;
  }
  rig.torso.rotation.z = Math.sin(time * 1.4) * 0.012;
}

export function runPose(rig: MotionRig, phase: number, foot: Foot) {
  // Approach: the stride quickens and the body leans over the ball; the strike is a
  // backswing with a flexed knee, a hip turn, and a whip through the ball.
  const kickStart = 0.7;
  const approach = Math.min(phase, kickStart) / kickStart;
  // Cadence rises through the run: about five steps from the start to the plant.
  const stride = Math.PI * 2 * (2.1 * phase + 0.6 * phase * phase);
  const swing = Math.sin(stride);
  const amp = 0.32 + 0.4 * approach;
  const sign = foot === 'right' ? 1 : -1;
  const striking = foot === 'right' ? rig.rightLeg : rig.leftLeg;
  const strikingShin = foot === 'right' ? rig.rightShin : rig.leftShin;
  const support = foot === 'right' ? rig.leftLeg : rig.rightLeg;
  const supportShin = foot === 'right' ? rig.leftShin : rig.rightShin;
  const armForward = foot === 'right' ? rig.leftArm : rig.rightArm;
  const armBack = foot === 'right' ? rig.rightArm : rig.leftArm;

  rig.body.position.set(0, Math.abs(swing) * 0.05 * (0.5 + approach) * (1 - smooth((phase - 0.7) / 0.3)), 0);
  rig.head.rotation.set(-0.12 - smooth((phase - 0.7) / 0.3) * 0.14, -sign * 0.04, 0);
  rig.torso.rotation.set(0, 0, 0);
  rig.leftForearm.rotation.set(0.45 + 0.25 * Math.max(0, -swing), 0, 0);
  rig.rightForearm.rotation.set(0.45 + 0.25 * Math.max(0, swing), 0, 0);
  rig.body.rotation.set(-0.06 - 0.14 * approach, -sign * 0.06 * approach, 0);
  rig.leftLeg.rotation.set(swing * amp, 0, 0);
  rig.rightLeg.rotation.set(-swing * amp, 0, 0);
  rig.leftShin.rotation.x = Math.min(0, -swing) * 1.0 * (0.4 + approach);
  rig.rightShin.rotation.x = Math.min(0, swing) * 1.0 * (0.4 + approach);
  rig.leftArm.rotation.set(-swing * 0.9 * (0.5 + approach), 0, -0.25 - 0.15 * approach);
  rig.rightArm.rotation.set(swing * 0.9 * (0.5 + approach), 0, 0.25 + 0.15 * approach);

  if (phase > kickStart) {
    const k = (phase - kickStart) / (1 - kickStart);
    const back = smooth(k / 0.55);
    const whip = smooth((k - 0.55) / 0.25);
    const leg = whip > 0 ? -1.35 + (1.7 + 1.35) * whip : -0.95 - 0.4 * back;
    const knee = -1.4 * (whip > 0 ? 1 - whip : back);
    striking.rotation.set(leg, 0, sign * -0.1 * (1 - whip));
    strikingShin.rotation.x = knee;
    support.rotation.set(-0.14 - 0.06 * whip, 0, -sign * 0.1);
    supportShin.rotation.x = -0.2;
    armForward.rotation.set(-0.7 - 0.5 * whip, 0, foot === 'right' ? -0.95 : 0.95);
    armBack.rotation.set(0.6 + 0.4 * back, 0, foot === 'right' ? 0.95 : -0.95);
    rig.body.rotation.x = -0.2 - 0.1 * whip;
    rig.body.rotation.y = sign * (0.25 * whip - 0.12 * back);
    rig.body.rotation.z = sign * (0.14 * back - 0.08 * whip);
  }
}

/** Settle from the exact contact pose, rather than snapping back to idle at impact. */
export function followThroughPose(rig: MotionRig, time: number, foot: Foot) {
  runPose(rig, 1, foot);
  const settle = smooth(time / 0.85);
  const striking = foot === 'right' ? rig.rightLeg : rig.leftLeg;
  const support = foot === 'right' ? rig.leftLeg : rig.rightLeg;
  striking.rotation.x = lerp(1.7, -0.04, settle);
  support.rotation.x = lerp(-0.2, 0.03, settle);
  rig.leftShin.rotation.x *= 1 - settle;
  rig.rightShin.rotation.x *= 1 - settle;
  rig.body.rotation.x *= 1 - settle;
  rig.body.rotation.y *= 1 - settle;
  rig.body.rotation.z *= 1 - settle;
  rig.leftLeg.rotation.z *= 1 - settle;
  rig.rightLeg.rotation.z *= 1 - settle;
  rig.leftArm.rotation.x *= 1 - settle;
  rig.rightArm.rotation.x *= 1 - settle;
  rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, -0.16, settle);
  rig.rightArm.rotation.z = lerp(rig.rightArm.rotation.z, 0.16, settle);
  rig.leftForearm.rotation.x = lerp(rig.leftForearm.rotation.x, 0.12, settle);
  rig.rightForearm.rotation.x = lerp(rig.rightForearm.rotation.x, 0.12, settle);
  rig.head.rotation.x = lerp(-0.26, 0.035, settle); // Eyes follow the departing ball.
}

export function preparePose(rig: MotionRig, time: number, charge: number) {
  idlePose(rig, time);
  const ready = smooth(charge * 3);
  rig.body.position.y -= 0.025 * ready;
  rig.body.rotation.x = -0.035 * ready;
  rig.head.rotation.x = -0.12 * ready;
  rig.leftForearm.rotation.x += 0.2 * ready;
  rig.rightForearm.rotation.x += 0.2 * ready;
}

export function reactionPose(rig: MotionRig, outcome: Outcome, elapsed: number, shotTime: number, foot: Foot) {
  followThroughPose(rig, shotTime, foot);
  const blend = smooth((elapsed - 0.18) / 0.65);
  if (outcome === 'goal') {
    const pump = Math.sin(Math.max(0, elapsed - 0.6) * 7) * Math.exp(-Math.max(0, elapsed - 1.2));
    rig.body.position.y += Math.abs(pump) * 0.025 * blend;
    rig.body.rotation.y += Math.sin(elapsed * 1.5) * 0.14 * blend;
    rig.rightArm.rotation.z = lerp(rig.rightArm.rotation.z, 1.65 + pump * 0.16, blend);
    rig.rightArm.rotation.x = lerp(rig.rightArm.rotation.x, -0.3, blend);
    rig.rightForearm.rotation.x = lerp(rig.rightForearm.rotation.x, 1.35, blend);
    rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, -0.7, blend);
    rig.leftForearm.rotation.x = lerp(rig.leftForearm.rotation.x, 0.75, blend);
    rig.head.rotation.x = lerp(rig.head.rotation.x, 0.08, blend);
  } else {
    const handsToHead = outcome === 'post';
    rig.head.rotation.x = lerp(rig.head.rotation.x, handsToHead ? 0.08 : -0.23, blend);
    rig.head.rotation.y = Math.sin(elapsed * 4) * 0.08 * Math.exp(-elapsed * 0.4) * blend;
    rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, handsToHead ? -2.1 : -0.4, blend);
    rig.rightArm.rotation.z = lerp(rig.rightArm.rotation.z, handsToHead ? 2.1 : 0.4, blend);
    rig.leftForearm.rotation.x = lerp(rig.leftForearm.rotation.x, handsToHead ? 1.3 : 0.65, blend);
    rig.rightForearm.rotation.x = lerp(rig.rightForearm.rotation.x, handsToHead ? 1.3 : 0.65, blend);
  }
}

export function wallPose(rig: MotionRig, jump: number, time: number) {
  idlePose(rig, time);
  rig.body.position.y = jump;
  const brace = smooth((time - 0.04) / 0.12) * (1 - smooth((time - 0.8) / 0.3));
  rig.head.rotation.x = -0.06 * brace;
  rig.leftForearm.rotation.x = rig.rightForearm.rotation.x = 0.65;
  rig.leftShin.rotation.x = rig.rightShin.rotation.x = -jump * 0.4;
  rig.leftArm.rotation.x = 0.35;
  rig.rightArm.rotation.x = 0.35;
}

export function keeperPose(rig: MotionRig, k: KeeperState, time: number, preparation = 0) {
  idlePose(rig, time, 'keeper');
  rig.head.rotation.y = clamp(-(k.targetX - k.x) * 0.12, -0.35, 0.35);
  rig.head.rotation.x = clamp((k.targetY - 1.4) * 0.15, -0.2, 0.18);
  rig.leftForearm.rotation.x = rig.rightForearm.rotation.x = 0.4;
  if (k.dive > 0) {
    const angle = k.direction * smooth(k.dive) * (k.targetY < 0.8 ? 1.1 : 0.94);
    rig.body.rotation.z = angle;
    rig.body.position.set(Math.sin(angle), 0.9 + (k.glove.y - 1.1) * 0.35 - Math.cos(angle), 0);
    const extension = smooth(k.dive * 2.5);
    const reach = clamp(k.glove.y - 0.7, 0, 1.8);
    rig.leftArm.rotation.z = lerp(-0.5, -k.direction * (1.6 + reach * 0.38), extension);
    rig.rightArm.rotation.z = lerp(0.5, -k.direction * (1.5 + reach * 0.38), extension);
    rig.leftArm.rotation.x = rig.rightArm.rotation.x = 0.3 * (1 - extension);
    rig.leftForearm.rotation.x = rig.rightForearm.rotation.x = 0.4 * (1 - extension);
    rig.leftLeg.rotation.z = -0.22;
    rig.rightLeg.rotation.z = 0.26;
    rig.leftLeg.rotation.x = k.dive * 0.2;
    rig.rightLeg.rotation.x = -k.dive * 0.3;
  } else {
    // Split-step timed to contact, followed by small lateral adjustment steps.
    const setStep = Math.sin(clamp(preparation, 0, 1) * Math.PI);
    const shuffle = k.reacted ? Math.sin(time * 15) * clamp(Math.abs(k.targetX - k.x), 0, 0.5) : Math.sin(time * 3) * 0.02;
    rig.body.position.y = -0.065 + Math.sin(time * 3) * 0.012 + setStep * 0.035;
    rig.body.position.x = shuffle * 0.025;
    rig.leftLeg.rotation.z = -0.07 - shuffle * 0.12;
    rig.rightLeg.rotation.z = 0.07 - shuffle * 0.12;
    rig.leftLeg.rotation.x = -0.18;
    rig.rightLeg.rotation.x = -0.18;
    rig.leftShin.rotation.x = 0.18;
    rig.rightShin.rotation.x = 0.18;
    rig.leftArm.rotation.z = -0.5;
    rig.rightArm.rotation.z = 0.5;
    rig.leftArm.rotation.x = 0.35;
    rig.rightArm.rotation.x = 0.35;
  }
}


/** Landing, a brief side roll, then a planted-knee recovery. Only cosmetic: the save
 * volumes/difficulty stay in keeper.ts and replay uses the same outcome-relative clock. */
export function keeperRecoveryPose(rig: MotionRig, k: KeeperState, time: number, elapsed: number, outcome: Outcome) {
  keeperPose(rig, k, time);
  const land = smooth(elapsed / 0.45), rise = smooth((elapsed - 1.05) / 1.0);
  const diving = smooth(k.dive * 2);
  const side = k.direction;
  const roll = Math.sin(Math.PI * smooth((elapsed - 0.35) / 0.7)) * diving;
  rig.body.rotation.z = lerp(rig.body.rotation.z, side * 1.28, land * diving) * (1 - rise);
  rig.body.rotation.x = (-0.16 * roll - 0.22 * Math.sin(rise * Math.PI)) * land;
  rig.body.position.y = lerp(rig.body.position.y, -0.03, land * diving);
  rig.body.position.y = lerp(rig.body.position.y, -0.065, rise);
  rig.body.position.x *= 1 - rise;
  rig.leftLeg.rotation.x = lerp(rig.leftLeg.rotation.x, -0.4 * roll - 0.18, land);
  rig.rightLeg.rotation.x = lerp(rig.rightLeg.rotation.x, 0.25 * roll - 0.18, land);
  rig.leftShin.rotation.x = lerp(rig.leftShin.rotation.x, -0.65 * roll + 0.18 * rise, land);
  rig.rightShin.rotation.x = lerp(rig.rightShin.rotation.x, -0.35 * roll + 0.18 * rise, land);
  const tuck = outcome === 'saved' ? 0.85 : 0.45;
  rig.leftForearm.rotation.x = lerp(rig.leftForearm.rotation.x, tuck, land * (1 - rise));
  rig.rightForearm.rotation.x = lerp(rig.rightForearm.rotation.x, tuck, land * (1 - rise));
  rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, -0.5, rise);
  rig.rightArm.rotation.z = lerp(rig.rightArm.rotation.z, 0.5, rise);
  rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, 0.35, rise);
  rig.rightArm.rotation.x = lerp(rig.rightArm.rotation.x, 0.35, rise);
  rig.head.rotation.x = lerp(rig.head.rotation.x, outcome === 'goal' ? -0.15 : 0, rise);
}
