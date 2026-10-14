import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
// Athlete construction uses canvas. These tests exercise the arena's scheduling/buffers, not models.
vi.mock('../../src/game/player', () => ({ Player: class {}, makeFootball: vi.fn() }));
import { Arena } from '../../src/game/arena';
import { Stadium } from '../../src/game/stadium';
import { PostStack } from '../../src/game/post';
import { DEFAULT_SETTINGS } from '../../src/state';
import { GOAL_HEIGHT, GOAL_WIDTH } from '../../src/game/physics';

// Prototype fixtures deliberately omit the costly WebGL/canvas constructors.
function previewFixture() {
  return Object.assign(Object.create(Arena.prototype), {
    settings: structuredClone(DEFAULT_SETTINGS), phase: 'ready', previewPower: -1, previewDirty: false,
    guide: new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(512 * 3), 3))),
    ring: new THREE.Object3D(), guidePositions: new Float32Array(512 * 3), events: { aim: vi.fn() },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('performance invariants (without reducing visual settings)', () => {
  it('coalesces input bursts into one trajectory calculation with the latest aim', () => {
    const arena = previewFixture();
    const setup = vi.spyOn(arena, 'setup');
    for (let i = 0; i < 20; i++) arena.setAim({ x: i / 10, y: 2 });
    expect(setup).not.toHaveBeenCalled();
    arena.updatePreview();
    expect(setup).toHaveBeenCalledOnce();
    expect(arena.settings.aim.x).toBe(1.9);
    expect(arena.guide.geometry.drawRange.count).toBeGreaterThan(0);
    arena.updatePreview();
    expect(setup).toHaveBeenCalledOnce();
  });

  it('skips hidden guide simulation, then regenerates it when enabled', () => {
    const arena = previewFixture();
    const setup = vi.spyOn(arena, 'setup');
    arena.settings.guides = false;
    arena.updatePreview(true);
    expect(setup).not.toHaveBeenCalled();
    expect(arena.guide.visible).toBe(false);
    arena.settings.guides = true;
    arena.updatePreview();
    expect(setup).toHaveBeenCalledOnce();
    expect(arena.guide.visible).toBe(true);
  });

  it('cancels paused animation frames and schedules only one on resume', () => {
    const request = vi.fn(() => 8), cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const arena = Object.assign(Object.create(Arena.prototype), { paused: false, raf: 7, lastTick: 4000, cancelCharge: vi.fn(), tick: vi.fn() });
    arena.setPaused(true);
    arena.setPaused(true);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(7);
    expect(request).not.toHaveBeenCalled();
    arena.setPaused(false);
    arena.setPaused(false);
    expect(request).toHaveBeenCalledOnce();
    expect(arena.lastTick).toBe(0);
    expect(arena.raf).toBe(8);
  });

  it('skips invisible defenders before even doing frustum math', () => {
    const arena = Object.assign(Object.create(Arena.prototype), { frustum: { intersectsSphere: vi.fn() } });
    const object = new THREE.Object3D();
    object.visible = false;
    expect(arena.inView(object)).toBe(false);
    expect(arena.frustum.intersectsSphere).not.toHaveBeenCalled();
  });

  it('reuses trace segment storage and preserves the thick-line draw geometry', () => {
    const geometry = new LineGeometry();
    const segments = new Float32Array(239 * 6);
    const buffer = new THREE.InstancedInterleavedBuffer(segments, 6);
    geometry.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
    const arena = Object.assign(Object.create(Arena.prototype), {
      tracePointCount: 3, tracePositions: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), traceSegments: segments,
      traceGeometry: geometry, traceBuffer: buffer, trace: { visible: false }, settings: { guides: true },
    });
    const start = geometry.attributes.instanceStart;
    arena.setTrace();
    expect(geometry.instanceCount).toBe(2);
    expect([...segments.slice(0, 12)]).toEqual([1, 2, 3, 4, 5, 6, 4, 5, 6, 7, 8, 9]);
    const version = buffer.version;
    arena.setTrace();
    expect(buffer.version).toBe(version);
    expect(geometry.attributes.instanceStart).toBe(start);
    expect(geometry.drawRange.count).toBe(Infinity);
    arena.tracePointCount = 0;
    arena.setTrace();
    expect(geometry.instanceCount).toBe(0);
    expect(arena.trace.visible).toBe(false);
  });

  it('does not dispose shadow maps or invalidate scene materials for a bloom toggle', () => {
    const map = { dispose: vi.fn() };
    const arena = Object.assign(Object.create(Arena.prototype), {
      settings: structuredClone(DEFAULT_SETTINGS), stadium: { setQuality: vi.fn(), sun: { shadow: { map, mapSize: new THREE.Vector2() } } },
      renderer: { shadowMap: {} }, scene: { traverse: vi.fn() }, post: { configure: vi.fn() },
      resize: vi.fn(), reset: vi.fn(), trace: {}, tracePointCount: 0, phase: 'ready', width: 100, height: 100,
    });
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.graphics.bloom = !settings.graphics.bloom;
    arena.updateSettings(settings);
    expect(arena.post.configure).toHaveBeenCalledOnce();
    expect(map.dispose).not.toHaveBeenCalled();
    expect(arena.scene.traverse).not.toHaveBeenCalled();
    expect(arena.resize).not.toHaveBeenCalled();
    settings.graphics.shadows = settings.graphics.shadows === 512 ? 1024 : 512;
    arena.updateSettings(settings);
    expect(map.dispose).toHaveBeenCalledOnce();
    expect(arena.stadium.sun.shadow.mapSize.x).toBe(settings.graphics.shadows);
  });

  it('avoids duplicate post resizes and disposes every owned pass', () => {
    const passes = [{ dispose: vi.fn() }, { dispose: vi.fn() }];
    const composer = { setSize: vi.fn(), setPixelRatio: vi.fn(), dispose: vi.fn(), passes };
    const post = Object.assign(Object.create(PostStack.prototype), {
      composer, width: 800, height: 600, pixelRatio: 2, renderer: { getPixelRatio: () => 2 },
    });
    post.setSize(800, 600);
    expect(composer.setSize).not.toHaveBeenCalled();
    expect(composer.setPixelRatio).not.toHaveBeenCalled();
    post.setSize(900, 600);
    expect(composer.setSize).toHaveBeenCalledExactlyOnceWith(900, 600);
    post.dispose(); post.dispose();
    expect(composer.dispose).toHaveBeenCalledOnce();
    for (const pass of passes) expect(pass.dispose).toHaveBeenCalledOnce();
  });

  it('cached net deformation matches the original wave and stops uploading when settled', () => {
    const rest = new Float32Array([-2, 1, -2, 0, 2, -2, 3, 0.5, -2]);
    const edge = new Float32Array(3);
    for (let i = 0; i < 3; i++) edge[i] = Math.sin((rest[i * 3] + GOAL_WIDTH / 2) / GOAL_WIDTH * Math.PI) * Math.sin(rest[i * 3 + 1] / GOAL_HEIGHT * Math.PI);
    const attribute = new THREE.BufferAttribute(rest.slice(), 3);
    const stadium = Object.assign(Object.create(Stadium.prototype), {
      netRest: rest, netEdge: edge, netWave: new Float32Array(3), netAmplitude: new Float32Array(3), netActive: false,
      net: { geometry: { attributes: { position: attribute } } }, crowdTime: {}, flagTime: {}, grassTime: {}, crowdEnergy: {},
      lastUpdate: 0, cheerStart: -100, cheerStrength: 0, confetti: { update: vi.fn() },
    });
    const impact = new THREE.Vector3(1, 1.5, -1.6);
    stadium.ripple(impact, 10);
    stadium.update(10.75);
    for (let i = 0; i < 3; i++) {
      const distance = Math.hypot(rest[i * 3] - impact.x, rest[i * 3 + 1] - impact.y);
      const expected = rest[i * 3 + 2] - Math.sin(0.75 * 17 - distance * 2.5) * Math.exp(-0.75 * 2.2 - distance * 0.5) * 0.5 * edge[i];
      expect(attribute.getZ(i)).toBeCloseTo(expected, 6);
    }
    stadium.update(14);
    expect(attribute.array).toEqual(rest);
    const version = attribute.version;
    stadium.update(15);
    expect(attribute.version).toBe(version);
  });
});
