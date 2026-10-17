import * as THREE from 'three';
import type { TakerProfile } from '../players';
import { kitDesign } from './appearance';

const cache = new Map<string, THREE.CanvasTexture>();
/** One opaque atlas replaces separate transparent name/number/crest meshes and draw calls. */
export function kitTexture(profile: TakerProfile): THREE.CanvasTexture {
  const key = `${profile.id}/${profile.number}`;
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
  const k = kitDesign(profile), size = 512;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = k.base; ctx.fillRect(0, 0, size, size);
  if (k.pattern === 'stripes') {
    ctx.fillStyle = k.secondary;
    for (let x = -size/24; x < size; x += size/6) ctx.fillRect(x, 0, size/12, size);
  } else if (k.pattern === 'checks') {
    ctx.fillStyle = k.secondary;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * 64, y * 64, 64, 64);
  } else if (k.pattern === 'sash') {
    ctx.strokeStyle = k.secondary; ctx.lineWidth = 55;
    for (const offset of [-512, 0, 512]) { ctx.beginPath(); ctx.moveTo(offset, -40); ctx.lineTo(offset + 512, 552); ctx.stroke(); }
  }
  // National collar, shoulder piping, side ventilation and title stars are baked, not extra draws.
  const stars:Record<string,number> = { BR:5,AR:3,FR:2,DE:4,IT:4,GB:1,ES:1 };
  ctx.fillStyle=k.trim;
  for(let i=0;i<(stars[k.code] ?? 0);i++) {
    const x=294+(i-((stars[k.code]??0)-1)/2)*6,y=91;
    ctx.beginPath();for(let n=0;n<10;n++){const a=-Math.PI/2+n*Math.PI/5,r=n%2?1.1:2.6;ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}ctx.closePath();ctx.fill();
  }
  ctx.strokeStyle=k.trim;ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(256,25,35,22,0,0,Math.PI);ctx.stroke();
  for(const x of [168,344]) {ctx.fillStyle=k.secondary;ctx.fillRect(x-3,160,6,330);}
  for(let y=190;y<450;y+=8)for(const x of [179,333]) {ctx.fillStyle='rgba(12,25,24,.08)';ctx.fillRect(x,y,1,2);}
  // Panel seams, collar piping and fine knit all bake into this single opaque surface.
  ctx.strokeStyle = k.trim; ctx.lineWidth = 4;
  for (const x of [150, 362]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (x < 256 ? -12 : 12), size); ctx.stroke(); }
  ctx.fillStyle = k.trim; ctx.fillRect(0, 8, size, 5);
  for (let y = 0; y < size; y += 3) { ctx.fillStyle = y % 6 ? 'rgba(255,255,255,.028)' : 'rgba(0,0,0,.028)'; ctx.fillRect(0, y, size, 1); }
  // Back crosses the UV seam. Draw twice to wrap both halves, not mirror the lettering.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const x of [0, size]) {
    // An opaque backing makes names/numbers legible over Argentina/Croatia patterns.
    ctx.fillStyle = k.base; ctx.fillRect(x - 63, 102, 126, 264);
    ctx.fillStyle = k.ink; ctx.font = '600 19px "Barlow Condensed", sans-serif';
    ctx.fillText(profile.shortName.toUpperCase(), x, 124, 138);
    ctx.font = '700 174px "Barlow Condensed", sans-serif'; ctx.fillText(String(profile.number), x, 255, 138);
    ctx.font = '600 11px sans-serif'; ctx.fillText(k.code, x, 393);
  }
  // Small original training badge, front number and national wordmark. No copied logos.
  ctx.fillStyle = k.trim; ctx.beginPath(); ctx.moveTo(281, 100); ctx.lineTo(306, 100); ctx.lineTo(305, 130); ctx.lineTo(294, 140); ctx.lineTo(282, 130); ctx.closePath(); ctx.fill();
  ctx.fillStyle = k.base; ctx.font = '700 11px sans-serif'; ctx.fillText(k.code, 294, 118);
  ctx.fillStyle = k.ink; ctx.font = '600 38px "Barlow Condensed", sans-serif'; ctx.fillText(String(profile.number), 244, 243);
  ctx.font = '600 13px "Barlow Condensed", sans-serif'; ctx.fillText(profile.nation.toUpperCase(), 256, 174, 110);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  cache.set(key, tex);
  // Bounded roster browsing: the current high/low rig share one map; old canvases are regenerated.
  if (cache.size > 6) { const oldest = cache.keys().next().value!; cache.get(oldest)!.dispose(); cache.delete(oldest); }
  return tex;
}

export function disposeKitCache() { for (const texture of cache.values()) texture.dispose(); cache.clear(); }
