import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  BodyColliders,
  segmentDistanceSquared,
} from '../../src/game/body-colliders';
import { Confetti, FrozenStadiumGroup, Stadium } from '../../src/game/stadium';
import { ReplayBuffer, RunupBuffer } from '../../src/game/replay';
import { createKeeper } from '../../src/game/keeper';
import { launchBall, hitsWall, type ShotSetup } from '../../src/game/physics';
import { CHANCE_SAMPLES, estimateConversion } from '../../src/game/chance';
import { graphicsForPreset } from '../../src/state';
import { getPlayer, PLAYERS, playStyleFor } from '../../src/players';
import { PLAYLIST } from '../../src/game/music';
import {
  athleteModel,
  fitStature,
  type AthleteMaterials,
} from '../../src/game/athlete-model';
import { keeperPose, wallPose, type MotionRig } from '../../src/game/animation';
import { RIG_REST } from '../../src/game/skeleton-layout';
import { BroadcastOutputPass, PostStack } from '../../src/game/post';

const setup: ShotSetup = {
  position: { x: 0, z: 24 },
  aim: { x: 2.6, y: 1.5 },
  power: 0.6,
  foot: 'left',
  contact: { x: 0.2, y: 0 },
  seed: 1729,
};
function visual(role: 'keeper' | 'wall') {
  const material = new THREE.MeshStandardMaterial();
  const materials = Object.fromEntries(
    [
      'skin',
      'jersey',
      'sleeve',
      'shorts',
      'trim',
      'sock',
      'boot',
      'sole',
      'hair',
      'glove',
      'eyes',
      'iris',
    ].map((n) => [n, material]),
  ) as AthleteMaterials;
  const root = athleteModel(role, 'high', materials);
  fitStature(root, role === 'keeper' ? 1.9 : 1.83);
  const group = new THREE.Group();
  group.add(root);
  const rig = Object.fromEntries(
    [...Object.keys(RIG_REST), 'torso'].map((n) => [
      n,
      root.getObjectByName(n),
    ]),
  ) as unknown as MotionRig;
  return {
    group,
    root,
    rig,
    metrics: { scale: rig.body.scale.y, rootY: root.position.y },
  };
}

describe('model-aligned swept collision volumes', () => {
  it.each([-1, 1])(
    'matches every visible keeper joint through a complete dive (direction %s)',
    (direction) => {
      const actor = visual('keeper'),
        body = new BodyColliders(),
        k = createKeeper(0);
      k.direction = direction;
      k.yaw = 2.83;
      k.metrics = actor.metrics;
      k.targetX = k.x + direction;
      actor.group.position.set(k.x, 0, 0.7);
      actor.group.rotation.y = k.yaw;
      for (const dive of [0, 0.1, 0.25, 0.5, 1])
        for (const y of [0.35, 1.3, 2.5]) {
          k.dive = dive;
          k.targetY = k.glove.y = y;
          k.glove.x = k.x + direction * 0.8 * dive;
          keeperPose(actor.rig, k, 0.7);
          actor.group.updateMatrixWorld(true);
          body.keeper(k, 0.7);
          for (const name of Object.keys(
            RIG_REST,
          ) as (keyof typeof RIG_REST)[]) {
            const a = actor.rig[name]!.matrixWorld.elements,
              b = body.rig[name]!.matrixWorld.elements;
            a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 10));
          }
        }
    },
  );
  it.each([0.97, 1, 1.03])(
    'matches scaled defenders, their yaw and recorded jump (%s)',
    (scale) => {
      const actor = visual('wall'),
        body = new BodyColliders();
      actor.group.position.set(-2, 0, 14);
      actor.group.rotation.y = 2.7;
      actor.group.scale.y = scale;
      for (const jump of [0, 0.36]) {
        wallPose(actor.rig, jump, 0.49);
        actor.group.updateMatrixWorld(true);
        body.wall(
          {
            x: -2,
            z: 14,
            yaw: 2.7,
            metrics: { ...actor.metrics, yScale: scale },
          },
          jump,
          0.49,
        );
        for (const name of Object.keys(RIG_REST) as (keyof typeof RIG_REST)[])
          actor.rig[name]!.matrixWorld.elements.forEach((v, i) =>
            expect(v).toBeCloseTo(body.rig[name]!.matrixWorld.elements[i], 10),
          );
      }
    },
  );
  it('allows balls past a head/shoulder corner previously blocked by the rectangular wall', () => {
    const p = { x: 0, z: 10, noJump: true };
    expect(
      hitsWall(
        { x: 0.36, y: 1.78, z: 10.5 },
        { x: 0.36, y: 1.78, z: 9.5 },
        [p],
        0,
      ),
    ).toBe(false);
    expect(
      hitsWall({ x: 0, y: 1.68, z: 10.5 }, { x: 0, y: 1.68, z: 9.5 }, [p], 0),
    ).toBe(true);
  });
  it('uses the very same 15%-roll decision to allow a low ball under a jumping wall', () => {
    const a = { x: 0, y: 0.12, z: 10.5 },
      b = { x: 0, y: 0.12, z: 9.5 };
    expect(hitsWall(a, b, [{ x: 0, z: 10, noJump: false }], 0.49)).toBe(false);
    expect(hitsWall(a, b, [{ x: 0, z: 10, noJump: true }], 0.49)).toBe(true);
  });
  it.each([-1, 1])(
    'keeps the trailing upper arm in front of, not through, the jersey (%s)',
    (direction) => {
      const body = new BodyColliders(),
        k = createKeeper(0),
        point = new THREE.Vector3();
      k.direction = direction;
      k.dive = 1;
      for (const y of [0.35, 1.4, 2.5]) {
        k.targetY = k.glove.y = y;
        k.glove.x = k.x + direction * 0.8;
        body.keeper(k, 1);
        const arm = direction > 0 ? body.rig.rightArm : body.rig.leftArm;
        for (const distance of [0.17, 0.23, 0.29]) {
          arm.localToWorld(point.set(0, -distance, 0));
          body.rig.body.worldToLocal(point);
          // Conservative jersey cross-section PLUS upper-arm radius; pivot/sleeve joins excluded.
          expect((point.x / 0.28) ** 2 + (point.z / 0.19) ** 2).toBeGreaterThan(
            1,
          );
        }
      }
    },
  );
  it('handles point, parallel and swept segment/capsule distances without tunnelling', () => {
    const axis = new Float64Array([0, 0, 0, 0, 2, 0]);
    expect(
      segmentDistanceSquared(
        { x: -2, y: 1, z: 0 },
        { x: 2, y: 1, z: 0 },
        axis,
        0,
      ),
    ).toBe(0);
    expect(
      segmentDistanceSquared(
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 2, z: 0 },
        axis,
        0,
      ),
    ).toBe(1);
    expect(
      segmentDistanceSquared(
        { x: 0, y: 3, z: 0 },
        { x: 0, y: 3, z: 0 },
        axis,
        0,
      ),
    ).toBe(1);
  });
});

describe('recorded cinematic time, not render-time motion', () => {
  it('slerps recorded orientation by actual timestamps, including irregular final samples, then freezes', () => {
    const replay = new ReplayBuffer(),
      ball = launchBall(setup),
      keeper = createKeeper(0),
      q = new THREE.Quaternion(),
      out = new THREE.Quaternion();
    ball.time = 0;
    replay.record(ball, keeper, q);
    ball.time = 0.016;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.8);
    replay.record(ball, keeper, q);
    ball.time = 0.025;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.25);
    replay.record(ball, keeper, q);
    replay.sampleTime(0.0205, ball, keeper, out);
    expect(
      out.angleTo(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          1.025,
        ),
      ),
    ).toBeCloseTo(0, 6);
    const result = out.toArray();
    for (let i = 0; i < 120; i++) replay.sampleTime(0.0205, ball, keeper, out);
    expect(out.toArray()).toEqual(result);
    replay.sampleTime(99, ball, keeper, out);
    expect(out.angleTo(q)).toBeCloseTo(0, 6);
  });
  it('records at bounded frequency and retains the exact final plant at 360-Hz display rates', () => {
    const runup = new RunupBuffer(),
      position = { x: 0, y: 0, z: 0 },
      out = { x: 0, y: 0, z: 0 };
    runup.record(0, 0, position, 0);
    for (let i = 1; i <= 594; i++) {
      const t = i / 360;
      position.z = t * 3;
      runup.record(t, t / 1.65, position, 0.2);
    }
    expect(runup.length).toBeLessThan(256);
    expect(runup.peakSpeed).toBeCloseTo(10.8, 8);
    expect(runup.sample(1.65, out).phase).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(4.95);
    runup.sample(0.8, out);
    expect(out.z).toBeCloseTo(2.4);
    runup.clear();
    expect(runup.peakSpeed).toBe(0);
    expect(runup.length).toBe(0);
  });
});

describe('new quality-preserving workload reductions', () => {
  it('bypasses all frozen stadium world-matrix traversal, even when a moving scene forces updates', () => {
    const group = new FrozenStadiumGroup(),
      child = new THREE.Group();
    group.add(child);
    child.position.set(2, 3, 4);
    group.freezeWorld();
    const update = vi.spyOn(child, 'updateMatrixWorld');
    for (let i = 0; i < 60; i++) group.updateMatrixWorld(true);
    expect(update).not.toHaveBeenCalled();
    expect(
      new THREE.Vector3().setFromMatrixPosition(child.matrixWorld).toArray(),
    ).toEqual([2, 3, 4]);
  });
  it('uploads one vec4 per confetti particle, never 90 changing matrices per display frame', () => {
    const confetti = new Confetti(new THREE.Group()),
      matrices = confetti.mesh.instanceMatrix;
    const before = matrices.version;
    confetti.burst(new THREE.Vector3(0, 2, 0));
    const particle = confetti.mesh.geometry.attributes
        .aParticle as THREE.InstancedBufferAttribute,
      version = particle.version;
    for (let i = 0; i < 60; i++) confetti.update(1 / 60, i / 60);
    expect(matrices.version).toBe(before);
    expect(particle.version).toBe(version + 60);
    expect(particle.array.byteLength).toBe(matrices.array.byteLength / 4);
    const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>' };
    (confetti.mesh.material as THREE.Material).onBeforeCompile(
      shader as never,
      {} as never,
    );
    expect(shader.vertexShader).toContain('mat2(cx,sx,-sx,cx)');
  });
  it('retains wind motion numerically, with 20% denser/wider turf and zero per-vertex sine calls', () => {
    const stadium = Object.assign(Object.create(Stadium.prototype), {
      group: new THREE.Group(),
      grassWind: { value: new THREE.Vector4() },
    });
    stadium.makeGrassBlades();
    const patches = stadium.grassPatches as THREE.InstancedMesh[];
    expect(patches.reduce((n, p) => n + p.count, 0)).toBe(97344);
    for (const patch of [patches[0], patches.at(-1)!]) {
      const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>' };
      (patch.material as THREE.Material).onBeforeCompile(
        shader as never,
        {} as never,
      );
      expect(shader.vertexShader).not.toContain('sin(');
      const wind = patch.geometry.attributes.aWind,
        matrix = patch.instanceMatrix.array;
      for (const time of [0, 0.1, 4.5, 80])
        for (const i of [0, 10, 40]) {
          const a = matrix[i * 16 + 12] * 0.9 + matrix[i * 16 + 14] * 0.6,
            b = matrix[i * 16 + 14] * 1.3;
          const original =
            Math.sin(time * 1.7 + a) * 0.6 + Math.sin(time * 3.1 + b) * 0.25;
          const factored =
            (wind.getX(i) * Math.cos(time * 1.7) +
              wind.getY(i) * Math.sin(time * 1.7)) *
              0.6 +
            (wind.getZ(i) * Math.cos(time * 3.1) +
              wind.getW(i) * Math.sin(time * 3.1)) *
              0.25;
          expect(factored).toBeCloseTo(original, 6);
        }
    }
  });
  it('enables DOF by default only in High; a disabled post stack has no sampled-depth attachment or extra pass', () => {
    expect(graphicsForPreset('high').dof).toBe(true);
    expect(graphicsForPreset('balanced').dof).toBe(false);
    expect(graphicsForPreset('performance').dof).toBe(false);
    const renderer = { getPixelRatio: () => 1 } as THREE.WebGLRenderer;
    for (const dof of [false, true]) {
      const post = new PostStack(
        renderer,
        new THREE.Scene(),
        new THREE.PerspectiveCamera(),
      );
      post.configure(
        { antialias: 'off', bloom: false, dof, quality: 'high' },
        800,
        600,
      );
      const stack = post as unknown as {
        composer: {
          passes: unknown[];
          renderTarget1: THREE.WebGLRenderTarget;
          renderTarget2: THREE.WebGLRenderTarget;
        };
      };
      expect(stack.composer.passes).toHaveLength(2);
      expect(!!stack.composer.renderTarget1.depthTexture).toBe(dof);
      if (dof) {
        expect(stack.composer.renderTarget1.depthTexture).not.toBe(
          stack.composer.renderTarget2.depthTexture,
        );
        expect(stack.composer.renderTarget1.depthTexture!.source).not.toBe(
          stack.composer.renderTarget2.depthTexture!.source,
        );
      }
      post.dispose();
    }
    const pass = new BroadcastOutputPass(true);
    expect(pass.material.fragmentShader).toContain('Thin-lens');
    expect(pass.material.fragmentShader).not.toContain('sin(angle)');
    expect(pass.material.fragmentShader.match(/float sampleZ=/g)).toHaveLength(12);
    expect(
      pass.material.fragmentShader.indexOf('precision highp float'),
    ).toBeLessThan(pass.material.fragmentShader.indexOf('uniform vec4 uLens'));
    pass.dispose();
  });
});

describe('ICONs, soundtrack and transparent game-model statistics', () => {
  it('includes four desaturated ICON identities, Carlos left-footed Power+ with 99 power and curve', () => {
    expect(PLAYERS.filter((p) => p.edition === 'icon')).toHaveLength(4);
    const carlos = getPlayer('roberto-carlos');
    expect(carlos.foot).toBe('left');
    expect(carlos.attributes.power).toBe(99);
    expect(carlos.attributes.curve).toBe(99);
    expect(playStyleFor(carlos.baseId)).toBe('power');
  });
  it('bundles the three existing tracks and both supplied new tracks', () => {
    expect(PLAYLIST).toHaveLength(5);
    expect(PLAYLIST.map((p) => p.title).join(' ')).toMatch(
      /Worms.*Parado no bailão/,
    );
  });
  it('estimates a repeatable bounded frequency from 64 complete shot simulations, never random UI numbers', () => {
    expect(CHANCE_SAMPLES).toBe(64);
    const first = estimateConversion(setup, [], 'rookie');
    expect(first).toBe(estimateConversion(setup, [], 'rookie'));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(100);
    expect(
      estimateConversion({ ...setup, aim: { x: 8, y: 5 } }, [], 'legend'),
    ).toBe(0);
  });
});
