import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { fillGrassPixels } from '../../src/game/stadium';
import { normalMapFromCanvas } from '../../src/game/pbr';
import { keeperSaves, createKeeper } from '../../src/game/keeper';
import { BALL_RADIUS, clamp } from '../../src/game/physics';
import { disposeSceneResources } from '../../src/game/resources';
import { PostStack } from '../../src/game/post';

afterEach(() => vi.unstubAllGlobals());

describe('quality-preserving mobile optimization regressions', () => {
  it('produces byte-identical turf, including stripe boundaries and seeded grain', () => {
    const width = 65, height = 260;
    const expected = new Uint8ClampedArray(width * height * 4);
    let seed = 7017;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const stripe = Math.floor(y / 128) % 2 ? .9 : 1.06;
      const patch = 1 + Math.sin(x * .013 + Math.cos(y * .009) * 2) * Math.cos(y * .011 + x * .004) * .055 - (Math.sin(x * .047 + y * .031) > .92 ? .08 : 0);
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const grain = (seed / 4294967296 - .5) * 19 + Math.sin(x * .31 + y * .1) * 2.2;
      expected[i] = (43 * stripe + grain * .66) * patch;
      expected[i + 1] = (91 * stripe + grain) * patch;
      expected[i + 2] = (43 * stripe + grain * .52) * patch;
      expected[i + 3] = 255;
    }
    const actual = new Uint8ClampedArray(expected.length);
    fillGrassPixels(actual, width, height);
    expect(actual).toEqual(expected);
  });

  it.each([[7, 5], [1, 4], [3, 1], [8, 6], [2, 2], [1, 1], [64, 32]])('produces identical normal-map bytes at %ix%i, including wrapped edges', (w, h) => {
    const src = Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i * 73 + 19) % 256);
    const output = { data: new Uint8ClampedArray(src.length) };
    const context = { createImageData: () => output, putImageData: vi.fn() };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
    const source = { width: w, height: h, getContext: () => ({ getImageData: () => ({ data: src }) }) } as unknown as HTMLCanvasElement;
    const height = (x: number, y: number) => {
      const i = (((y + h) % h) * w + ((x + w) % w)) * 4;
      return (src[i] + src[i + 1] + src[i + 2]) / 765;
    };
    const expected = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * 2.5;
      const dy = (height(x, y + 1) - height(x, y - 1)) * 2.5;
      const len = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      expected[i] = (-dx / len * .5 + .5) * 255;
      expected[i + 1] = (dy / len * .5 + .5) * 255;
      expected[i + 2] = (1 / len * .5 + .5) * 255;
      expected[i + 3] = 255;
    }
    const texture = normalMapFromCanvas(source, 2.5);
    expect(output.data).toEqual(expected);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
  });

  it('keeps keeper body, glove and swept-arm decisions across both penalty modes', () => {
    for (const penalty of [false, true]) for (const dive of [0, .25, 1]) {
      const k = createKeeper(0);
      Object.assign(k, { x: -.2, dive, glove: { x: 1.2, y: 1.8 } });
      const bodyY = dive > 0 ? .9 + (k.glove.y - 1.1) * .35 : 1;
      for (let x = -2; x < 3; x += .07) for (let y = 0; y < 3; y += .07) {
        const point = { x, y, z: 0 };
        const extra = penalty ? .12 : 0;
        const body = ((x - k.x) / (.35 + dive * .14 + BALL_RADIUS + extra)) ** 2 + ((y - bodyY) / (.78 - dive * .2 + BALL_RADIUS + extra)) ** 2 <= 1;
        const hands = Math.hypot(x - k.glove.x, y - k.glove.y) < .27 + BALL_RADIUS + (penalty ? .08 : 0);
        const ax = k.x, ay = bodyY + .25, bx = k.glove.x, by = k.glove.y;
        const denom = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = denom > 0 ? clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / denom, 0, 1) : 0;
        const arms = Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) < .16 + BALL_RADIUS + (penalty ? .06 : 0);
        expect(keeperSaves(point, k, penalty)).toBe(body || hands || arms);
      }
    }
  });

  it.each([false, true])('changes quality without reallocating a post stack (bloom=%s)', bloom => {
    const composer = { setSize: vi.fn(), setPixelRatio: vi.fn() };
    const bloomPass = bloom ? { strength: .16 } : null;
    const post = Object.assign(Object.create(PostStack.prototype), {
      key: `fxaa|${bloom}`, composer, bloom: bloomPass, width: 800, height: 600, pixelRatio: 2,
      renderer: { getPixelRatio: () => 2 },
    });
    const dispose = vi.spyOn(post, 'dispose');
    post.configure({ antialias: 'fxaa', bloom, quality: 'balanced' }, 800, 600);
    expect(dispose).not.toHaveBeenCalled();
    expect(post.composer).toBe(composer);
    expect(composer.setSize).not.toHaveBeenCalled();
    if (bloomPass) expect(bloomPass.strength).toBe(.1);
  });

  it('frees shared resources exactly once and leaves render-target textures to their owner', () => {
    const scene = new THREE.Scene();
    const texture = new THREE.Texture(), environment = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture, normalMap: texture, envMap: environment });
    const geometry = new THREE.BoxGeometry();
    const instances = new THREE.InstancedMesh(geometry, material, 2);
    scene.add(new THREE.Mesh(geometry, material), instances);
    const sun = new THREE.DirectionalLight();
    scene.add(sun);
    const spies = [geometry, material, texture, instances, sun.shadow].map(resource => vi.spyOn(resource, 'dispose'));
    const environmentDispose = vi.spyOn(environment, 'dispose');
    disposeSceneResources(scene, new Set([environment]));
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(environmentDispose).not.toHaveBeenCalled();
  });
});
