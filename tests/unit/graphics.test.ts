import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { athleteModel, fitStature, hairGeometry, JOINTS, RigRoot, type AthleteMaterials, type Surface } from '../../src/game/athlete-model';
import { decodeHumanHead, loadHumanAnatomy } from '../../src/game/human';
import { BroadcastOutputPass, PostStack } from '../../src/game/post';
import { broadcastLens } from '../../src/game/camera';
import { kitDesign, playerLook, type HairStyle } from '../../src/game/appearance';
import { PLAYERS, getPlayer } from '../../src/players';

function asset(detail: string): ArrayBuffer {
  const data = readFileSync(`public/models/human-head-${detail}.bin`);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}
beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, arrayBuffer: async () => asset(url.includes('high') ? 'high' : 'low') })));
  await loadHumanAnatomy();
});
afterAll(() => vi.unstubAllGlobals());

function palette(): AthleteMaterials {
  return Object.fromEntries((['skin', 'jersey', 'sleeve', 'shorts', 'trim', 'sock', 'boot', 'sole', 'hair', 'glove', 'eyes', 'iris'] as Surface[])
    .map(name => { const m = new THREE.MeshStandardMaterial({ vertexColors: true }); m.name = name; return [name, m]; })) as AthleteMaterials;
}
function triangles(root: THREE.Object3D) {
  let count = 0;
  root.traverse(object => {
    if (object instanceof THREE.Mesh && object.visible) count += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  });
  return count;
}

describe('offline anatomy and original kit identity', () => {
  it.each(['high', 'low'])('decodes valid indexed %s anatomy with normals and finite positions', detail => {
    const g = decodeHumanHead(asset(detail));
    expect(g.index!.count % 3).toBe(0);
    expect(g.attributes.position.count).toBeGreaterThan(1000);
    expect(g.attributes.normal.count).toBe(g.attributes.position.count);
    expect(g.attributes.position.array.every(Number.isFinite)).toBe(true);
    expect(g.boundingSphere!.radius).toBeLessThan(.3);
  });
  it.each(['high', 'low'] as const)('matches every catalogue height at %s detail, with soles grounded and opaque surfaces', detail => {
    for (const profile of PLAYERS) {
      const r = athleteModel('taker', detail, palette());
      fitStature(r, profile.appearance.height); r.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(r, true);
      expect(bounds.min.y).toBeCloseTo(0, 3);
      expect(bounds.max.y).toBeCloseTo(profile.appearance.height, 3);
      r.traverse(o => { if (o instanceof THREE.Mesh) expect((o.material as THREE.Material).transparent).toBe(false); });
      expect(r.getObjectByName('leftFoot')).toBeTruthy(); expect(r.getObjectByName('rightFoot')).toBeTruthy();
    }
  });
  it('closes torso section ends without boundary holes or backface tricks', () => {
    const g = (athleteModel('taker', 'high', palette()).getObjectByName('torso') as THREE.Mesh).geometry;
    const p = g.attributes.position, edges = new Map<string, number>();
    const key = (i: number) => [p.getX(i),p.getY(i),p.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
    for (let i = 0; i < g.index!.count; i += 3) {
      const tri = [0,1,2].map(n => key(g.index!.getX(i+n)));
      for (let n = 0; n < 3; n++) { const edge = [tri[n],tri[(n+1)%3]].sort().join('|'); edges.set(edge, (edges.get(edge) ?? 0) + 1); }
    }
    expect([...edges.values()].every(count => count === 2)).toBe(true);
  });
  it.each(['high', 'low'])('seals the imported %s head neckline against hollow-neck views', detail => {
    const g = decodeHumanHead(asset(detail)), counts = new Map<string, number>();
    for (let i = 0; i < g.index!.count; i += 3) for (let j = 0; j < 3; j++) {
      const a = g.index!.getX(i+j), b = g.index!.getX(i+(j+1)%3), key = [a,b].sort((x,y) => x-y).join('/');
      counts.set(key, (counts.get(key) ?? 0)+1);
    }
    // The simplified low asset has a couple of shared non-manifold edges, but no open boundary.
    expect([...counts.values()].every(n => n >= 2)).toBe(true);
  });
  it('rejects truncated, invalid-index and non-finite human assets', () => {
    expect(() => decodeHumanHead(new ArrayBuffer(4))).toThrow('Truncated');
    expect(() => decodeHumanHead(asset('high').slice(0, 100))).toThrow('Invalid');
    const invalidIndex = asset('high');
    new DataView(invalidIndex).setUint16(invalidIndex.byteLength - 2, 65535, true);
    expect(() => decodeHumanHead(invalidIndex)).toThrow('indices');
    const invalidPosition = asset('high');
    new DataView(invalidPosition).setFloat32(8, Infinity, true);
    expect(() => decodeHumanHead(invalidPosition)).toThrow('coordinates');
  });
  it('shares geometry across players, not their joints, and reuses one material palette across LODs', () => {
    const materials = palette();
    const first = athleteModel('taker', 'high', materials), second = athleteModel('taker', 'high', palette());
    const low = athleteModel('taker', 'low', materials);
    const wall = athleteModel('wall', 'high', palette());
    for (const name of JOINTS) expect(first.getObjectByName(name)).not.toBe(second.getObjectByName(name));
    const torso = first.getObjectByName('torso') as THREE.Mesh;
    expect(torso.geometry).toBe((second.getObjectByName('torso') as THREE.Mesh).geometry);
    expect(torso.geometry).toBe((wall.getObjectByName('torso') as THREE.Mesh).geometry);
    expect(torso.material).toBe((low.getObjectByName('torso') as THREE.Mesh).material);
    expect(torso.material).not.toBe((second.getObjectByName('torso') as THREE.Mesh).material);
    expect(triangles(first)).toBeLessThan(22000); // old high rig: 80,128 with its default hair
    expect(triangles(low)).toBeLessThan(7000);
    // Outward winding on the shirt's back, where the UV seam lies.
    expect(torso.geometry.attributes.normal.getZ(1)).toBeGreaterThan(0);
  });
  it('gives every card valid identity, keeps special hair and national patterns', () => {
    const styles = new Set<HairStyle>();
    for (const player of PLAYERS) {
      const look = playerLook(player), kit = kitDesign(player);
      styles.add(look.hair);
      expect(look.width).toBeGreaterThan(.8);
      expect(kit.code).toBe(player.nationCode);
      if (player.edition === 'special') {
        expect(look).toEqual(playerLook(getPlayer(player.baseId)));
        expect(kit.pattern).toBe('sash');
      }
    }
    expect(styles.size).toBe(9);
    expect(kitDesign(getPlayer('messi')).pattern).toBe('stripes');
    expect(kitDesign(getPlayer('modric')).pattern).toBe('checks');
    expect(kitDesign(getPlayer('haaland')).base).toBe('#b72c38');
  });
  it('has distinct cached opaque geometry for all seven hairstyles and both detail levels', () => {
    const signatures = new Set<string>();
    for (const style of ['quiff', 'crop', 'curls', 'swept', 'bun', 'flow', 'braids'] as HairStyle[]) {
      const high = hairGeometry(style, 'high'), low = hairGeometry(style, 'low');
      expect(high).toBe(hairGeometry(style, 'high'));
      expect(high).not.toBe(low);
      expect(high.attributes.position.array.every(Number.isFinite)).toBe(true);
      expect(high.index!.count).toBeGreaterThan(500);
      signatures.add(`${high.index!.count}/${high.attributes.position.count}/${high.boundingSphere!.radius}`);
    }
    expect(signatures.size).toBe(7);
  });
});

describe('render work and broadcast compression', () => {
  it('skips hidden rig matrix traversal and updates it immediately when selected again', () => {
    const rig = new RigRoot(), joint = new THREE.Object3D();
    rig.add(joint);
    const update = vi.spyOn(joint, 'updateMatrixWorld');
    rig.visible = false; joint.position.x = 2;
    rig.updateMatrixWorld(true);
    expect(update).not.toHaveBeenCalled();
    rig.visible = true; rig.updateMatrixWorld(true);
    expect(update).toHaveBeenCalledOnce();
    expect(joint.matrixWorld.elements[12]).toBe(2);
  });
  it('keeps output conversion and grading in one full-screen pass and keeps SMAA ordering available', () => {
    const pass = new BroadcastOutputPass();
    const shader = pass.material.fragmentShader;
    expect(shader.indexOf('vec3 col =')).toBeGreaterThan(shader.indexOf('sRGBTransferOETF'));
    expect(shader.match(/texture2D\(/g)).toHaveLength(1);
    expect(pass.material.depthWrite).toBe(false);
    const renderer = { getPixelRatio: () => 1 } as THREE.WebGLRenderer;
    const post = new PostStack(renderer, new THREE.Scene(), new THREE.PerspectiveCamera());
    post.configure({ antialias: 'off', bloom: false, quality: 'high' }, 800, 600);
    const composer = (post as unknown as { composer: { passes: unknown[] } }).composer;
    expect(composer.passes).toHaveLength(2); // RenderPass + fused output/grade (formerly 3)
    expect(composer.passes[1]).toBeInstanceOf(BroadcastOutputPass);
    post.dispose(); pass.dispose();
  });
  it('uses a single FXAA pass with zero MSAA samples and refreshes native-relative texels on resize', () => {
    let ratio = 2;
    const post = new PostStack({ getPixelRatio: () => ratio } as THREE.WebGLRenderer, new THREE.Scene(), new THREE.PerspectiveCamera());
    post.configure({ antialias: 'fxaa', bloom: false, quality: 'high' }, 800, 600);
    const stack = post as unknown as { composer: { passes: unknown[]; renderTarget1: THREE.WebGLRenderTarget }; aa: { uniforms: { resolution: { value: THREE.Vector2 } } } };
    expect(stack.composer.passes).toHaveLength(3);
    expect(stack.composer.renderTarget1.samples).toBe(0);
    expect(stack.aa.uniforms.resolution.value.toArray()).toEqual([1/1600, 1/1200]);
    ratio = 4; post.setSize(772, 360);
    expect(stack.aa.uniforms.resolution.value.toArray()).toEqual([1/3088, 1/1440]);
    post.dispose();
  });
  it.each([[1280, 800], [390, 844], [844, 390]])('enlarges distant players without scaling geometry at %ix%i', (w, h) => {
    const lens = broadcastLens(w, h);
    const oldFov = w < h ? 50 : h < 500 ? 40 : 35;
    const oldBack = w < h ? 13.2 : 9.7;
    const tan = (angle: number) => Math.tan(angle * Math.PI / 360);
    expect(lens.fov).toBeLessThan(oldFov);
    expect(lens.back).toBeGreaterThan(oldBack);
    // Preserve the foreground taker projection at the 4.8 m run-up mark.
    expect((lens.back - 4.8) * tan(lens.fov)).toBeCloseTo((oldBack - 4.8) * tan(oldFov), 10);
    // A keeper at the goal gets a larger angular image, with unchanged physical dimensions.
    const enlargement = (24 + oldBack) * tan(oldFov) / ((24 + lens.back) * tan(lens.fov));
    expect(enlargement).toBeGreaterThan(1.15);
  });
});
