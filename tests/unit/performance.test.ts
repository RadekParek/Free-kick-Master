import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
// Athlete construction uses canvas. These tests exercise the arena's scheduling/buffers, not models.
vi.mock('../../src/game/player', () => ({ Player: class {}, makeFootball: vi.fn() }));
import { Arena } from '../../src/game/arena';
import { Stadium } from '../../src/game/stadium';
import { NetRipple, NET_RIPPLE_VERTEX } from '../../src/game/net-ripple';
import { PostStack } from '../../src/game/post';
import { DEFAULT_SETTINGS } from '../../src/state';
import { GOAL_HEIGHT, GOAL_WIDTH } from '../../src/game/physics';

// Prototype fixtures deliberately omit the costly WebGL/canvas constructors.
function previewFixture() {
  const guideGeometry = new LineGeometry();
  const guideSegments = new Float32Array(511 * 6);
  const guideBuffer = new THREE.InstancedInterleavedBuffer(guideSegments, 6);
  guideGeometry.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(guideBuffer, 3, 0));
  guideGeometry.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(guideBuffer, 3, 3));
  return Object.assign(Object.create(Arena.prototype), {
    settings: structuredClone(DEFAULT_SETTINGS), phase: 'ready', previewPower: -1, previewDirty: false,
    guide: { visible: true, geometry: guideGeometry }, guideGeometry, guideSegments, guideBuffer,
    ring: new THREE.Object3D(), guidePositions: new Float32Array(512 * 3), events: { aim: vi.fn() },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('performance invariants (preserving detail, with the mobile shadow cap)', () => {
  it('coalesces input bursts into one trajectory calculation with the latest aim', () => {
    const arena = previewFixture();
    const setup = vi.spyOn(arena, 'setup');
    for (let i = 0; i < 20; i++) arena.setAim({ x: i / 10, y: 2 });
    expect(setup).not.toHaveBeenCalled();
    arena.updatePreview();
    expect(setup).toHaveBeenCalledOnce();
    expect(arena.settings.aim.x).toBe(1.9);
    expect(arena.guideGeometry.instanceCount).toBeGreaterThan(0);
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

  it('keeps the full preview for Dead Ball+ and shortens the ordinary preview', () => {
    const arena = previewFixture(); arena.settings.playerId = 'neymar';
    arena.updatePreview(true); const full = arena.guideGeometry.instanceCount;
    arena.settings.playerId = 'mbappe'; arena.updatePreview(true);
    expect(full).toBeGreaterThan(arena.guideGeometry.instanceCount);
  });

  it('moves dense grass with the ball despite the frozen stadium world matrices', () => {
    const patch = new THREE.Object3D(); patch.matrixAutoUpdate = patch.matrixWorldAutoUpdate = false;
    const group = new THREE.Group(); group.position.set(1, 0, 2); group.updateMatrixWorld(true);
    const stadium = Object.assign(Object.create(Stadium.prototype), { nearGrass: patch, group });
    stadium.setKickPosition({ x: -6, z: 24 });
    expect(new THREE.Vector3().setFromMatrixPosition(patch.matrixWorld).toArray()).toEqual([-5, 0, 26]);
  });

  it('cancels paused animation frames and schedules only one on resume', () => {
    const request = vi.fn(() => 8), cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const arena = Object.assign(Object.create(Arena.prototype), { paused: false, raf: 7, lastTick: 4000, cancelCharge: vi.fn(), tick: vi.fn(), labels:{setPaused:vi.fn()} });
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

  it('reuses thick preview segment storage without per-refresh geometry allocation', () => {
    const arena = previewFixture();
    const start = arena.guideGeometry.attributes.instanceStart;
    arena.updatePreview(true);
    expect(arena.guideGeometry.instanceCount).toBeGreaterThan(1);
    const version = arena.guideBuffer.version;
    arena.updatePreview();
    expect(arena.guideBuffer.version).toBe(version);
    arena.setAim({ x: 2, y: 2 }); arena.updatePreview();
    expect(arena.guideGeometry.attributes.instanceStart).toBe(start);
    expect(arena.guideBuffer.version).toBe(version + 1);
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
    expect(arena.scene.traverse).not.toHaveBeenCalled();
    settings.graphics.shadows = 0;
    arena.updateSettings(settings);
    expect(arena.scene.traverse).toHaveBeenCalledOnce();
  });

  it('refreshes dynamic shadow maps every other display frame and skips them when disabled', () => {
    const arena = Object.assign(Object.create(Arena.prototype), {
      settings: { graphics: { shadows: 1024 } }, shadowFrame: 0,
      renderer: { shadowMap: { enabled: true, needsUpdate: false } },
    });
    const refresh = (arena as unknown as { refreshDynamicShadows(): void }).refreshDynamicShadows.bind(arena);
    refresh();
    expect(arena.renderer.shadowMap.needsUpdate).toBe(false);
    refresh();
    expect(arena.renderer.shadowMap.needsUpdate).toBe(true);
    arena.renderer.shadowMap.needsUpdate = false;
    refresh();
    expect(arena.renderer.shadowMap.needsUpdate).toBe(false);
    arena.renderer.shadowMap.enabled = false;
    const frame = arena.shadowFrame;
    refresh();
    expect(arena.shadowFrame).toBe(frame);
  });

  it('coalesces resize bursts to one render-target resize', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length; });
    const arena = Object.assign(Object.create(Arena.prototype), { resizeFrame: 0, resize: vi.fn() });
    const queueResize = (arena as unknown as { queueResize(): void }).queueResize.bind(arena);
    queueResize(); queueResize(); queueResize();
    expect(callbacks).toHaveLength(1);
    expect(arena.resize).not.toHaveBeenCalled();
    callbacks[0](0);
    expect(arena.resize).toHaveBeenCalledOnce();
    expect(arena.resizeFrame).toBe(0);
  });

  it('orbits the camera within bounds and restores the default view for a new shot', () => {
    const arena = Object.assign(Object.create(Arena.prototype), { cameraYawOffset: 0, phase: 'ready', attract: false });
    for (let i = 0; i < 20; i++) arena.rotateCamera(1);
    const limit = arena.cameraYawOffset;
    expect(limit).toBeLessThanOrEqual(Math.PI / 3);
    expect(limit).toBeGreaterThan(0);
    arena.phase = 'flight';
    expect(arena.rotateCamera(-1)).toBe(limit);
    arena.resetCameraRotation();
    expect(arena.cameraYawOffset).toBe(0);
  });

  it('returns the camera to neutral as soon as a charged shot is released', () => {
    const arena = Object.assign(Object.create(Arena.prototype), {
      labels:{hideStats:vi.fn()}, phase: 'charging', cameraYawOffset: 0.4, phaseTime: 0, power: 0.6,
      setup: vi.fn(() => ({})), settings: structuredClone(DEFAULT_SETTINGS),
      guide: { visible: true }, ring: { visible: true },
      replayFrames: { clear: vi.fn() }, runupFrames:{clear:vi.fn(),record:vi.fn()}, football:{quaternion:new THREE.Quaternion()}, taker:{group:new THREE.Group()}, chanceJob:0, resultBallTime: 0, lastResult: { outcome: 'goal' },
      tracePointCount: 10, traceUploadedCount: 8, setTrace: vi.fn(),
      events: { phase: vi.fn() },
    });
    arena.release();
    expect(arena.cameraYawOffset).toBe(0);
    expect(arena.phase).toBe('runup');
    expect(arena.guide.visible).toBe(false);
    expect(arena.ring.visible).toBe(false);
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

  it('runs the original net wave on the GPU with no per-frame position or parameter uploads', () => {
    const rest = new Float32Array([-2, 1, -2, 0, 2, -2, 3, .5, -2]);
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(rest.slice(), 3));
    const net = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial());
    const ripple = new NetRipple(net);
    const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '' };
    net.material.onBeforeCompile(shader as never, {} as never);
    expect(shader.vertexShader).toContain(NET_RIPPLE_VERTEX);
    const uniforms = shader.uniforms as Record<string, { value: number }>;
    const stadium = Object.assign(Object.create(Stadium.prototype), {
      netRipple: ripple, crowdMotion:{value:new THREE.Vector4()},photoMotion:{value:new THREE.Vector2()}, flagTime: {}, grassWind:{value:new THREE.Vector4()}, crowdEnergy: {},
      lastUpdate: 0, cheerStart: -100, cheerStrength: 0, confetti: { update: vi.fn() },
    });
    const impact = new THREE.Vector3(1, 1.5, -1.6);
    stadium.ripple(impact, 10);
    const parameters = geometry.attributes.ripple as THREE.BufferAttribute;
    const version = parameters.version;
    stadium.update(10.75);
    expect(uniforms.uNetElapsed.value).toBe(.75);
    for (let i = 0; i < 3; i++) {
      const distance = Math.hypot(rest[i * 3] - impact.x, rest[i * 3 + 1] - impact.y);
      const edge = Math.fround(Math.sin((rest[i * 3] + GOAL_WIDTH / 2) / GOAL_WIDTH * Math.PI) * Math.sin(rest[i * 3 + 1] / GOAL_HEIGHT * Math.PI));
      const gpu = Math.sin(.75 * 17 - parameters.getX(i)) * Math.exp(-.75 * 2.2) * parameters.getY(i);
      const reference = Math.sin(.75 * 17 - distance * 2.5) * Math.exp(-.75 * 2.2 - distance * .5) * .5 * edge;
      expect(gpu).toBeCloseTo(reference, 6);
    }
    stadium.update(14); stadium.update(15);
    expect(uniforms.uNetElapsed.value).toBe(-1);
    expect(geometry.attributes.position.array).toEqual(rest);
    expect((geometry.attributes.position as THREE.BufferAttribute).version).toBe(0);
    expect(parameters.version).toBe(version);
  });
  it('records replay samples without allocating or copying a live flight trail', () => {
    const record = vi.fn();
    const arena = Object.assign(Object.create(Arena.prototype), { frameCounter: 0, football:{quaternion:new THREE.Quaternion()}, replayFrames: { record }, ball: {}, keeper: {} });
    arena.recordFrame(); arena.recordFrame();
    expect(record).toHaveBeenCalledExactlyOnceWith(arena.ball, arena.keeper, arena.football.quaternion);
    expect(Object.keys(arena).some(key => key.toLowerCase().includes('trace'))).toBe(false);
    expect(Arena.prototype).not.toHaveProperty('setTrace');
  });

  it('writes the accelerating curved run-up into reusable scratch positions', () => {
    const arena = Object.assign(Object.create(Arena.prototype), { settings: structuredClone(DEFAULT_SETTINGS) });
    const out = { x: 0, z: 0 };
    for (const foot of ['left', 'right']) for (const run of [0, .1, .5, .85, .9, 1]) {
      arena.settings.foot = foot;
      arena.takerGround(run, out);
      const p = arena.settings.position;
      const t = Math.min(1, Math.max(0, run) / .9), e = t ** 1.35;
      const length = Math.hypot(p.x, p.z);
      const back = 4.8 + (.21 - 4.8) * e;
      const lateral = (foot === 'right' ? -1 : 1) * (1.6 + (.22 - 1.6) * Math.pow(e, .7));
      expect(out.x).toBe(p.x + p.x / length * back + p.z / length * lateral);
      expect(out.z).toBe(p.z + p.z / length * back - p.x / length * lateral);
    }
  });

  it('resizes the drawing buffer once for size/DPR changes and never for identical bounds', () => {
    const windowState = { devicePixelRatio: 2, innerWidth: 400 };
    vi.stubGlobal('window', windowState);
    const bounds = { width: 400, height: 800 };
    let ratio = 2;
    const renderer = {
      getPixelRatio: () => ratio,
      setDrawingBufferSize: vi.fn((_w: number, _h: number, r: number) => { ratio = r; }),
    };
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.graphics.resolution = 1;
    const arena = Object.assign(Object.create(Arena.prototype), {
      container: { getBoundingClientRect: () => bounds }, settings,
      width: 400, height: 800, renderer, camera: new THREE.PerspectiveCamera(),
      guideMaterial: { resolution: new THREE.Vector2() }, post: { configure: vi.fn() },
    });
    arena.resize();
    expect(renderer.setDrawingBufferSize).not.toHaveBeenCalled();
    bounds.width = 410;
    settings.graphics.resolution = .75;
    arena.resize();
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledExactlyOnceWith(410, 800, 1.5);
    expect(arena.camera.aspect).toBe(410 / 800);
    expect(arena.guideMaterial.resolution.toArray()).toEqual([410, 800]);
    arena.resize();
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledOnce();
    windowState.devicePixelRatio = 1;
    arena.resize();
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(410, 800, .75);
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(2);
  });

});
