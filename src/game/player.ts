import * as THREE from 'three';
import { footballSurface } from './ball-surface';
import { normalMapFromCanvas } from './pbr';
import type { KeeperState } from './keeper';
import type { Contact, Foot, Outcome } from './physics';
import { idlePose, preparePose, runPose, followThroughPose, reactionPose, wallPose, keeperPose, keeperRecoveryPose, type PlayerRole, type MotionRig } from './animation';
export type { PlayerRole } from './animation';
import type { TakerProfile } from '../players';
import { athleteModel, fitStature, hairGeometry, JOINTS, type AthleteMaterials, type Detail, type RigRoot } from './athlete-model';
import { kitDesign, playerLook, type HairStyle } from './appearance';
import { kitTexture } from './kits';
import { faceShape, identitySurfaces, personaliseFace } from './identity';
export type { Detail } from './athlete-model';

/** Same transition distance; long lenses use camera zoom-aware distance for selection. */
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


function materialsFor(role: PlayerRole, variation: number): AthleteMaterials {
  const cloth = knit();
  const mat = (name: string, color: string, roughness: number, textured = false) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, vertexColors: true,
      map: textured ? cloth : null, normalMap: textured ? knitNormalMap : null,
      normalScale: new THREE.Vector2(.07, .07) });
    m.name = name; return m;
  };
  return {
    skin: mat('skin', skinColors[variation % skinColors.length], .64),
    sleeve: mat('sleeve', role === 'taker' ? '#a92332' : role === 'keeper' ? '#e9af38' : '#eaeeeb', .85, true),
    jersey: mat('jersey', role === 'taker' ? '#a92332' : role === 'keeper' ? '#e9af38' : '#eaeeeb', .85, true),
    shorts: mat('shorts', role === 'taker' ? '#193e33' : '#1e2e43', .87, true),
    trim: mat('trim', role === 'keeper' ? '#23354a' : '#b9a66b', .8),
    sock: mat('sock', role === 'keeper' ? '#e9ad34' : '#e5e9e2', .9, true),
    boot: mat('boot', role === 'taker' ? '#d9e6dc' : '#df754c', .43),
    sole: mat('sole', '#1b2730', .68), hair: mat('hair', variation % 2 ? '#30231b' : '#211c19', .93),
    glove: mat('glove', '#e1ebe4', .72), eyes: mat('eyes', '#ded8ce', .28), iris: mat('iris', '#312822', .3),
  };
}

class Athlete implements MotionRig {
  readonly root: RigRoot;
  readonly body: THREE.Object3D; readonly head: THREE.Object3D; readonly torso: THREE.Object3D;
  readonly leftFoot: THREE.Object3D; readonly rightFoot: THREE.Object3D;
  readonly leftLeg: THREE.Object3D; readonly rightLeg: THREE.Object3D;
  readonly leftShin: THREE.Object3D; readonly rightShin: THREE.Object3D;
  readonly leftArm: THREE.Object3D; readonly rightArm: THREE.Object3D;
  readonly leftForearm: THREE.Object3D; readonly rightForearm: THREE.Object3D;
  private readonly animated: THREE.Object3D[];
  private readonly hairMesh: THREE.Mesh;
  private hairStyle: HairStyle = 'crop';
  private identityId = '';
  private stance: 'ronaldo' | 'neymar' | 'neutral' = 'neutral';

  constructor(readonly role: PlayerRole, readonly detail: Detail, materials: AthleteMaterials) {
    this.root = athleteModel(role, detail, materials);
    fitStature(this.root, role === 'keeper' ? 1.90 : 1.83);
    this.body = this.root.getObjectByName('body')!; this.head = this.root.getObjectByName('head')!;
    this.torso = this.root.getObjectByName('torso')!;
    this.leftLeg = this.root.getObjectByName('leftLeg')!; this.rightLeg = this.root.getObjectByName('rightLeg')!;
    this.leftShin = this.root.getObjectByName('leftShin')!; this.rightShin = this.root.getObjectByName('rightShin')!;
    this.leftArm = this.root.getObjectByName('leftArm')!; this.rightArm = this.root.getObjectByName('rightArm')!;
    this.leftForearm = this.root.getObjectByName('leftForearm')!; this.rightForearm = this.root.getObjectByName('rightForearm')!;
    this.leftFoot = this.root.getObjectByName('leftFoot')!; this.rightFoot = this.root.getObjectByName('rightFoot')!;
    this.animated = JOINTS.map(name => this.root.getObjectByName(name)!);
    this.hairMesh = new THREE.Mesh(hairGeometry(this.hairStyle, detail), materials.hair);
    this.hairMesh.name = 'hairstyle'; this.hairMesh.castShadow = detail === 'high'; this.hairMesh.receiveShadow = true;
    this.hairMesh.matrixAutoUpdate = false;
    this.root.getObjectByName('hairMount')!.add(this.hairMesh);
    this.idle(0);
  }

  setProfile(profile: TakerProfile) {
    const look = playerLook(profile);
    if (look.hair !== this.hairStyle) {
      this.hairStyle = look.hair;
      this.hairMesh.geometry = hairGeometry(look.hair, this.detail);
    }
    this.root.getObjectByName('beard')!.visible = look.beard;
    this.root.getObjectByName('features')!.scale.set(look.width, 1, look.jaw);
    if (this.identityId !== profile.baseId) {
      personaliseFace(this.root.getObjectByName('features')!, profile);
      this.identityId = profile.baseId;
    }
    fitStature(this.root, profile.appearance.height);
    // fitStature sets a uniform scale; apply athletic build AFTER it, not before it.
    this.body.scale.x *= faceShape(profile).build;
    this.stance = profile.baseId === 'ronaldo' || profile.baseId === 'neymar' ? profile.baseId : 'neutral';
  }
  copyPose(source: Athlete) {
    for (let i = 0; i < this.animated.length; i++) {
      this.animated[i].position.copy(source.animated[i].position);
      this.animated[i].quaternion.copy(source.animated[i].quaternion);
    }
  }
  idle(time: number) { idlePose(this, time, this.role, this.stance); }
  prepare(time: number, charge: number) { preparePose(this, time, charge, this.stance); }
  run(phase: number, foot: Foot, contact?: Contact) { runPose(this, phase, foot, contact); }
  followThrough(time: number, foot: Foot, contact?: Contact) { followThroughPose(this, time, foot, contact); }
  react(outcome: Outcome, elapsed: number, shotTime: number, foot: Foot, contact?: Contact) { reactionPose(this, outcome, elapsed, shotTime, foot, contact); }
  wallPose(jump: number, time: number) { wallPose(this, jump, time); }
  keeperPose(k: KeeperState, time: number, preparation = 0) { keeperPose(this, k, time, preparation); }
  keeperRecover(k: KeeperState, time: number, elapsed: number, outcome: Outcome) { keeperRecoveryPose(this, k, time, elapsed, outcome); }
}

/** Articulated anatomical models; opaque shared surfaces and one pose evaluation per player. */
export class Player {
  readonly group = new THREE.LOD();
  readonly shadow: THREE.Mesh;
  private readonly rigs: Athlete[];
  private readonly materials: AthleteMaterials;
  private profileId = '';
  private readonly strikePoint = new THREE.Vector3();
  yaw = Math.PI;

  constructor(role: PlayerRole, _number = 10, variation = 0) {
    this.materials = materialsFor(role, variation);
    this.rigs = [new Athlete(role, 'high', this.materials), new Athlete(role, 'low', this.materials)];
    this.group.addLevel(this.rigs[0].root, 0); this.group.addLevel(this.rigs[1].root, athleteLodDistance);
    // Visibility must be decided before matrix propagation, not during renderer traversal.
    this.group.autoUpdate = false;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .85), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = .025; this.group.add(this.shadow);
  }
  setProfile(profile: TakerProfile) {
    if (this.profileId === profile.id) return;
    this.profileId = profile.id;
    const a = profile.appearance, kit = kitDesign(profile), m = this.materials;
    const hadIdentityMaps = !!m.skin.map;
    const surface = identitySurfaces(profile);
    m.skin.map = surface.skin; m.skin.normalMap = surface.pores; m.skin.normalScale.set(.1, .1);
    m.skin.roughness = .58; m.skin.roughnessMap = surface.skin;
    m.hair.map = surface.hair; m.hair.normalMap = surface.strands; m.hair.normalScale.set(.25, .25); m.hair.roughness = .78;
    // The first application adds map defines; subsequent profile changes reuse the same shaders.
    if (!hadIdentityMaps) { m.skin.needsUpdate = true; m.hair.needsUpdate = true; }
    m.iris.color.set(['haaland', 'debruyne', 'foden', 'griezmann', 'kane'].includes(profile.baseId) ? '#566b71' : '#3e2d20');
    m.skin.color.set(a.skin); m.hair.color.set(a.hair); m.trim.color.set(kit.trim); m.sleeve.color.set(kit.base);
    m.shorts.color.set(kit.shorts); m.sock.color.set(kit.socks);
    m.jersey.color.set('#ffffff'); m.jersey.map = kitTexture(profile);
    // All jerseys already have a map: changing map contents needs no shader recompile.
    for (const rig of this.rigs) rig.setProfile(profile);
    this.group.userData.appearance = { player: profile.baseId, hair: playerLook(profile).hair, kit: kit.pattern, nation: kit.code };
  }
  /** Final plant correction: the rotated outside/inside boot must still meet the ball. */
  alignStrike(foot: Foot, ball: { x: number; z: number }, blend: number) {
    if (blend <= 0) return;
    const ankle = foot === 'right' ? this.rigs[0].rightFoot : this.rigs[0].leftFoot;
    ankle.localToWorld(this.strikePoint.set(0, -.02, -.12));
    this.group.position.x += (ball.x - this.strikePoint.x) * blend;
    this.group.position.z += (ball.z + .09 - this.strikePoint.z) * blend;
  }
  updateLod(camera: THREE.Camera) {
    if (!this.group.visible) return;
    this.group.updateWorldMatrix(true, false);
    this.group.update(camera);
  }
  private syncPose() { this.rigs[1].copyPose(this.rigs[0]); }
  idle(time: number) { this.rigs[0].idle(time); this.syncPose(); }
  prepare(time: number, charge: number) { this.rigs[0].prepare(time, charge); this.syncPose(); }
  run(phase: number, foot: Foot, contact?: Contact) { this.rigs[0].run(phase, foot, contact); this.syncPose(); }
  followThrough(time: number, foot: Foot, contact?: Contact) { this.rigs[0].followThrough(time, foot, contact); this.syncPose(); }
  react(outcome: Outcome, elapsed: number, shotTime: number, foot: Foot, contact?: Contact) { this.rigs[0].react(outcome, elapsed, shotTime, foot, contact); this.syncPose(); }
  wallPose(jump: number, time: number) { this.rigs[0].wallPose(jump, time); this.syncPose(); this.shadow.scale.setScalar(1 - jump * .3); }
  keeperPose(k: KeeperState, time: number, preparation = 0) {
    this.group.position.x = k.x; this.group.rotation.y = this.yaw;
    this.rigs[0].keeperPose(k, time, preparation); this.syncPose();
  }
  keeperRecover(k: KeeperState, time: number, elapsed: number, outcome: Outcome) {
    this.group.position.x = k.x; this.group.rotation.y = this.yaw;
    this.rigs[0].keeperRecover(k, time, elapsed, outcome); this.syncPose();
  }
}

export function makeFootball(): THREE.Mesh {
  const canvas = document.createElement('canvas'), relief = document.createElement('canvas');
  canvas.width = relief.width = 512; canvas.height = relief.height = 256;
  const surface = footballSurface();
  canvas.getContext('2d')!.putImageData(new ImageData(surface.color, 512, 256), 0, 0);
  relief.getContext('2d')!.putImageData(new ImageData(surface.relief, 512, 256), 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 48, 32), new THREE.MeshStandardMaterial({ map: texture, normalMap: normalMapFromCanvas(relief, 1.5), normalScale: new THREE.Vector2(.25, .25), roughness: 0.58 }));
  ball.castShadow = true;
  return ball;
}
