import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import fixtures from "../fixtures/optimization-reference.json";
import {
  BALL_RADIUS,
  launchBall,
  previewShot,
  previewShotInto,
  type ShotSetup,
  type Vec3,
} from "../../src/game/physics";
import {
  BodyColliders,
  segmentDistanceSquared,
} from "../../src/game/body-colliders";
import { createKeeper, resetKeeper } from "../../src/game/keeper";
import { advanceShot, createShotScratch } from "../../src/game/simulation";
import { estimateConversion } from "../../src/game/chance";
import { ReplayBuffer, RunupBuffer } from "../../src/game/replay";
import { DeferredBone } from "../../src/game/deferred-bone";
import { cloneSettings, DEFAULT_SETTINGS } from "../../src/state";
import { PostStack } from "../../src/game/post";
import { Stadium } from "../../src/game/stadium";
// Pure arena scheduling/path methods do not construct the canvas-backed player models.
vi.mock("../../src/game/player", () => ({
  Player: class {},
  makeFootball: vi.fn(),
}));
import { Arena } from "../../src/game/arena";

afterEach(() => vi.restoreAllMocks());
const setup = fixtures[0].setup as ShotSetup;

describe("pre-update deterministic physics, guide and conversion fixtures", () => {
  it.each(fixtures.map((fixture, i) => ({ ...fixture, case: i })))(
    "preserves all recorded states, events, Float32 guide bytes and 64-trial result for case $case",
    (fixture) => {
      const setup = fixture.setup as ShotSetup,
        wall = fixture.wall;
      const ball = launchBall(setup),
        keeper = createKeeper(setup.position.x),
        scratch = createShotScratch();
      const frames = [];
      let event;
      for (let tick = 0; tick < 1000; tick++) {
        event = advanceShot(ball, keeper, wall, "amateur", scratch);
        if (tick % 30 === 0)
          frames.push(
            structuredClone({
              position: ball.position,
              velocity: ball.velocity,
              keeper,
            }),
          );
        if (event && !event.continues) break;
      }
      // Strict equality, not a looser tolerance: physics operation ordering has not changed.
      expect(frames).toEqual(fixture.frames);
      expect(event).toEqual(fixture.event);
      const points = new Float32Array(1536),
        count = previewShotInto(setup, points, 6);
      expect(Array.from(points.subarray(0, count * 3))).toEqual(
        fixture.preview,
      );
      expect(estimateConversion(setup, wall, "amateur")).toBe(
        fixture.conversion,
      );
    },
  );
});

describe("owned scratch storage and immutable settings snapshots", () => {
  it("fully resets every ball field and retains caller-owned position/velocity identities", () => {
    const ball = launchBall(setup),
      position = ball.position,
      velocity = ball.velocity;
    for (const value of fixtures) {
      Object.assign(ball, {
        time: 9,
        bounces: 7,
        frameHits: 4,
        knuckle: true,
        wakePhase: 123,
      });
      const next = value.setup as ShotSetup;
      expect(launchBall(next, ball)).toBe(ball);
      expect(ball.position).toBe(position);
      expect(ball.velocity).toBe(velocity);
      expect(ball).toEqual(launchBall(next));
    }
  });
  it("leaves default ball launches and public object previews independent of reusable scratch state", () => {
    const a = launchBall(setup),
      original = structuredClone(a),
      preview = previewShot(setup),
      recorded = structuredClone(preview);
    const b = launchBall(setup);
    b.position.x = 999;
    for (const fixture of fixtures)
      previewShotInto(fixture.setup as ShotSetup, new Float32Array(1536));
    expect(a).toEqual(original);
    expect(preview).toEqual(recorded);
  });
  it("does not change request inputs or let one conversion request contaminate another", () => {
    const input = structuredClone(setup),
      original = structuredClone(input);
    const expected = estimateConversion(input, fixtures[0].wall, "amateur");
    estimateConversion(
      fixtures[5].setup as ShotSetup,
      fixtures[5].wall,
      "legend",
    );
    expect(estimateConversion(input, fixtures[0].wall, "amateur")).toBe(
      expected,
    );
    expect(input).toEqual(original);
  });
  it("resets keeper dynamics and glove in place without discarding measured anatomy or yaw", () => {
    const k = createKeeper(-4),
      glove = k.glove,
      metrics = { scale: 1.1, rootY: -0.02, yScale: 1.02 };
    Object.assign(k, {
      x: 3,
      dive: 1,
      velocityX: 4,
      reacted: true,
      yaw: 2.8,
      metrics,
    });
    k.glove.y = 3;
    resetKeeper(k, 4);
    expect(k).toEqual({ ...createKeeper(4), yaw: 2.8, metrics });
    expect(k.glove).toBe(glove);
    expect(k.metrics).toBe(metrics);
  });
  it("matches structuredClone for the entire Settings schema and owns all four nested records", () => {
    const source = structuredClone(DEFAULT_SETTINGS),
      copy = cloneSettings(source);
    expect(copy).toEqual(structuredClone(source));
    for (const key of Object.keys(source) as (keyof typeof source)[])
      if (typeof source[key] === "object")
        expect(copy[key]).not.toBe(source[key]);
    copy.position.x++;
    copy.aim.x++;
    copy.contact.x++;
    copy.graphics.bloom = !copy.graphics.bloom;
    expect(source).toEqual(DEFAULT_SETTINGS);
  });
});

describe("conservative capsule broad phase and cached exact segment math", () => {
  it("matches exhaustive capsule distance checks for 12,000 seeded swept, point and endpoint queries", () => {
    const body = new BodyColliders(),
      keeper = createKeeper(0);
    let seed = 123456;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let pose = 0; pose < 120; pose++) {
      if (pose % 2) {
        Object.assign(keeper, {
          x: (random() - 0.5) * 5,
          dive: random(),
          direction: pose % 3 ? -1 : 1,
        });
        keeper.glove.y = 0.3 + random() * 2.3;
        body.keeper(keeper, pose / 120);
      } else
        body.wall(
          { x: -2, z: 12, height: 1.7, yaw: 2.4 },
          random(),
          pose / 120,
        );
      const d = body.capsules;
      for (let query = 0; query < 100; query++) {
        const i = (query % 16) * 7;
        const a =
          query % 4
            ? { x: (random() - 0.5) * 10, y: random() * 4, z: random() * 16 }
            : { x: d[i], y: d[i + 1], z: d[i + 2] };
        const b =
          query % 3
            ? { x: (random() - 0.5) * 10, y: random() * 4, z: random() * 16 }
            : a;
        let exact = false;
        for (let offset = 0; offset < d.length; offset += 7)
          if (
            segmentDistanceSquared(a, b, d, offset) <=
            (d[offset + 6] + BALL_RADIUS) ** 2
          ) {
            exact = true;
            break;
          }
        expect(body.hits(a, b)).toBe(exact);
      }
    }
  });
  it("retains tangencies, parallel/zero-length segments and nearby misses at all capsule ends", () => {
    const body = new BodyColliders().keeper(createKeeper(0), 0.4),
      d = body.capsules;
    for (let i = 0; i < d.length; i += 7)
      for (const endpoint of [i, i + 3]) {
        const p = { x: d[endpoint], y: d[endpoint + 1], z: d[endpoint + 2] };
        expect(body.hits(p, p)).toBe(true);
        const tangent = { ...p, x: p.x + d[i + 6] + BALL_RADIUS };
        const exact = Array.from({ length: 16 }, (_, n) => n * 7).some(
          (n) =>
            segmentDistanceSquared(tangent, tangent, d, n) <=
            (d[n + 6] + BALL_RADIUS) ** 2,
        );
        expect(body.hits(tangent, tangent)).toBe(exact);
      }
    const point = new Float64Array([0, 0, 0, 0, 0, 0, 0]);
    expect(
      segmentDistanceSquared(
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        point,
        0,
      ),
    ).toBe(1);
  });
  it("writes the exact same affine endpoint coordinates as Three.Vector3.applyMatrix4", () => {
    const body = new BodyColliders(),
      keeper = createKeeper(0);
    const definitions: [THREE.Object3D, number[], number[], number][] = [];
    const r = body.rig;
    definitions.push(
      [r.head, [0, 0.16, -0.015], [0, 0.21, -0.015], 0.11],
      [r.body, [0, 1.1, 0], [0, 1.3, 0], 0.172],
      [r.body, [-0.12, 1.34, 0], [0.12, 1.34, 0], 0.1],
      [r.body, [0, 0.88, 0], [0, 0.99, 0], 0.151],
    );
    for (const side of ["left", "right"] as const)
      definitions.push(
        [r[`${side}Leg`], [0, -0.04, 0], [0, -0.39, 0], 0.073],
        [r[`${side}Shin`], [0, -0.03, 0], [0, -0.33, 0], 0.052],
        [r[`${side}Foot`]!, [0, -0.02, 0.025], [0, -0.02, -0.13], 0.047],
        [r[`${side}Arm`], [0, 0, 0], [0, -0.27, 0], 0.058],
        [r[`${side}Forearm`], [0, 0, 0], [0, -0.22, 0], 0.041],
        [r[`${side}Forearm`], [0, -0.25, -0.006], [0, -0.32, -0.006], 0.05],
      );
    for (let pose = 0; pose < 30; pose++) {
      keeper.dive = pose / 30;
      keeper.x = pose / 20;
      keeper.glove.y = 0.4 + pose / 15;
      body.keeper(keeper, pose / 120);
      definitions.forEach(([bone, a, b, radius], n) => {
        const av = new THREE.Vector3()
            .fromArray(a)
            .applyMatrix4(bone.matrixWorld),
          bv = new THREE.Vector3().fromArray(b).applyMatrix4(bone.matrixWorld);
        expect(Array.from(body.capsules.subarray(n * 7, n * 7 + 7))).toEqual([
          ...av.toArray(),
          ...bv.toArray(),
          radius * (1.9 / 1.726),
        ]);
      });
    }
  });
});

describe("unchanged-pose work elimination", () => {
  it("skips identity/repeated/reset-then-restored Euler work without losing quaternion or order edits", () => {
    const bone = new DeferredBone(),
      normal = new THREE.Group(),
      convert = vi.spyOn(bone.quaternion, "setFromEuler");
    bone.rotation.set(0, 0, 0);
    bone.flushRotation();
    expect(convert).not.toHaveBeenCalled();
    for (const order of ["XYZ", "YXZ", "ZXY", "ZYX", "YZX", "XZY"] as const) {
      bone.rotation.set(0.2, 0.3, 0.4, order);
      normal.rotation.set(0.2, 0.3, 0.4, order);
      bone.flushRotation();
      expect(bone.quaternion.toArray()).toEqual(normal.quaternion.toArray());
      const count = convert.mock.calls.length;
      for (let i = 0; i < 100; i++) {
        bone.rotation.set(0, 0, 0);
        bone.rotation.set(0.2, 0.3, 0.4, order);
        bone.flushRotation();
      }
      expect(convert).toHaveBeenCalledTimes(count);
    }
    bone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1);
    bone.rotation.set(0.2, 0.3, 0.4, "XZY");
    bone.flushRotation();
    expect(bone.quaternion.toArray()).toEqual(normal.quaternion.toArray());
  });
  it("updates only the active crowd representation, including the procedural load-failure fallback", () => {
    const stadium = Object.assign(Object.create(Stadium.prototype), {
      photoCrowdReady: true,
      photoMotion: { value: new THREE.Vector2() },
      crowdMotion: { value: new THREE.Vector4() },
      flagTime: {},
      grassWind: { value: new THREE.Vector4() },
      crowdEnergy: { value: 0 },
      lastUpdate: 0,
      cheerStart: -100,
      cheerStrength: 0,
      confetti: { update: vi.fn() },
      netRipple: { update: vi.fn() },
    });
    const photo = vi.spyOn(stadium.photoMotion.value, "set"),
      fallback = vi.spyOn(stadium.crowdMotion.value, "set");
    stadium.update(1);
    expect(photo).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    stadium.photoCrowdReady = false;
    stadium.update(2);
    expect(photo).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
    expect(stadium.crowdMotion.value.x).toBe(Math.cos(-2 * 2.1));
  });
});

describe("coherent replay seeking retains exact binary-search semantics", () => {
  it("matches a binary reference at duplicates, forward playback, arbitrary seeks, clears and appended samples", () => {
    const replay = new ReplayBuffer(),
      ball = launchBall(setup),
      keeper = createKeeper(0),
      times: number[] = [];
    for (let i = 0; i < 100; i++) {
      ball.time = Math.floor(i / 2) / 60;
      ball.position.x = i;
      replay.record(ball, keeper);
      times.push(ball.time);
    }
    const check = (time: number) => {
      let lo = 0,
        hi = times.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (times[mid] <= time) lo = mid;
        else hi = mid - 1;
      }
      const next = Math.min(lo + 1, times.length - 1),
        span = times[next] - times[lo];
      const t =
        span > 0 ? Math.max(0, Math.min(1, (time - times[lo]) / span)) : 0;
      const expected = lo + (next - lo) * t;
      replay.sampleTime(time, ball, keeper);
      expect(ball.position.x).toBeCloseTo(expected, 12);
    };
    for (let i = -1; i < 500; i++) check(i / 300);
    for (const time of [1, 0, 0.2, 0.8, -2, 100, 0.15, 0.15, 0.5, 0.02])
      check(time);
    ball.time = 1;
    ball.position.x = 100;
    replay.record(ball, keeper);
    times.push(1);
    check(0.99);
    replay.clear();
    expect(replay.sampleTime(0.5, ball, keeper)).toBe(false);
    ball.position.x = 42;
    ball.time = 0;
    replay.record(ball, keeper);
    replay.sampleTime(2, ball, keeper);
    expect(ball.position.x).toBe(42);
  });
  it("keeps run-up transforms and pose phase identical across forward/backward seeks and reuse", () => {
    const runup = new RunupBuffer(),
      position: Vec3 = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 100; i++)
      runup.record(i / 60, i / 120, { x: i, y: 2 * i, z: 3 * i }, i / 100);
    for (const t of [
      ...Array.from({ length: 200 }, (_, i) => i / 120),
      0.8,
      0.2,
      2,
      -1,
      0.25,
    ]) {
      const f = Math.max(0, Math.min(99, t * 60)),
        result = runup.sample(t, position);
      expect(position.x).toBeCloseTo(f, 12);
      expect(position.y).toBeCloseTo(f * 2, 12);
      expect(position.z).toBeCloseTo(f * 3, 12);
      expect(result.phase).toBeCloseTo(f / 120, 12);
      expect(result.yaw).toBeCloseTo(f / 100, 12);
    }
    runup.clear();
    expect(runup.sample(0, position)).toEqual({ phase: 0, yaw: 0 });
    runup.record(0, 1, { x: 7, y: 8, z: 9 }, 2);
    expect(runup.sample(1, position)).toEqual({ phase: 1, yaw: 2 });
    expect(position).toEqual({ x: 7, y: 8, z: 9 });
  });
  it("does not evaluate inverse trig for nearly identical ball orientations", () => {
    const replay = new ReplayBuffer(),
      ball = launchBall(setup),
      keeper = createKeeper(0),
      orientation = new THREE.Quaternion();
    replay.record(ball, keeper, orientation);
    ball.time = 1;
    replay.record(ball, keeper, orientation);
    const acos = vi.spyOn(Math, "acos");
    replay.sampleTime(0.5, ball, keeper, orientation);
    expect(acos).not.toHaveBeenCalled();
    expect(orientation.toArray()).toEqual([0, 0, 0, 1]);
  });
});

describe("post-processing memory and uniform invariants", () => {
  const make = () => {
    const renderer = {
      getPixelRatio: () => 2,
      getSize: (out: THREE.Vector2) => out.set(400, 300),
    } as unknown as THREE.WebGLRenderer;
    return new PostStack(
      renderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(30, 1, 0.05, 450),
    );
  };
  it("removes depth from all eleven bloom-only targets, never from the RenderPass source", () => {
    const post = make();
    post.configure(
      { antialias: "fxaa", bloom: true, dof: true, quality: "high" },
      400,
      300,
    );
    const internal = post as any,
      bloom = internal.bloom;
    expect([
      bloom.renderTargetBright,
      ...bloom.renderTargetsHorizontal,
      ...bloom.renderTargetsVertical,
    ]).toHaveLength(11);
    for (const target of [
      bloom.renderTargetBright,
      ...bloom.renderTargetsHorizontal,
      ...bloom.renderTargetsVertical,
    ])
      expect(target.depthBuffer).toBe(false);
    for (const material of [
      bloom.materialHighPassFilter,
      ...bloom.separableBlurMaterials,
      bloom.compositeMaterial,
      internal.aa.material,
    ]) {
      expect(material.depthTest).toBe(false);
      expect(material.depthWrite).toBe(false);
    }
    expect(internal.composer.renderTarget2.depthBuffer).toBe(true);
    expect(internal.composer.renderTarget2.depthTexture).not.toBeNull();
    post.dispose();
  });
  it("coalesces identical dimension notifications, but still handles DPR-only and actual resizes", () => {
    const post = make();
    post.configure(
      { antialias: "fxaa", bloom: true, dof: true, quality: "high" },
      400,
      300,
    );
    const internal = post as any;
    const pixels = vi.spyOn(internal.grade.uniforms.uPixels.value, "set"),
      resolution = vi.spyOn(internal.aa.uniforms.resolution.value, "set"),
      resize = vi.spyOn(internal.composer, "setSize");
    for (let i = 0; i < 100; i++) post.setSize(400, 300);
    expect(pixels).not.toHaveBeenCalled();
    expect(resolution).not.toHaveBeenCalled();
    expect(resize).not.toHaveBeenCalled();
    post.setSize(500, 350);
    expect(pixels).toHaveBeenCalledWith(1000, 700);
    expect(resize).toHaveBeenCalledOnce();
    internal.renderer.getPixelRatio = () => 1.5;
    post.setSize(500, 350);
    expect(pixels).toHaveBeenLastCalledWith(750, 525);
    post.dispose();
  });
  it("recomputes focal length only on FOV changes while keeping focus and clipping planes live", () => {
    const post = make();
    post.configure(
      { antialias: "off", bloom: false, dof: true, quality: "high" },
      400,
      300,
    );
    const internal = post as any,
      tan = vi.spyOn(Math, "tan");
    post.focus(10);
    post.focus(12);
    post.focus(14);
    expect(tan).toHaveBeenCalledOnce();
    internal.camera.near = 0.2;
    internal.camera.far = 100;
    post.focus(2);
    expect(internal.grade.uniforms.uLens.value.toArray().slice(0, 3)).toEqual([
      0.2, 100, 2,
    ]);
    internal.camera.fov = 45;
    post.focus(8);
    expect(tan).toHaveBeenCalledTimes(2);
    expect(internal.grade.uniforms.uLens.value.w).toBe(
      0.024 / (2 * Math.tan(THREE.MathUtils.degToRad(45) * 0.5)),
    );
    post.dispose();
  });
});

describe("run-up work sharing preserves the original approach", () => {
  it("matches the original ground path and yaw for both feet across the legal pitch", () => {
    const arena = Object.assign(Object.create(Arena.prototype), {
      settings: cloneSettings(DEFAULT_SETTINGS),
      takerHere: { x: 0, z: 0 },
      takerBefore: { x: 0, z: 0 },
      taker: { group: new THREE.Group() },
    });
    const ground = (run: number) => {
      const p = arena.settings.position,
        side = arena.settings.foot === "right" ? -1 : 1;
      const t = Math.min(1, Math.max(0, run) / 0.9),
        e = t ** 1.35,
        length = Math.hypot(p.x, p.z);
      const back = 4.8 + (0.21 - 4.8) * e,
        lateral = side * (1.6 + (0.22 - 1.6) * Math.pow(e, 0.7));
      return {
        x: p.x + (p.x / length) * back + (p.z / length) * lateral,
        z: p.z + (p.z / length) * back - (p.x / length) * lateral,
      };
    };
    for (const foot of ["left", "right"])
      for (const x of [-28, -12, 0, 12, 28])
        for (const z of [17.5, 24, 46])
          for (let step = 0; step <= 128; step++) {
            arena.settings.foot = foot;
            arena.settings.position = { x, z };
            const run = step / 128;
            const here = ground(run),
              before = ground(Math.max(0, run - 0.02)),
              dx = here.x - before.x,
              dz = here.z - before.z;
            const travel =
              Math.hypot(dx, dz) > 1e-4
                ? Math.atan2(-dx, -dz)
                : Math.atan2(-(x - here.x), -(z - here.z));
            const face = Math.atan2(-(x - here.x), -(z - here.z)),
              turn = Math.min(1, Math.max(0, (run - 0.85) / 0.15));
            arena.positionTaker(run);
            expect(arena.taker.group.position.toArray()).toEqual([
              here.x,
              0,
              here.z,
            ]);
            expect(arena.taker.group.rotation.y).toBe(
              travel + (face - travel) * turn,
            );
          }
  });
});

it("removes 4,073,310 bloom depth samples at native 3088 x 1440 without changing any colour-target dimensions", () => {
  const renderer = {
    getPixelRatio: () => 1,
    getSize: (out: THREE.Vector2) => out.set(3088, 1440),
  } as unknown as THREE.WebGLRenderer;
  const post = new PostStack(
    renderer,
    new THREE.Scene(),
    new THREE.PerspectiveCamera(),
  );
  post.configure(
    { antialias: "fxaa", bloom: true, dof: true, quality: "high" },
    3088,
    1440,
  );
  const bloom = (post as any).bloom,
    targets = [
      bloom.renderTargetBright,
      ...bloom.renderTargetsHorizontal,
      ...bloom.renderTargetsVertical,
    ];
  expect(
    targets.reduce((sum, target) => sum + target.width * target.height, 0),
  ).toBe(4073310);
  expect(targets.every((target) => !target.depthBuffer)).toBe(true);
  expect((post as any).composer.renderTarget2.width).toBe(3088);
  expect((post as any).composer.renderTarget2.height).toBe(1440);
  post.dispose();
});
