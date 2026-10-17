import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { athleteModel, hairGeometry, JOINTS, RigRoot, type AthleteMaterials, type Surface } from '../../src/game/athlete-model';
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
    expect(styles.size).toBe(7);
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
    post.configure({ msaa: 0, smaa: false, bloom: false, quality: 'high' }, 800, 600);
    const composer = (post as unknown as { composer: { passes: unknown[] } }).composer;
    expect(composer.passes).toHaveLength(2); // RenderPass + fused output/grade (formerly 3)
    expect(composer.passes[1]).toBeInstanceOf(BroadcastOutputPass);
    post.dispose(); pass.dispose();
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
