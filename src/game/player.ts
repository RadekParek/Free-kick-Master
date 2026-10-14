import * as THREE from 'three';
import { normalMapFromCanvas } from './pbr';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { KeeperState } from './keeper';
import type { Foot, Outcome } from './physics';
import { idlePose, preparePose, runPose, followThroughPose, reactionPose, wallPose, keeperPose, keeperRecoveryPose, type PlayerRole } from './animation';
export type { PlayerRole } from './animation';
import type { TakerProfile } from '../players';

export type Detail = 'high' | 'low';

/** Beyond this camera distance (m) the athlete switches to its low-detail rig. */
export const athleteLodDistance = 30;

const skinColors = ['#b77952', '#704936', '#ce9b73', '#906344', '#dfb18b'];
const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = shadowCanvas.height = 64;
const shadowCtx = shadowCanvas.getContext('2d')!;
const shadowGradient = shadowCtx.createRadialGradient(32, 32, 3, 32, 32, 32);
shadowGradient.addColorStop(0, 'rgba(3,9,12,0.5)');
shadowGradient.addColorStop(1, 'rgba(3,9,12,0)');
shadowCtx.fillStyle = shadowGradient;
shadowCtx.fillRect(0, 0, 64, 64);
const shadowTexture = new THREE.CanvasTexture(shadowCanvas);

/** Shared knit texture: near-white so the kit colour multiplies cleanly and the cloth reads up close. */
let knitTexture: THREE.CanvasTexture | null = null;
let knitNormalMap: THREE.CanvasTexture | null = null;
function knit(): THREE.CanvasTexture {
  if (knitTexture) return knitTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 4) {
    ctx.fillStyle = i % 8 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.10)';
    ctx.fillRect(i, 0, 2, 128);
    ctx.fillRect(0, i, 128, 1);
  }
  knitTexture = new THREE.CanvasTexture(canvas);
  knitTexture.wrapS = knitTexture.wrapT = THREE.RepeatWrapping;
  knitTexture.repeat.set(2, 2);
  // Woven relief as a tangent-space normal map, generated once with the knit texture.
  knitNormalMap = normalMapFromCanvas(canvas, 2.5);
  knitNormalMap.repeat.set(2, 2);
  knitTexture.colorSpace = THREE.SRGBColorSpace;
  knitTexture.anisotropy = 4;
  return knitTexture;
}

const numberCache = new Map<string, THREE.CanvasTexture>();
function numberTexture(number: number, name: string, color: string) {
  const key = `${number}|${name}|${color}`;
  const cached = numberCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color; ctx.textAlign = 'center';
  ctx.font = '600 28px "Barlow Condensed", sans-serif';
  ctx.fillText(name.toUpperCase(), 128, 42);
  ctx.font = '600 160px "Barlow Condensed", sans-serif';
  ctx.fillText(String(number), 128, 205);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  numberCache.set(key, tex);
  return tex;
}

const material = (color: string, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });

/** One articulated athlete rig at a given level of detail. */
class Athlete {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly leftLeg = new THREE.Group();
  readonly rightLeg = new THREE.Group();
  readonly leftShin = new THREE.Group();
  readonly rightShin = new THREE.Group();
  readonly leftArm = new THREE.Group();
  readonly rightArm = new THREE.Group();
  readonly head = new THREE.Group();
  readonly leftForearm = new THREE.Group();
  readonly rightForearm = new THREE.Group();
  private readonly animated: THREE.Object3D[];
  readonly torso: THREE.Mesh;
  readonly beard: THREE.Mesh;
  readonly numberPlate: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  readonly skin: THREE.MeshStandardMaterial;
  readonly jersey: THREE.MeshStandardMaterial;
  readonly shorts: THREE.MeshStandardMaterial;
  readonly trim: THREE.MeshStandardMaterial;
  readonly hair: THREE.MeshStandardMaterial;

  constructor(private role: PlayerRole, number: number, variation: number, detail: Detail) {
    const hi = detail === 'high';
    const pick = (high: number, low: number) => hi ? high : low;
    this.root.add(this.body);
    const cloth = knit();
    const clothNormal = knitNormalMap!;
    const skin = this.skin = material(skinColors[variation % skinColors.length], 0.58);
    const jersey = this.jersey = new THREE.MeshStandardMaterial({ color: role === 'taker' ? '#b72b39' : role === 'keeper' ? '#ffbb3b' : '#ecedf0', roughness: 0.78, map: cloth, normalMap: clothNormal, normalScale: new THREE.Vector2(.35, .35) });
    const shorts = this.shorts = new THREE.MeshStandardMaterial({ color: role === 'taker' ? '#173c30' : role === 'keeper' ? '#242634' : '#1c2c42', roughness: 0.8, map: cloth });
    const trim = this.trim = material(role === 'keeper' ? '#292a37' : '#d3bf84', 0.6);
    const sock = new THREE.MeshStandardMaterial({ color: role === 'keeper' ? '#ffc149' : '#ecede5', roughness: 0.82, map: cloth });
    const boot = material(role === 'taker' ? '#e4f2dc' : '#ee7253', 0.32);
    const sole = material('#18242e', 0.48);
    const hair = this.hair = material(variation % 2 ? '#2a201a' : '#211e18', 0.9);
    const glove = material('#e4eff0', 0.55);
    const faceDark = material('#302524');
    const sclera = material('#f1ece2', 0.35);
    const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); m.castShadow = hi; parent.add(m); return m;
    };
    const sphereGeometry = (s: number) => new THREE.SphereGeometry(1, pick(Math.round(s * 2.2), 10), pick(Math.round(s * 1.6), 6));
    const sphere = (mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, s = 28) => {
      const m = mesh(sphereGeometry(s), mat, parent, x, y, z); m.scale.set(sx, sy, sz); return m;
    };
    const chest = new THREE.LatheGeometry([
      new THREE.Vector2(.163, -.26), new THREE.Vector2(.18, -.225), new THREE.Vector2(.179, -.12),
      new THREE.Vector2(.20, .035), new THREE.Vector2(.235, .17), new THREE.Vector2(.225, .22), new THREE.Vector2(.115, .265),
    ], pick(64, 14));
    this.torso = mesh(chest, jersey, this.body, 0, 1.18, 0);
    this.torso.scale.set(1.1, 1, .73);
    mesh(new THREE.CylinderGeometry(.181, .189, .19, pick(64, 12)), shorts, this.body, 0, .87, 0).scale.z = .77;
    mesh(new THREE.CylinderGeometry(.069, .079, .13, pick(48, 10)), skin, this.body, 0, 1.49, 0);
    const collar = mesh(new THREE.TorusGeometry(.086, .013, 8, pick(64, 12)), trim, this.body, 0, 1.449, 0);
    collar.rotation.x = Math.PI / 2;
    // Neck-to-chest V: a darker jersey insert reads as a real collar, not a flat cut.
    if (hi) mesh(new THREE.ConeGeometry(.07, .1, 28, 1, true), jersey, this.body, 0, 1.43, -.045).rotation.x = Math.PI;
    sphere(skin, this.body, 0, 1.655, -.006, .131, .178, .137, 32);
    const scalp = mesh(new THREE.SphereGeometry(.136, pick(48, 14), pick(28, 8), 0, Math.PI * 2, 0, 1.47), hair, this.body, 0, 1.685, .012);
    scalp.scale.set(1, .91, 1.01);
    sphere(hair, this.body, 0, 1.787, .002, .119, .065, .126, 24);
    sphere(skin, this.body, 0, 1.642, -.132, .027, .041, .035, 14);
    sphere(faceDark, this.body, 0, 1.584, -.117, .045, .008, .015, 12);
    this.beard = sphere(hair, this.body, 0, 1.565, -.078, .112, .089, .073, 20);
    this.beard.visible = false;
    if (hi) {
      // Pecs, hair fringe, and calf/quad volume so the body reads as an athlete, not a mannequin.
      for (const side of [-1, 1]) sphere(jersey, this.body, side * .085, 1.31, -.1, .085, .07, .06, 20);
      sphere(hair, this.body, 0, 1.735, -.095, .11, .04, .07, 16);
      // Nose and mouth give the face a readable profile instead of a blank capsule.
      sphere(skin, this.body, 0, 1.628, -.142, .018, .03, .02, 10);
      sphere(faceDark, this.body, 0, 1.598, -.131, .03, .006, .008, 10);
      // Shoulder caps and a dark brow line give the upper body volume and expression.
      for (const side of [-1, 1]) {
        sphere(jersey, this.body, side * .215, 1.39, 0, .092, .085, .09, 20);
        sphere(faceDark, this.body, side * .047, 1.635, -.139, .026, .006, .01, 12);
      }
    }
    for (const side of [-1, 1]) {
      sphere(skin, this.body, side * .132, 1.658, -.004, .027, .047, .030, 14);
      sphere(faceDark, this.body, side * .049, 1.684, -.126, .018, .009, .007, 12);
      sphere(hair, this.body, side * .049, 1.706, -.124, .023, .006, .009, 10);
      if (hi) {
        sphere(sclera, this.body, side * .049, 1.66, -.124, .017, .011, .008, 12);
        sphere(faceDark, this.body, side * .049, 1.66, -.13, .0095, .0095, .006, 10);
        sphere(faceDark, this.body, side * .049, 1.695, -.136, .024, .004, .008, 8);
        sphere(skin, this.body, side * .14, 1.66, -.012, .016, .03, .022, 10);
      }
      const leg = side === -1 ? this.leftLeg : this.rightLeg;
      const shin = side === -1 ? this.leftShin : this.rightShin;
      leg.position.set(side * .108, .84, 0); this.body.add(leg);
      mesh(new THREE.CylinderGeometry(.100, .083, .24, pick(48, 10)), shorts, leg, 0, -.11, 0);
      // Glute and quad mass under the shorts: the thigh reads as muscle, not a tube.
      if (hi) sphere(shorts, leg, 0, .02, -.02, .105, .09, .1, 20);
      mesh(new THREE.CapsuleGeometry(.075, .15, pick(6, 2), pick(28, 8)), skin, leg, 0, -.29, 0);
      shin.position.y = -.4; leg.add(shin);
      sphere(skin, shin, 0, -.005, -.007, .064, .067, .065, 20);
      if (hi) sphere(skin, shin, 0, -.2, .028, .074, .105, .072, 20);
      mesh(new THREE.CylinderGeometry(.065, .042, .3, pick(48, 10)), sock, shin, 0, -.16, 0);
      mesh(new THREE.CylinderGeometry(.066, .065, .022, pick(48, 10)), trim, shin, 0, -.037, 0).receiveShadow = true;
      const shoe = mesh(new THREE.CapsuleGeometry(.060, .15, pick(5, 2), pick(24, 8)), boot, shin, 0, -.36, -.067);
      shoe.rotation.x = Math.PI / 2; shoe.scale.z = .68;
      sphere(sole, shin, 0, -.393, -.065, .063, .018, .135, 14).receiveShadow = true;
      if (hi) for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(.058, .006, .009), sock, shin, 0, -.322, -.063 - i * .018);
      const arm = side === -1 ? this.leftArm : this.rightArm;
      arm.position.set(side * .238, 1.391, 0); this.body.add(arm);
      const sleeve = mesh(new THREE.CapsuleGeometry(.083, .085, pick(5, 2), pick(28, 8)), jersey, arm, 0, -.055, 0);
      sleeve.scale.z = .9;
      mesh(new THREE.CylinderGeometry(.079, .076, .019, pick(48, 10)), trim, arm, 0, -.147, 0);
      mesh(new THREE.CapsuleGeometry(.052, .245, pick(5, 2), pick(24, 8)), role === 'keeper' ? jersey : skin, arm, 0, -.292, -.025);
      const keeperHand = role === 'keeper';
      sphere(keeperHand ? glove : skin, arm, 0, -.50, -.046, keeperHand ? .084 : .046, keeperHand ? .106 : .066, .043, 16);
      sphere(keeperHand ? glove : skin, arm, side * .04, -.48, -.065, .025, .040, .025, 10);
      // Forearm belly and a thumb: the hand and the arm are not a single tube any more.
      if (hi) sphere(keeperHand ? jersey : skin, arm, 0, -.2, -.02, .056, .1, .052, 16);
      if (hi && !keeperHand) sphere(skin, arm, side * .034, -.478, -.062, .017, .03, .015, 10);
      if (hi && keeperHand) for (let f = 0; f < 4; f++) mesh(new THREE.CapsuleGeometry(.012, .05, 2, 6), glove, arm, (f - 1.5) * .03, -.575, -.05);
    }
    this.head.position.y = 1.49;
    for (const child of [...this.body.children]) {
      if (child instanceof THREE.Mesh && child.position.y > 1.52) {
        child.position.y -= 1.49;
        this.head.add(child);
      }
    }
    this.body.add(this.head);
    // Elbows carry the existing forearm/glove geometry; no extra surface detail is removed.
    for (const [arm, forearm] of [[this.leftArm, this.leftForearm], [this.rightArm, this.rightForearm]]) {
      forearm.position.y = -0.17;
      for (const child of [...arm.children]) {
        if (child.position.y < -0.17) { child.position.y += 0.17; forearm.add(child); }
      }
      arm.add(forearm);
    }
    this.numberPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(.30, .33),
      new THREE.MeshStandardMaterial({ map: numberTexture(number, role === 'taker' ? 'MASTER' : role === 'keeper' ? 'KEEPER' : 'UNITED', role === 'wall' ? '#15253a' : '#f8f1db'), transparent: true, depthWrite: false, roughness: .9 }),
    );
    this.numberPlate.position.set(0, 1.215, .172);
    this.body.add(this.numberPlate);
    mesh(new THREE.BoxGeometry(.047, .058, .009), trim, this.body, -.09, 1.325, -.164).rotation.z = .07;
    // Batch rigid pieces per articulated bone/material, retaining the animation pivots.
    this.body.traverse(object => {
      if (!(object instanceof THREE.Group)) return;
      const batches = new Map<THREE.Material, THREE.Mesh[]>();
      for (const child of [...object.children]) {
        if (!(child instanceof THREE.Mesh) || child === this.torso || child === this.numberPlate || child === this.beard || Array.isArray(child.material)) continue;
        const items = batches.get(child.material) || []; items.push(child); batches.set(child.material, items);
      }
      for (const [mat, items] of batches) {
        if (items.length < 2) continue;
        const geometries = items.map(item => { item.updateMatrix(); return item.geometry.clone().applyMatrix4(item.matrix); });
        const merged = new THREE.Mesh(mergeGeometries(geometries), mat); merged.castShadow = items[0].castShadow;
        object.add(merged);
        for (const item of items) { object.remove(item); item.geometry.dispose(); }
        geometries.forEach(geometry => geometry.dispose());
      }
    });
    this.animated = [this.body, this.head, this.torso, this.leftLeg, this.rightLeg, this.leftShin, this.rightShin, this.leftArm, this.rightArm, this.leftForearm, this.rightForearm];
    // Rigid surfaces never change their local transforms; only their parent joints animate.
    this.root.traverse(object => {
      if (object instanceof THREE.Mesh && object !== this.torso) {
        object.updateMatrix(); object.matrixAutoUpdate = false;
      }
    });
    this.idle(0);
  }

  setProfile(profile: TakerProfile) {
    const a = profile.appearance;
    this.skin.color.set(a.skin); this.jersey.color.set(a.shirt); this.shorts.color.set(a.shorts);
    this.trim.color.set(a.trim); this.hair.color.set(a.hair); this.beard.visible = a.beard;
    this.body.scale.set(1, a.height / 1.83, 1);
    const special = profile.edition === 'special';
    this.numberPlate.material.map = numberTexture(profile.number, profile.shortName, special ? '#082f31' : profile.id === 'messi' ? '#182b3d' : '#f5eddb');
    this.numberPlate.material.needsUpdate = true;
  }

  idle(time: number) { idlePose(this, time, this.role); }
  prepare(time: number, charge: number) { preparePose(this, time, charge); }
  run(phase: number, foot: Foot) { runPose(this, phase, foot); }
  followThrough(time: number, foot: Foot) { followThroughPose(this, time, foot); }
  react(outcome: Outcome, elapsed: number, shotTime: number, foot: Foot) { reactionPose(this, outcome, elapsed, shotTime, foot); }
  wallPose(jump: number, time: number) { wallPose(this, jump, time); }
  keeperPose(k: KeeperState, time: number, preparation = 0) { keeperPose(this, k, time, preparation); }
  keeperRecover(k: KeeperState, time: number, elapsed: number, outcome: Outcome) { keeperRecoveryPose(this, k, time, elapsed, outcome); }

  /** Math is evaluated on the high rig once. Copy the identical pose to the alternate LOD. */
  copyPose(source: Athlete) {
    for (let i = 0; i < this.animated.length; i++) {
      const from = source.animated[i], to = this.animated[i];
      to.position.copy(from.position);
      to.quaternion.copy(from.quaternion);
    }
  }

}

/**
 * An athlete with two rigs (high + low detail) under one THREE.LOD. three.js picks the level
 * per camera distance during render; pose math runs once and is copied to both rigs so
 * switching detail never shows a stale animation. Geometry and LOD distances are unchanged.
 */
export class Player {
  readonly group = new THREE.LOD();
  readonly shadow: THREE.Mesh;
  private readonly rigs: Athlete[];

  constructor(role: PlayerRole, number = 10, variation = 0) {
    const high = new Athlete(role, number, variation, 'high');
    const low = new Athlete(role, number, variation, 'low');
    this.rigs = [high, low];
    this.group.addLevel(high.root, 0);
    this.group.addLevel(low.root, athleteLodDistance);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = .025;
    this.group.add(this.shadow);
  }

  setProfile(profile: TakerProfile) { for (const rig of this.rigs) rig.setProfile(profile); }
  private syncPose() { this.rigs[1].copyPose(this.rigs[0]); }
  idle(time: number) { this.rigs[0].idle(time); this.syncPose(); }
  prepare(time: number, charge: number) { this.rigs[0].prepare(time, charge); this.syncPose(); }
  run(phase: number, foot: Foot) { this.rigs[0].run(phase, foot); this.syncPose(); }
  followThrough(time: number, foot: Foot) { this.rigs[0].followThrough(time, foot); this.syncPose(); }
  react(outcome: Outcome, elapsed: number, shotTime: number, foot: Foot) {
    this.rigs[0].react(outcome, elapsed, shotTime, foot); this.syncPose();
  }
  wallPose(jump: number, time: number) {
    this.rigs[0].wallPose(jump, time); this.syncPose();
    this.shadow.scale.setScalar(1 - jump * 0.3);
  }
  /** Body yaw in the goal; the arena turns it toward the shot's angle. Facing the spot is PI. */
  yaw = Math.PI;
  keeperPose(k: KeeperState, time: number, preparation = 0) {
    this.group.position.x = k.x;
    this.group.rotation.y = this.yaw;
    this.rigs[0].keeperPose(k, time, preparation); this.syncPose();
  }
  keeperRecover(k: KeeperState, time: number, elapsed: number, outcome: Outcome) {
    this.group.position.x = k.x;
    this.group.rotation.y = this.yaw;
    this.rigs[0].keeperRecover(k, time, elapsed, outcome); this.syncPose();
  }

}

export function makeFootball(): THREE.Mesh {
  // Original triangular panel pattern in navy, turquoise and white, drawn in UV space.
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f7f9f6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cols = 16, rows = 8, cw = canvas.width / cols, rh = canvas.height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw, y = r * rh;
      const up = (r + c) % 2 === 0;
      const triangles = up ? [[x, y + rh, x + cw / 2, y, x + cw, y + rh]] : [[x, y, x + cw, y, x + cw / 2, y + rh]];
      const colour = (r * 3 + c * 5) % 7 === 0 ? '#2fd8c8' : (r * 7 + c) % 4 === 0 ? '#0e2a44' : '#f7f9f6';
      for (const [ax, ay, bx, by, cx, cy] of triangles) {
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath();
        ctx.fillStyle = colour; ctx.fill();
        ctx.strokeStyle = '#1b2a36'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 64, 48), new THREE.MeshStandardMaterial({ map: texture, normalMap: normalMapFromCanvas(canvas, 1.5), normalScale: new THREE.Vector2(.25, .25), roughness: 0.4 }));
  ball.castShadow = true;
  return ball;
}
