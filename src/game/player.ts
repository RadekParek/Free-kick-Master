import * as THREE from 'three';
import type { KeeperState } from './keeper';
import type { Foot } from './physics';

export type PlayerRole = 'taker' | 'wall' | 'keeper';
const skinColors = ['#b77952', '#704936', '#ce9b73', '#906344', '#dfb18b'];
const sharedSphere = new THREE.SphereGeometry(1, 12, 10);
const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = shadowCanvas.height = 64;
const shadowCtx = shadowCanvas.getContext('2d')!;
const shadowGradient = shadowCtx.createRadialGradient(32, 32, 3, 32, 32, 32);
shadowGradient.addColorStop(0, 'rgba(5,19,10,0.4)');
shadowGradient.addColorStop(1, 'rgba(5,19,10,0)');
shadowCtx.fillStyle = shadowGradient;
shadowCtx.fillRect(0, 0, 64, 64);
const shadowTexture = new THREE.CanvasTexture(shadowCanvas);

function material(color: string) { return new THREE.MeshStandardMaterial({ color, roughness: 0.88 }); }
function numberTexture(number: number, role: PlayerRole) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = role === 'taker' ? '#182e23' : '#e7eadb';
  ctx.font = 'bold 18px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(role === 'taker' ? 'MASTER' : role === 'keeper' ? 'KEEPER' : 'UNITED', 64, 23);
  ctx.font = '700 80px "Barlow Condensed", sans-serif';
  ctx.fillText(String(number), 64, 98);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Original articulated player meshes. No licensed athletes, kits, scans, or animations. */
export class Player {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  readonly shadow: THREE.Mesh;
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly leftShin = new THREE.Group();
  private readonly rightShin = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly torso: THREE.Mesh;
  private role: PlayerRole;

  constructor(role: PlayerRole, number = 10, variation = 0) {
    this.role = role;
    this.group.add(this.body);
    const skin = material(skinColors[variation % skinColors.length]);
    const jersey = material(role === 'taker' ? '#b8ef79' : role === 'keeper' ? '#ffb541' : '#243746');
    const shorts = material(role === 'taker' ? '#21342d' : role === 'keeper' ? '#ec9a32' : '#273747');
    const sock = material(role === 'taker' ? '#e3e7d2' : role === 'keeper' ? '#eab253' : '#2b3e49');
    const boot = material(role === 'taker' ? '#eff2e4' : role === 'keeper' ? '#273a35' : '#ef9a68');
    const hair = material(variation % 2 ? '#2a201a' : '#211e18');
    const glove = material('#e6edcf');
    const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geometry, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    this.torso = mesh(new THREE.CylinderGeometry(0.225, 0.175, 0.52, 10), jersey, this.body, 0, 1.18, 0);
    this.torso.scale.set(1.23, 1, 0.75);
    const hips = mesh(new THREE.CylinderGeometry(0.19, 0.195, 0.2, 12), shorts, this.body, 0, 0.87, 0);
    hips.rotation.z = 0.015;
    hips.scale.z = 0.72;
    mesh(new THREE.CylinderGeometry(0.071, 0.09, 0.12, 8), skin, this.body, 0, 1.5, 0);
    const head = mesh(sharedSphere, skin, this.body, 0, 1.65, -0.01);
    head.scale.set(0.137, 0.177, 0.137);
    const scalp = mesh(new THREE.SphereGeometry(0.141, 12, 8, 0, Math.PI * 2, 0, 1.6), hair, this.body, 0, 1.68, 0.002);
    scalp.scale.set(1, 0.98, 1);
    const nose = mesh(new THREE.BoxGeometry(0.04, 0.055, 0.06), skin, this.body, 0, 1.645, -0.133);
    nose.rotation.x = -0.1;
    for (const side of [-1, 1]) {
      const leg = side === -1 ? this.leftLeg : this.rightLeg;
      const shin = side === -1 ? this.leftShin : this.rightShin;
      leg.position.set(side * 0.115, 0.84, 0);
      this.body.add(leg);
      mesh(new THREE.CylinderGeometry(0.106, 0.087, 0.26, 8), shorts, leg, 0, -0.12, 0);
      mesh(new THREE.CylinderGeometry(0.08, 0.061, 0.23, 8), skin, leg, 0, -0.285, 0);
      shin.position.y = -0.4;
      leg.add(shin);
      mesh(new THREE.CylinderGeometry(0.067, 0.043, 0.3, 8), sock, shin, 0, -0.16, 0);
      const shoe = mesh(new THREE.CapsuleGeometry(0.064, 0.145, 3, 8), boot, shin, 0, -0.36, -0.065);
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.z = 0.65;
      const arm = side === -1 ? this.leftArm : this.rightArm;
      arm.position.set(side * 0.255, 1.39, 0);
      this.body.add(arm);
      mesh(new THREE.CylinderGeometry(0.094, 0.078, 0.2, 8), jersey, arm, 0, -0.055, 0);
      mesh(new THREE.CapsuleGeometry(0.06, 0.27, 3, 6), role === 'keeper' ? jersey : skin, arm, 0, -0.29, -0.02);
      const hand = mesh(sharedSphere, role === 'keeper' ? glove : skin, arm, 0, -0.51, -0.035);
      hand.scale.set(role === 'keeper' ? 0.087 : 0.052, role === 'keeper' ? 0.112 : 0.071, 0.055);
    }
    const backNumber = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ map: numberTexture(number, role), transparent: true, depthWrite: false }));
    backNumber.position.set(0, 1.21, 0.166);
    this.body.add(backNumber);
    // Small original front crest and a contrasting collar.
    mesh(new THREE.BoxGeometry(0.046, 0.063, 0.015), material(role === 'taker' ? '#233b2b' : '#ccdf9c'), this.body, -0.09, 1.31, -0.168);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.025;
    this.group.add(this.shadow);
    this.idle(0);
  }

  idle(time: number) {
    this.body.position.set(0, Math.sin(time * 2.2) * 0.007, 0);
    this.body.rotation.set(0, 0, 0);
    this.leftLeg.rotation.set(0.03, 0, -0.03);
    this.rightLeg.rotation.set(-0.04, 0, 0.03);
    this.leftShin.rotation.x = 0;
    this.rightShin.rotation.x = 0;
    this.leftArm.rotation.set(-0.12, 0, -0.16);
    this.rightArm.rotation.set(0.07, 0, 0.16);
    if (this.role === 'wall') {
      this.leftArm.rotation.x = -0.25;
      this.rightArm.rotation.x = -0.25;
      this.leftArm.rotation.z = -0.32;
      this.rightArm.rotation.z = 0.32;
    }
    this.torso.rotation.z = Math.sin(time * 1.4) * 0.012;
  }

  run(phase: number, foot: Foot) {
    const swing = Math.sin(phase * Math.PI * 4.5);
    this.body.position.y = Math.abs(swing) * 0.045;
    this.body.rotation.x = -0.09;
    this.leftLeg.rotation.x = swing * 0.62;
    this.rightLeg.rotation.x = -swing * 0.62;
    this.leftShin.rotation.x = Math.min(0, -swing) * 0.5;
    this.rightShin.rotation.x = Math.min(0, swing) * 0.5;
    this.leftArm.rotation.x = -swing * 0.5;
    this.rightArm.rotation.x = swing * 0.5;
    this.leftArm.rotation.z = -0.25;
    this.rightArm.rotation.z = 0.25;
    if (phase > 0.67) {
      const kick = (phase - 0.67) / 0.33;
      const strikingLeg = foot === 'right' ? this.rightLeg : this.leftLeg;
      const supportLeg = foot === 'right' ? this.leftLeg : this.rightLeg;
      strikingLeg.rotation.x = -0.8 + kick * 2.2;
      supportLeg.rotation.x = -0.04;
      this.leftShin.rotation.x = 0;
      this.rightShin.rotation.x = 0;
      this.leftArm.rotation.z = -0.85;
      this.rightArm.rotation.z = 0.65;
      this.body.rotation.z = foot === 'right' ? 0.12 : -0.12;
    }
  }

  followThrough(time: number, foot: Foot) {
    const settle = Math.max(0, 1 - time * 1.8);
    this.idle(time);
    const strikingLeg = foot === 'right' ? this.rightLeg : this.leftLeg;
    strikingLeg.rotation.x = settle * 1.25;
    this.leftArm.rotation.z = -0.16 - settle * 0.7;
    this.rightArm.rotation.z = 0.16 + settle * 0.5;
    this.body.rotation.x = -0.1 * settle;
  }

  wallPose(jump: number, time: number) {
    this.idle(time);
    this.body.position.y = jump;
    this.leftArm.rotation.x = -0.35;
    this.rightArm.rotation.x = -0.35;
    this.shadow.scale.setScalar(1 - jump * 0.3);
  }

  keeperPose(k: KeeperState, time: number) {
    this.group.position.x = k.x;
    this.group.rotation.y = Math.PI;
    this.idle(time);
    if (k.dive > 0) {
      this.body.position.y = Math.max(-0.3, (k.glove.y - 1.2) * 0.45) + Math.sin(k.dive * Math.PI) * 0.12;
      this.body.rotation.z = k.direction * k.dive * 0.94;
      this.leftArm.rotation.z = -1.5 - k.direction * 0.5;
      this.rightArm.rotation.z = 1.5 - k.direction * 0.5;
      this.leftLeg.rotation.z = -0.22;
      this.rightLeg.rotation.z = 0.26;
      this.leftLeg.rotation.x = k.dive * 0.2;
      this.rightLeg.rotation.x = -k.dive * 0.3;
    } else {
      this.body.position.y = -0.065 + Math.sin(time * 3) * 0.012;
      this.leftLeg.rotation.x = -0.18;
      this.rightLeg.rotation.x = -0.18;
      this.leftShin.rotation.x = 0.18;
      this.rightShin.rotation.x = 0.18;
      this.leftArm.rotation.z = -0.5;
      this.rightArm.rotation.z = 0.5;
      this.leftArm.rotation.x = -0.35;
      this.rightArm.rotation.x = -0.35;
    }
  }
}

export function makeFootball(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f8f5e5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#83978d';
  ctx.lineWidth = 3;
  const size = 80;
  for (let row = -1; row < 6; row++) {
    for (let col = -1; col < 10; col++) {
      const x = col * size * 1.5;
      const y = row * size * 1.73 + (col % 2) * size * 0.865;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i;
        const px = x + Math.cos(angle) * size;
        const py = y + Math.sin(angle) * size;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = (row + col * 2) % 3 === 0 ? '#20382e' : (row + col) % 4 === 0 ? '#c1e09a' : '#f0f0df';
      ctx.fill();
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 24), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5 }));
  ball.castShadow = true;
  return ball;
}
