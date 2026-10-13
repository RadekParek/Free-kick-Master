import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { KeeperState } from './keeper';
import type { Foot } from './physics';
import type { TakerProfile } from '../players';

export type PlayerRole = 'taker' | 'wall' | 'keeper';
const skinColors = ['#b77952', '#704936', '#ce9b73', '#906344', '#dfb18b'];
const sharedSphere = new THREE.SphereGeometry(1, 20, 16);
const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = shadowCanvas.height = 64;
const shadowCtx = shadowCanvas.getContext('2d')!;
const shadowGradient = shadowCtx.createRadialGradient(32, 32, 3, 32, 32, 32);
shadowGradient.addColorStop(0, 'rgba(3,9,12,0.5)');
shadowGradient.addColorStop(1, 'rgba(3,9,12,0)');
shadowCtx.fillStyle = shadowGradient;
shadowCtx.fillRect(0, 0, 64, 64);
const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
const material = (color: string, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
function numberTexture(number: number, name: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color; ctx.textAlign = 'center';
  ctx.font = '600 28px "Barlow Condensed", sans-serif';
  ctx.fillText(name.toUpperCase(), 128, 42);
  ctx.font = '600 160px "Barlow Condensed", sans-serif';
  ctx.fillText(String(number), 128, 205);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Original articulated athletes: smooth anatomy and national-colour training kits, not scans. */
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
  private readonly beard: THREE.Mesh;
  private readonly numberPlate: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly skin: THREE.MeshStandardMaterial;
  private readonly jersey: THREE.MeshStandardMaterial;
  private readonly shorts: THREE.MeshStandardMaterial;
  private readonly trim: THREE.MeshStandardMaterial;
  private readonly hair: THREE.MeshStandardMaterial;

  constructor(private role: PlayerRole, number = 10, variation = 0) {
    this.group.add(this.body);
    const skin = this.skin = material(skinColors[variation % skinColors.length], 0.66);
    const jersey = this.jersey = material(role === 'taker' ? '#b72b39' : role === 'keeper' ? '#ffbb3b' : '#ecedf0', 0.86);
    const shorts = this.shorts = material(role === 'taker' ? '#173c30' : role === 'keeper' ? '#242634' : '#1c2c42');
    const trim = this.trim = material(role === 'keeper' ? '#292a37' : '#d3bf84');
    const sock = material(role === 'keeper' ? '#ffc149' : '#ecede5');
    const boot = material(role === 'taker' ? '#e4f2dc' : '#ee7253', 0.38);
    const sole = material('#18242e', 0.48);
    const hair = this.hair = material(variation % 2 ? '#2a201a' : '#211e18', 0.95);
    const glove = material('#e4eff0', 0.65);
    const faceDark = material('#302524');
    const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
    };
    const sphere = (mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = mesh(sharedSphere.clone(), mat, parent, x, y, z); m.scale.set(sx, sy, sz); return m;
    };
    const chest = new THREE.LatheGeometry([
      new THREE.Vector2(.163,-.26), new THREE.Vector2(.18,-.225), new THREE.Vector2(.179,-.12),
      new THREE.Vector2(.20,.035), new THREE.Vector2(.235,.17), new THREE.Vector2(.225,.22), new THREE.Vector2(.115,.265),
    ], 24);
    this.torso = mesh(chest, jersey, this.body, 0, 1.18, 0);
    this.torso.scale.set(1.1, 1, .73);
    const hips = mesh(new THREE.CylinderGeometry(.181, .189, .19, 20), shorts, this.body, 0, .87, 0); hips.scale.z = .77;
    mesh(new THREE.CylinderGeometry(.069,.079,.13,16), skin, this.body, 0,1.49,0);
    const collar = mesh(new THREE.TorusGeometry(.086,.013,8,24), trim, this.body, 0,1.449,0); collar.rotation.x = Math.PI/2;
    sphere(skin,this.body,0,1.655,-.006,.131,.178,.137);
    const scalp = mesh(new THREE.SphereGeometry(.136,24,16,0,Math.PI*2,0,1.47),hair,this.body,0,1.685,.012); scalp.scale.set(1, .91, 1.01);
    sphere(hair,this.body,0,1.787,.002,.119,.065,.126);
    sphere(skin,this.body,0,1.642,-.132,.027,.041,.035);
    sphere(faceDark,this.body,0,1.584,-.117,.045,.008,.015);
    this.beard = sphere(hair,this.body,0,1.565,-.078,.112,.089,.073); this.beard.visible = false;
    for (const side of [-1,1]) {
      sphere(skin,this.body,side*.132,1.658,-.004,.027,.047,.030);
      sphere(faceDark,this.body,side*.049,1.684,-.126,.018,.009,.007);
      sphere(hair,this.body,side*.049,1.706,-.124,.023,.006,.009);
      const leg = side === -1 ? this.leftLeg : this.rightLeg;
      const shin = side === -1 ? this.leftShin : this.rightShin;
      leg.position.set(side*.108,.84,0); this.body.add(leg);
      mesh(new THREE.CylinderGeometry(.100,.083,.24,16),shorts,leg,0,-.11,0);
      mesh(new THREE.CapsuleGeometry(.075,.15,5,14),skin,leg,0,-.29,0);
      shin.position.y=-.4; leg.add(shin);
      sphere(skin,shin,0,-.005,-.007,.064,.067,.065);
      mesh(new THREE.CylinderGeometry(.065,.042,.3,16),sock,shin,0,-.16,0);
      const band=mesh(new THREE.CylinderGeometry(.066,.065,.022,16),trim,shin,0,-.037,0);
      band.receiveShadow=true;
      const shoe=mesh(new THREE.CapsuleGeometry(.060,.15,5,16),boot,shin,0,-.36,-.067);
      shoe.rotation.x=Math.PI/2; shoe.scale.z=.68;
      const outsole=sphere(sole,shin,0,-.393,-.065,.063,.018,.135);
      outsole.receiveShadow=true;
      for(let i=0;i<3;i++) mesh(new THREE.BoxGeometry(.058,.006,.009),sock,shin,0,-.322,-.063-i*.018);
      const arm=side===-1?this.leftArm:this.rightArm;
      arm.position.set(side*.238,1.391,0); this.body.add(arm);
      const sleeve=mesh(new THREE.CapsuleGeometry(.083,.085,5,14),jersey,arm,0,-.055,0); sleeve.scale.z=.9;
      mesh(new THREE.CylinderGeometry(.079,.076,.019,16),trim,arm,0,-.147,0);
      mesh(new THREE.CapsuleGeometry(.052,.245,5,14),role==='keeper'?jersey:skin,arm,0,-.292,-.025);
      sphere(role==='keeper'?glove:skin,arm,0,-.50,-.046,role==='keeper'?.084:.046,role==='keeper'?.106:.066,.043);
      sphere(role==='keeper'?glove:skin,arm,side*.04,-.48,-.065,.025,.040,.025);
    }
    this.numberPlate = new THREE.Mesh(new THREE.PlaneGeometry(.30,.33),new THREE.MeshStandardMaterial({map:numberTexture(number,role==='taker'?'MASTER':role==='keeper'?'KEEPER':'UNITED',role==='wall'?'#15253a':'#f8f1db'),transparent:true,depthWrite:false,roughness:.9}));
    this.numberPlate.position.set(0,1.215,.172); this.body.add(this.numberPlate);
    const crest=mesh(new THREE.BoxGeometry(.047,.058,.009),trim,this.body,-.09,1.325,-.164); crest.rotation.z=.07;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.35,1),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}));
    this.shadow.rotation.x=-Math.PI/2; this.shadow.position.y=.025; this.group.add(this.shadow);
    // Batch rigid pieces per articulated bone/material, retaining the animation pivots.
    this.body.traverse(object => {
      if (!(object instanceof THREE.Group)) return;
      const batches = new Map<THREE.Material,THREE.Mesh[]>();
      for(const child of [...object.children]) {
        if(!(child instanceof THREE.Mesh) || child===this.torso || child===this.numberPlate || child===this.beard || Array.isArray(child.material)) continue;
        const items=batches.get(child.material)||[]; items.push(child); batches.set(child.material,items);
      }
      for(const [mat,items] of batches) {
        if(items.length<2) continue;
        const geometries=items.map(item=>{item.updateMatrix();return item.geometry.clone().applyMatrix4(item.matrix);});
        const merged=new THREE.Mesh(mergeGeometries(geometries),mat); merged.castShadow=true;
        object.add(merged);
        for(const item of items){object.remove(item);item.geometry.dispose();}
        geometries.forEach(geometry=>geometry.dispose());
      }
    });
    this.idle(0);
  }

  setProfile(profile: TakerProfile) {
    const a=profile.appearance;
    this.skin.color.set(a.skin); this.jersey.color.set(a.shirt); this.shorts.color.set(a.shorts);
    this.trim.color.set(a.trim); this.hair.color.set(a.hair); this.beard.visible=a.beard;
    this.body.scale.set(1,a.height/1.83,1);
    this.numberPlate.material.map?.dispose();
    this.numberPlate.material.map=numberTexture(profile.number,profile.shortName,profile.id==='messi'?'#182b3d':'#f5eddb');
    this.numberPlate.material.needsUpdate=true;
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
      const angle = k.direction * k.dive * 0.94;
      this.body.rotation.z = angle;
      this.body.position.set(Math.sin(angle), 0.9 + (k.glove.y - 1.1) * 0.35 - Math.cos(angle), 0);
      this.leftArm.rotation.z = -k.direction * 2.3;
      this.rightArm.rotation.z = -k.direction * 2.15;
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
      ctx.fillStyle = (row + col * 2) % 3 === 0 ? '#101f31' : (row + col) % 4 === 0 ? '#90bbdc' : '#f0f0df';
      ctx.fill();
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 24), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.4 }));
  ball.castShadow = true;
  return ball;
}
