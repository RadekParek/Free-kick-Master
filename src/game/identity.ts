import * as THREE from 'three';
import type { TakerProfile } from '../players';
import { normalMapFromCanvas } from './pbr';

/** Small, bounded, offline texture atlas cache. No photo projection, celebrity scans or extra render pass. */
interface Surfaces { skin: THREE.CanvasTexture; pores: THREE.CanvasTexture; hair: THREE.CanvasTexture; strands: THREE.CanvasTexture }
const cache = new Map<string, Surfaces>();
export function identitySeed(id: string): number {
  let n = 2166136261;
  for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function identitySurfaces(profile: TakerProfile): Surfaces {
  const old = cache.get(profile.baseId);
  if (old) { cache.delete(profile.baseId); cache.set(profile.baseId, old); return old; }
  let seed = identitySeed(profile.baseId);
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const canvas = () => { const c = document.createElement('canvas'); c.width = c.height = 128; return c; };
  const skin = canvas(), hair = canvas();
  const ctx = skin.getContext('2d')!, hc = hair.getContext('2d')!;
  ctx.fillStyle = '#f9f4f0'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2200; i++) {
    const tint = 220 + Math.floor(random() * 30);
    ctx.fillStyle = `rgba(${tint},${tint - 3},${tint - 5},.22)`;
    ctx.fillRect(random() * 128, random() * 128, .5 + random(), .5 + random());
  }
  hc.fillStyle = '#ddd9d3'; hc.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 180; i++) {
    hc.strokeStyle = `rgba(${random() > .5 ? '255,252,238' : '60,49,39'},${.12 + random() * .2})`;
    hc.lineWidth = .35 + random() * .6;
    const x = random() * 128;
    hc.beginPath(); hc.moveTo(x, 0); hc.bezierCurveTo(x + 6, 40, x - 5, 90, x + 2, 128); hc.stroke();
  }
  const texture = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 2; return t;
  };
  const surfaces = { skin: texture(skin), pores: normalMapFromCanvas(skin, 1), hair: texture(hair), strands: normalMapFromCanvas(hair, 1.6) };
  cache.set(profile.baseId, surfaces);
  if (cache.size > 6) {
    const first = cache.keys().next().value!;
    for (const t of Object.values(cache.get(first)!)) t.dispose();
    cache.delete(first);
  }
  return surfaces;
}

const FACE_SHAPES: Record<string, [number, number, number, number, number?]> = {
  'roberto-carlos': [.008, 1.10, 1.12, 1.15, 1.04], ronaldinho: [.009, 1.17, 1.02, 1.01, 1.16],
  zidane: [.013, .96, 1.02, 1.03, 1.0], beckham: [.006, .98, 1.09, 1.01, .97],
  debruyne: [.004, .96, 1.05, 1.01, 1.01], kane: [.012, .98, 1.11, 1.05, 1.0],
  modric: [.008, .94, .96, .94, .98], bellingham: [.006, 1.02, 1.07, 1.02, 1.02],
  vinicius: [.006, 1.13, 1.0, .98, 1.04], lewandowski: [.008, .97, 1.08, 1.04, 1.0],
  ronaldo: [.006, .94, 1.08, 1.04], messi: [.008, 1.08, 1.03, .97],
  haaland: [.003, .98, 1.12, 1.09], mbappe: [-.003, 1.13, 1.05, 1.04],
  yamal: [.001, 1.03, .94, .94], salah: [.009, 1.05, .98, .98],
  neymar: [.004, .96, .95, .96], musiala: [.002, .96, .93, .93],
};

/** Conservative landmark adjustments, in metres; remain original stylised likenesses, not scans. */
export function faceShape(profile: TakerProfile) {
  const seed = identitySeed(profile.baseId);
  const unit = (shift: number) => ((seed >>> shift) & 31) / 31;
  const [nose, noseWidth, chin, build, mouth] = FACE_SHAPES[profile.baseId] ?? [unit(0) * .01 - .002, .92 + unit(5) * .16, .94 + unit(10) * .14, .95 + unit(15) * .1];
  return { nose, noseWidth, chin, build, mouth: mouth ?? .94 + unit(20) * .12 };
}

/** Copy only the taker's face buffers, never the shared wall/keeper templates. Reuse on profile changes. */
export function personaliseFace(features: THREE.Object3D, profile: TakerProfile) {
  const shape = faceShape(profile);
  features.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.name === 'beard' || (object.material as THREE.Material).name !== 'skin') return;
    if (!object.userData.neutralFace) {
      object.geometry = object.geometry.clone();
      const rest = object.userData.neutralFace = new Float32Array(object.geometry.attributes.position.array);
      object.userData.neutralColour = new Float32Array(object.geometry.attributes.color?.array ?? []);
      const masks = object.userData.faceMasks = new Float64Array(rest.length);
      for (let i = 0; i < rest.length / 3; i++) {
        const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
        const front = THREE.MathUtils.clamp((-z - .065) / .05, 0, 1);
        masks[i * 3] = Math.exp(-x * x * 1900 - (y - .17) ** 2 * 2600) * front;
        masks[i * 3 + 1] = Math.exp(-((y - .095) ** 2) * 1800) * front;
        masks[i * 3 + 2] = Math.exp(-((y - .119) ** 2) * 6000) * front;
      }
    }
    const rest = object.userData.neutralFace as Float32Array;
    const positions = object.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      let x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
      const masks = object.userData.faceMasks as Float64Array;
      const nose = masks[i * 3], chin = masks[i * 3 + 1], mouth = masks[i * 3 + 2];
      x *= 1 + nose * (shape.noseWidth - 1) + chin * (shape.chin - 1) + mouth * (shape.mouth - 1);
      z -= nose * shape.nose;
      positions.setXYZ(i, x, y, z);
    }
    const colour = object.geometry.attributes.color as THREE.BufferAttribute | undefined;
    const neutral = object.userData.neutralColour as Float32Array;
    if (colour && neutral.length) {
      for (let i = 0; i < colour.count; i++) {
        const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
        const front = THREE.MathUtils.clamp((-z - .065) / .05, 0, 1);
        const cheek = Math.exp(-((Math.abs(x) - .052) ** 2 * 1500 + (y - .15) ** 2 * 1700)) * front;
        const socket = Math.exp(-((Math.abs(x) - .032) ** 2 * 6000 + (y - .19) ** 2 * 16000)) * front;
        colour.setXYZ(i, neutral[i * 3] * (1 - socket * .08), neutral[i * 3 + 1] * (1 - cheek * .065 - socket * .11), neutral[i * 3 + 2] * (1 - cheek * .045 - socket * .1));
      }
      colour.needsUpdate = true;
    }
    positions.needsUpdate = true;
    object.geometry.computeVertexNormals(); object.geometry.computeBoundingSphere();
  });
}
export function disposeIdentityCache() {
  for (const entry of cache.values()) for (const texture of Object.values(entry)) texture.dispose();
  cache.clear();
}
