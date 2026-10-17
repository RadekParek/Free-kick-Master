import { expect, test, type Page } from "@playwright/test";

async function pausedArena(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "fkm.settings.v1",
      JSON.stringify({
        quality: "low",
        sound: false,
        music: false,
        playerId: "juninho",
      }),
    ),
  );
  await page.goto("/");
  await expect(page.locator("#app")).toHaveClass("is-ready");
  await page.locator("#menu-practice").click();
  await page.evaluate(async () => {
    const path = "/src/game/arena.ts";
    const { Arena } = await import(path),
      original = Arena.prototype.charge;
    Arena.prototype.charge = function () {
      (window as any).performanceArena = this;
      Arena.prototype.charge = original;
      return original.call(this);
    };
  });
  await page.keyboard.down("Space");
  await page.waitForFunction(() => !!(window as any).performanceArena);
  await page.evaluate(() => (window as any).performanceArena.setPaused(true));
  await page.keyboard.up("Space");
}

test("bloom depth removal and full-screen depth-state changes preserve exact GPU pixels across all AA/depth variants", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await pausedArena(page);
  const result = await page.evaluate(async () => {
    const threePath = "/node_modules/.vite/deps/three.js",
      postPath = "/src/game/post.ts";
    const THREE = await import(threePath),
      { PostStack } = await import(postPath);
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setPixelRatio(1.5);
    renderer.setSize(256, 192, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#182334");
    scene.add(new THREE.HemisphereLight("#ffffff", "#293218", 2));
    const light = new THREE.DirectionalLight("#fff2ce", 3);
    light.position.set(-2, 6, 4);
    scene.add(light);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshStandardMaterial({ color: "#326744" }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshStandardMaterial({ color: "#cd244b" }),
    );
    box.position.y = 1;
    scene.add(box);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 32, 24),
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        emissive: "#fff7ce",
        emissiveIntensity: 5,
      }),
    );
    glow.position.set(1.1, 1.4, -0.3);
    scene.add(glow);
    const camera = new THREE.PerspectiveCamera(38, 256 / 192, 0.05, 100);
    camera.position.set(4, 3, 6);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    const post = new PostStack(renderer, scene, camera),
      comparisons = [];
    const gl = renderer.getContext();
    for (const antialias of ["off", "fxaa", "smaa"])
      for (const dof of [false, true])
        for (const ambientOcclusion of [false, true]) {
          post.configure(
            {
              antialias,
              bloom: true,
              dof,
              ambientOcclusion,
              lensEffects: true,
              quality: "high",
            },
            256,
            192,
          );
          if (antialias === "smaa") {
            await Promise.all([
              post.aa._areaTexture.image.decode(),
              post.aa._searchTexture.image.decode(),
            ]);
            post.aa._areaTexture.needsUpdate =
              post.aa._searchTexture.needsUpdate = true;
          }
          post.focus(6);
          const targets = [
            post.bloom.renderTargetBright,
            ...post.bloom.renderTargetsHorizontal,
            ...post.bloom.renderTargetsVertical,
          ];
          const materials = [
            post.bloom.materialHighPassFilter,
            ...post.bloom.separableBlurMaterials,
            post.bloom.compositeMaterial,
          ];
          if (antialias === "fxaa") materials.push(post.aa.material);
          for (let i = 0; i < 3; i++) post.render();
          const optimized = renderer.domElement.toDataURL();
          let missing = 0;
          for (const target of targets) {
            renderer.setRenderTarget(target);
            if (
              gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                gl.DEPTH_ATTACHMENT,
                gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE,
              ) === gl.NONE
            )
              missing++;
          }
          renderer.setRenderTarget(null);
          // Restore precisely the old bloom/FXAA defaults, not an approximate reference shader.
          for (const target of targets) {
            target.depthBuffer = true;
            target.dispose();
          }
          for (const material of materials)
            material.depthTest = material.depthWrite = true;
          for (let i = 0; i < 3; i++) post.render();
          const baseline = renderer.domElement.toDataURL();
          let restored = 0;
          for (const target of targets) {
            renderer.setRenderTarget(target);
            if (
              gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                gl.DEPTH_ATTACHMENT,
                gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE,
              ) === gl.RENDERBUFFER
            )
              restored++;
          }
          renderer.setRenderTarget(null);
          comparisons.push({
            antialias,
            dof,
            ambientOcclusion,
            identical: optimized === baseline,
            missing,
            restored,
          });
        }
    const image = renderer.domElement.toDataURL();
    post.dispose();
    renderer.dispose();
    scene.traverse((object: any) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
    return {
      comparisons,
      image,
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      glError: gl.getError(),
    };
  });
  expect(result.comparisons).toHaveLength(12);
  for (const comparison of result.comparisons)
    expect(comparison, JSON.stringify(comparison)).toMatchObject({
      identical: true,
      missing: 11,
      restored: 11,
    });
  expect(result.width).toBe(384);
  expect(result.height).toBe(288);
  expect(result.glError).toBe(0);
  await test.info().attach("performance-gpu-pixel-reference", {
    body: Buffer.from(result.image.split(",")[1], "base64"),
    contentType: "image/png",
  });
  expect(errors).toEqual([]);
});

test("world labels stop redundant DOM mutations, keep live values/cameras, and skip hidden head-anchor reads", async ({
  page,
}) => {
  await pausedArena(page);
  const result = await page.evaluate(async () => {
    const threePath = "/node_modules/.vite/deps/three.js",
      labelsPath = "/src/game/world-labels.ts";
    const THREE = await import(threePath),
      { WorldLabels } = await import(labelsPath);
    const container = document.createElement("div");
    document.body.append(container);
    const labels = new WorldLabels(container),
      camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100),
      point = new THREE.Vector3(0, 1, 0);
    camera.position.set(0, 1, 5);
    camera.lookAt(point);
    camera.updateMatrixWorld();
    const show = (target: number | undefined, dt: number, decimals = 1) =>
      labels.show(
        "speed",
        "BALL SPEED",
        target,
        decimals,
        "KM/H",
        point,
        camera,
        600,
        600,
        dt,
      );
    show(100, 0.5);
    labels.playstyle("deadball", true, point, camera, 600, 600);
    const observer = new MutationObserver(() => {});
    observer.observe(labels.root, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });
    for (let i = 0; i < 100; i++) {
      show(100, 1 / 60);
      labels.playstyle("deadball", true, point, camera, 600, 600);
    }
    const stationaryMutations = observer.takeRecords().length;
    show(120, 0);
    const changedValue = labels.root.querySelector("b")!.textContent;
    show(120, 0, 2);
    const changedPrecision = labels.root.querySelector("b")!.textContent;
    const previousTransform = (
      labels.root.querySelector(".world-stat") as HTMLElement
    ).style.transform;
    point.x = 0.5;
    show(120, 0);
    const cameraStillTracks =
      previousTransform !==
      (labels.root.querySelector(".world-stat") as HTMLElement).style.transform;
    show(undefined, 0);
    const pending = labels.root.querySelector("b")!.textContent;
    show(130, 0);
    const resolved = labels.root.querySelector("b")!.textContent;
    labels.hideStats();
    labels.show(
      "height",
      "HEIGHT",
      2,
      2,
      "METRES",
      point,
      camera,
      600,
      600,
      0.18,
    );
    const restartedCountUp = Number(
      labels.root.querySelector("b")!.textContent,
    );
    labels.hideStats();
    observer.takeRecords();
    for (let i = 0; i < 100; i++) labels.hideStats();
    const hiddenMutations = observer.takeRecords().length;
    observer.disconnect();
    labels.dispose();
    container.remove();
    const a = (window as any).performanceArena,
      head = a.taker.headWorldPosition.bind(a.taker),
      calls: number[] = [];
    let count = 0;
    a.taker.headWorldPosition = (point: any) => {
      count++;
      return head(point);
    };
    a.paused = false;
    for (const phase of ["ready", "charging", "runup", "flight", "result"]) {
      a.phase = phase;
      a.ball.time = 0.4;
      const before = count;
      a.updateWorldLabels(0.5);
      calls.push(count - before);
    }
    a.paused = true;
    a.taker.headWorldPosition = head;
    return {
      stationaryMutations,
      hiddenMutations,
      changedValue,
      changedPrecision,
      cameraStillTracks,
      pending,
      resolved,
      restartedCountUp,
      calls,
    };
  });
  expect(result).toMatchObject({
    stationaryMutations: 0,
    hiddenMutations: 0,
    changedValue: "120.0",
    changedPrecision: "120.00",
    cameraStillTracks: true,
    pending: "…",
    resolved: "130.0",
    calls: [0, 1, 1, 0, 0],
  });
  expect(result.restartedCountUp).toBe(1);
});

test("cached roster nodes/search keys survive accents, filters and modal recreation without repeating per-card normalization", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "fkm.settings.v1",
      JSON.stringify({ quality: "low", sound: false, music: false }),
    ),
  );
  await page.goto("/");
  await expect(page.locator("#app")).toHaveClass("is-ready");
  await page.locator("#menu-players").click();
  await page.evaluate(() => {
    const original = String.prototype.normalize;
    (window as any).searchNormalizations = 0;
    String.prototype.normalize = function (form) {
      if (form === "NFD") (window as any).searchNormalizations++;
      return original.call(this, form);
    };
  });
  await page.locator("#player-search").fill("mbappe");
  await expect(page.locator(".player-card[data-player]:visible")).toHaveCount(
    2,
  );
  await page.locator("#player-search").fill("mbappé");
  await expect(page.locator(".player-card[data-player]:visible")).toHaveCount(
    2,
  );
  await page.locator("#player-search").fill("pirlo");
  await expect(page.locator(".player-card[data-player]:visible")).toHaveCount(
    1,
  );
  expect(await page.evaluate(() => (window as any).searchNormalizations)).toBe(
    3,
  );
  await page.locator('[data-edition-filter="icon"]').click();
  await expect(page.locator('[data-player="pirlo"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("#menu-players").click();
  await expect(page.locator(".player-card[data-player]:visible")).toHaveCount(
    57,
  );
  await page.locator("#player-search").fill("messi");
  await page.locator('[data-player="messi"]').click();
  await page.locator("#confirm-player").click();
  await page.locator("#menu-practice").click();
  await expect(page.locator("#taker-name")).toHaveText("Messi");
});
