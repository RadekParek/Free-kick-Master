import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  PLAYERS,
  getPlayer,
  gameplayBonuses,
  playStyleFor,
} from "../../src/players";
import {
  launchBall,
  integrateBall,
  previewShot,
  shotSpeed,
  strikeName,
  type ShotSetup,
} from "../../src/game/physics";
import baseline from "../fixtures/finite-range-physics.json";
import { Stadium } from "../../src/game/stadium";
import { DeferredBone } from "../../src/game/deferred-bone";
import { BroadcastOutputPass, PostStack } from "../../src/game/post";
import { surfaceDetail } from "../../src/game/surface-detail";
import { graphicsForPreset, loadSettings, saveSettings } from "../../src/state";
import { footballSurface, surfacePixel } from "../../src/game/ball-surface";
import { replayView } from "../../src/game/replay-view";
import { playerLook } from "../../src/game/appearance";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const setup: ShotSetup = {
  position: { x: 0, z: 24 },
  aim: { x: 1.3, y: 1.8 },
  contact: { x: -0.43, y: 0 },
  power: 0.8,
  foot: "right",
  seed: 1729,
};

describe("gameplay-only ICON bonuses and expanded offline roster", () => {
  it("has 57 photographed cards, 7 ICONs, Juninho and both Mbappé assignments", () => {
    expect(PLAYERS).toHaveLength(57);
    expect(PLAYERS.filter((p) => p.edition === "icon")).toHaveLength(7);
    for (const id of ["juninho", "pirlo", "mbappe", "mbappe-special"])
      expect(playStyleFor(getPlayer(id).baseId)).toBe("deadball");
    for (const p of PLAYERS) expect(p.portrait).toMatch(/^\.\/players\//);
  });
  it("adds exactly 10 km/h and five curve in physics for every ICON, never on the card", () => {
    for (const p of PLAYERS) {
      const before = structuredClone(p),
        bonus = gameplayBonuses(p),
        normal = launchBall({
          ...setup,
          attributes: p.attributes,
          playStyle: playStyleFor(p.baseId),
        });
      const boosted = launchBall({
        ...setup,
        attributes: p.attributes,
        playStyle: playStyleFor(p.baseId),
        speedBonusKph: bonus.speedKph,
        curveBonus: bonus.curve,
      });
      expect(
        (Math.hypot(...Object.values(boosted.velocity)) -
          Math.hypot(...Object.values(normal.velocity))) *
          3.6,
      ).toBeCloseTo(p.edition === "icon" ? 10 : 0, 9);
      const expected = launchBall({
        ...setup,
        attributes: {
          ...p.attributes,
          curve: p.attributes.curve + bonus.curve,
        },
        playStyle: playStyleFor(p.baseId),
      });
      expect(boosted.sideSpin).toBe(expected.sideSpin);
      expect(p).toEqual(before);
      if (p.edition === "icon")
        expect(
          previewShot({
            ...setup,
            attributes: p.attributes,
            speedBonusKph: 10,
            curveBonus: 5,
          }),
        ).not.toEqual(previewShot({ ...setup, attributes: p.attributes }));
    }
    expect(getPlayer("roberto-carlos").attributes).toMatchObject({
      power: 99,
      curve: 99,
    });
    expect(
      shotSpeed(0.8, getPlayer("roberto-carlos").attributes, "power") * 3.6,
    ).toBeLessThan(200);
  });
  it("slightly enlarges the central hard-strike sweet spot, without changing curl/off-centre classification", () => {
    expect(launchBall({ ...setup, contact: { x: 0.18, y: 0 } }).knuckle).toBe(
      true,
    );
    expect(strikeName({ x: 0.18, y: 0 }, "right")).toBe("Knuckleball");
    expect(launchBall({ ...setup, contact: { x: 0.2, y: 0 } }).knuckle).toBe(
      false,
    );
    expect(
      launchBall({ ...setup, power: 0.6, contact: { x: 0.18, y: 0 } }).knuckle,
    ).toBe(false);
  });
  it("has dedicated Neymar fade, blonde Yamal fade and R9 frontal patch identities", () => {
    expect(playerLook(getPlayer("neymar")).hair).toBe("neymar-fade");
    expect(playerLook(getPlayer("yamal")).hair).toBe("fade-curls");
    expect(playerLook(getPlayer("ronaldo-nazario")).hair).toBe("r9");
    expect(playerLook(getPlayer("yamal"))).toEqual(
      playerLook(getPlayer("yamal-special")),
    );
  });
});

describe("quality-preserving numerical and GPU-memory optimizations", () => {
  it("matches pre-optimization Math.hypot trajectories after 360 fixed steps to sub-nanometre precision", () => {
    for (const sample of baseline) {
      const ball = launchBall(sample.setup as ShotSetup);
      for (let i = 0; i < 360; i++) integrateBall(ball);
      for (const axis of ["x", "y", "z"] as const) {
        expect(ball.position[axis]).toBeCloseTo(sample.position[axis], 9);
        expect(ball.velocity[axis]).toBeCloseTo(sample.velocity[axis], 9);
      }
      expect(ball.bounces).toBe(sample.bounces);
    }
  });
  it("coalesces Euler component writes but preserves intervening world-position queries and direct quaternion edits", () => {
    const deferred = new DeferredBone(),
      normal = new THREE.Group();
    const conversions = vi.spyOn(deferred.quaternion, "setFromEuler");
    for (let i = 0; i < 50; i++) {
      for (const bone of [deferred, normal]) {
        bone.rotation.x = i * 0.01;
        bone.rotation.y = i * -0.013;
        bone.rotation.z = i * 0.008;
      }
      deferred.flushRotation();
      expect(deferred.quaternion.angleTo(normal.quaternion)).toBeLessThan(1e-7);
    }
    // The identity pose now needs no conversion; all 49 genuinely different poses still do.
    expect(conversions).toHaveBeenCalledTimes(49);
    deferred.rotation.x = 0.7;
    normal.rotation.x = 0.7;
    expect(
      deferred
        .localToWorld(new THREE.Vector3(0, -0.3, 0.1))
        .distanceTo(normal.localToWorld(new THREE.Vector3(0, -0.3, 0.1))),
    ).toBeLessThan(1e-12);
    deferred.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
    deferred.flushRotation();
    expect(deferred.rotation.y).toBeCloseTo(0.6);
  });
  it("keeps the procedural crowd on load failure, then frees only its duplicate allocations on success", () => {
    let loaded: ((texture: THREE.Texture) => void) | undefined,
      failed: ((error: unknown) => void) | undefined;
    vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(
      (_url, onLoad, _progress, onError) => {
        loaded = onLoad;
        failed = onError;
        return new THREE.Texture();
      },
    );
    const group = new THREE.Group(),
      geometry = new THREE.BoxGeometry(),
      material = new THREE.MeshStandardMaterial();
    const roots = Array.from({ length: 3 }, () => {
      const root = new THREE.Group();
      root.add(new THREE.InstancedMesh(geometry, material, 3));
      group.add(root);
      return root;
    });
    const disposedGeometry = vi.spyOn(geometry, "dispose"),
      disposedMaterial = vi.spyOn(material, "dispose");
    const photoCrowd = new THREE.Group();
    const stadium = Object.assign(Object.create(Stadium.prototype), {
      group,
      crowd: roots[0],
      crowdHeads: roots[1],
      crowdSeats: roots[2],
      photoCrowd,
      photoCrowdMaterial: new THREE.MeshBasicMaterial(),
      photoMotion: { value: new THREE.Vector2() },
      crowdEnergy: { value: 0 },
      setQuality: vi.fn(),
      quality: "high",
      disposed: false,
    });
    stadium.makePhotoCrowd();
    failed!(new Error("offline texture unavailable"));
    expect(
      roots.every((r) => r.parent === group && r.children.length === 1),
    ).toBe(true);
    expect(disposedGeometry).not.toHaveBeenCalled();
    expect(photoCrowd.visible).toBe(false);
    const texture = new THREE.Texture();
    loaded!(texture);
    expect(disposedGeometry).toHaveBeenCalledOnce();
    expect(disposedMaterial).toHaveBeenCalledOnce();
    expect(
      roots.every((r) => r.parent === null && r.children.length === 0),
    ).toBe(true);
    expect(photoCrowd.parent).toBe(group);
    expect(photoCrowd.visible).toBe(true);
    expect(stadium.photoCrowdMaterial.map).toBe(texture);
  });
  it.each(["fxaa", "smaa", "off"] as const)(
    "allocates depth only on actual RenderPass sources with %s",
    (antialias) => {
      vi.stubGlobal(
        "Image",
        class {
          src = "";
          onload: unknown = null;
        },
      );
      const renderer = { getPixelRatio: () => 1 } as THREE.WebGLRenderer;
      const post = new PostStack(
        renderer,
        new THREE.Scene(),
        new THREE.PerspectiveCamera(),
      );
      post.configure(
        { antialias, bloom: false, dof: true, quality: "high" },
        3088,
        1440,
      );
      const stack = post as any;
      expect(stack.composer.renderTarget2.depthTexture).toBeInstanceOf(
        THREE.DepthTexture,
      );
      expect(stack.composer.renderTarget1.depthBuffer).toBe(
        antialias === "off",
      );
      expect(!!stack.composer.renderTarget1.depthTexture).toBe(
        antialias === "off",
      );
      expect(stack.composer.renderTarget1.samples).toBe(0);
      post.dispose();
    },
  );
});

describe("Ultra shaders and persistence", () => {
  it("leaves every legacy preset unchanged and opts Ultra into independently editable effects", () => {
    expect(graphicsForPreset("high", false)).toEqual({
      preset: "high",
      resolution: 1,
      antialias: "fxaa",
      bloom: true,
      dof: true,
      shadows: 1024,
    });
    const ultra = graphicsForPreset("ultra", true);
    expect(ultra).toMatchObject({
      resolution: 1,
      antialias: "smaa",
      ambientOcclusion: true,
      lensEffects: true,
      surfaceDetail: true,
    });
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k),
      setItem: (k: string, v: string) => store.set(k, v),
    });
    const settings = loadSettings();
    settings.graphics = {
      ...ultra,
      preset: "custom",
      dof: false,
      ambientOcclusion: true,
      lensEffects: false,
    };
    saveSettings(settings);
    expect(loadSettings().graphics).toEqual(settings.graphics);
  });
  it("keeps lens-strength changes on the existing target topology; AO-only has a valid depth shader", () => {
    const post = new PostStack(
      { getPixelRatio: () => 1 } as THREE.WebGLRenderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
    );
    const options = {
      antialias: "fxaa" as const,
      bloom: false,
      dof: false,
      ambientOcclusion: true,
      quality: "high" as const,
    };
    post.configure(options, 800, 600);
    const stack = post as any,
      composer = stack.composer;
    expect(stack.grade.material.fragmentShader).toContain("float occ=0.");
    expect(
      stack.grade.material.fragmentShader.match(/float dz=z-viewDepth/g),
    ).toHaveLength(6);
    post.configure({ ...options, lensEffects: true }, 800, 600);
    expect(stack.composer).toBe(composer);
    expect(stack.grade.uniforms.uLensEffects.value).toBe(1);
    post.dispose();
  });
  it("removes advanced actor work by define in old presets, reuses material allocations when toggled", () => {
    const material = new THREE.MeshStandardMaterial();
    material.name = "skin";
    surfaceDetail(material, false);
    expect((material as any).defines.ATHLETE_DETAIL).toBeUndefined();
    surfaceDetail(material, true);
    const version = material.version;
    expect((material as any).defines.ATHLETE_DETAIL).toBe(1);
    surfaceDetail(material, true);
    expect(material.version).toBe(version);
    const shader = {
      fragmentShader:
        "#include <roughnessmap_fragment>\n#include <lights_fragment_end>",
    };
    material.onBeforeCompile(shader as never, {} as never);
    expect(shader.fragmentShader).toContain("#ifdef ATHLETE_DETAIL");
    expect(shader.fragmentShader).toContain("geometryViewDir");
    surfaceDetail(material, false);
    expect((material as any).defines.ATHLETE_DETAIL).toBeUndefined();
    material.dispose();
  });
  it("builds optional shading before tone mapping, and still has a neutral no-depth variant", () => {
    const pass = new BroadcastOutputPass(false, true, true),
      src = pass.material.fragmentShader;
    expect(src.indexOf("float occ=0.")).toBeLessThan(
      src.indexOf("// tone mapping"),
    );
    expect(src.indexOf("precision highp float")).toBeLessThan(
      src.indexOf("uniform float uLensEffects"),
    );
    pass.dispose();
    const neutral = new BroadcastOutputPass();
    expect(neutral.uniforms.tDepth).toBeUndefined();
    expect(neutral.material.fragmentShader).not.toContain("float occ=0.");
    neutral.dispose();
  });
});

describe("ball graphics and shot-angle camera families", () => {
  it("has seamless deterministic opaque colour/relief with blue, red, green and warm seam accents", () => {
    const a = footballSurface(128, 64);
    expect(a).toEqual(footballSurface(128, 64));
    let red = 0,
      blue = 0,
      green = 0;
    for (let i = 0; i < a.color.length; i += 4) {
      const [r, g, b] = a.color.subarray(i, i + 3);
      red += Number(r > g * 1.5 && r > b * 1.5);
      blue += Number(b > r * 1.5 && b > g * 1.1);
      green += Number(g > r * 1.5 && g > b * 1.1);
      expect(a.color[i + 3]).toBe(255);
    }
    expect(Math.min(red, blue, green)).toBeGreaterThan(30);
    const c = new Uint8ClampedArray(8),
      r = new Uint8ClampedArray(8);
    surfacePixel(-1, 0, 1e-12, c, r, 0);
    surfacePixel(-1, 0, -1e-12, c, r, 4);
    expect(c.slice(0, 4)).toEqual(c.slice(4));
  });
  it("chooses mirrored and wider tracking cameras from actual shot bearing and preferred foot", () => {
    expect(replayView({ x: 0, z: 25 }, { x: 1, y: 2 }, "right")).toMatchObject({
      side: 1,
      wide: false,
    });
    expect(replayView({ x: 0, z: 25 }, { x: 1, y: 2 }, "left").side).toBe(-1);
    expect(
      replayView({ x: 18, z: 20 }, { x: -2, y: 2 }, "right"),
    ).toMatchObject({ side: -1, wide: true });
    expect(
      replayView({ x: -18, z: 20 }, { x: 2, y: 2 }, "right"),
    ).toMatchObject({ side: 1, wide: true });
  });
});
