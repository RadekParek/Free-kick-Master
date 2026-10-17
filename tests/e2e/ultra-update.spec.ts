import { expect, test, type Page } from "@playwright/test";

async function captureArena(page: Page, playerId = "juninho") {
  await page.addInitScript(
    (id) =>
      localStorage.setItem(
        "fkm.settings.v1",
        JSON.stringify({
          playerId: id,
          quality: "low",
          sound: false,
          music: false,
        }),
      ),
    playerId,
  );
  await page.goto("/");
  await expect(page.locator("#app")).toHaveClass("is-ready");
  await page.locator("#menu-practice").click();
  await page.evaluate(async () => {
    const path = performance
      .getEntriesByType("resource")
      .find((e) => new URL(e.name).pathname === "/src/game/arena.ts")!.name;
    const { Arena } = await import(path),
      original = Arena.prototype.charge;
    Arena.prototype.charge = function () {
      (window as any).upgradeArena = this;
      Arena.prototype.charge = original;
      return original.call(this);
    };
  });
  await expect(page.locator("#shoot-button")).toBeEnabled();
  await page.keyboard.down("Space");
  await page.waitForFunction(() => !!(window as any).upgradeArena);
}

test("charging PlayStyle follows the head, fades after contact, and the ball stays above technique names on phones", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await captureArena(page);
  await expect(page.locator(".world-playstyle")).toHaveClass(/is-visible/);
  await expect(page.locator(".world-playstyle")).toHaveCSS("opacity", "1");
  await expect(page.locator(".world-playstyle")).toHaveAttribute(
    "data-playstyle",
    "deadball",
  );
  await page.waitForFunction(
    () =>
      (document.querySelector(".world-playstyle img") as HTMLImageElement)
        .naturalWidth > 0,
  );
  const anchored = await page.evaluate(() => {
    const a = (window as any).upgradeArena;
    a.setPaused(true);
    a.paused = false;
    a.phase = "charging";
    a.updateWorldLabels(0.5);
    a.paused = true;
    const badge = document
      .querySelector(".world-playstyle")!
      .getBoundingClientRect();
    a.taker.headWorldPosition(a.labelPoint);
    a.labelPoint.y += 0.36;
    a.labelPoint.project(a.camera);
    return {
      badgeX: badge.x + badge.width / 2,
      headX: (a.labelPoint.x * 0.5 + 0.5) * a.width,
      badgeBottom: badge.bottom,
      headY: (-a.labelPoint.y * 0.5 + 0.5) * a.height,
    };
  });
  expect(anchored.badgeX).toBeCloseTo(anchored.headX, 0);
  expect(anchored.badgeBottom).toBeLessThan(anchored.headY - 20);
  await page.screenshot({ path: ".artifacts/charging-playstyle.png" });
  await page.evaluate(() => {
    const a = (window as any).upgradeArena;
    a.setPaused(false);
  });
  await page.keyboard.up("Space");
  await page.waitForFunction(() => {
    const a = (window as any).upgradeArena;
    return a.phase === "flight" && a.ball.time > 0.55;
  });
  await expect(page.locator(".world-playstyle")).not.toHaveClass(/is-visible/);
  await expect(page.locator(".world-playstyle")).toHaveCSS("opacity", "0");
  await page.evaluate(() => {
    const a = (window as any).upgradeArena;
    a.setPaused(true);
    a.settings.playerId = "rice";
    a.reset();
    a.phase = "charging";
    a.updateWorldLabels(0.5);
  });
  await expect(page.locator(".world-playstyle")).not.toHaveClass(/is-visible/);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const ball = await page.locator("#contact-pad").boundingBox(),
      names = await page.locator(".contact-copy").boundingBox();
    expect(ball!.y + ball!.height).toBeLessThanOrEqual(names!.y + 1);
    expect(ball!.x).toBeGreaterThanOrEqual(0);
    expect(names!.x + names!.width).toBeLessThanOrEqual(viewport.width);
    expect(names!.y + names!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({
      path: `.artifacts/ball-layout-${viewport.width}.png`,
    });
  }
  expect(errors).toEqual([]);
});

test("replay reveals one calculated object-anchored metric per stage, including keeper proximity and goal entry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await captureArena(page);
  await page.keyboard.up("Space");
  await page.evaluate(() => {
    const a = (window as any).upgradeArena;
    a.replayFrames.clear();
    a.ball.time = 0;
    a.replayFrames.record(a.ball, a.keeper, a.football.quaternion);
    Object.assign(a.ball, {
      position: { x: 0, y: 1.1, z: 2.4 },
      velocity: { x: 0, y: 0, z: -25 },
      sideSpin: 0,
      topSpin: 0,
      knuckle: false,
      frameHits: 0,
      time: 0.8,
      bounces: 0,
    });
    a.keeper.x = 2;
    a.keeper.glove.x = 2;
    a.wall = [];
    a.frameCounter = 0;
    a.accumulator = 0;
    a.resultBallTime = Infinity;
    a.setPhase("flight");
  });
  await expect(page.locator("#app")).toHaveAttribute("data-phase", "replay");
  await page.evaluate(() => {
    const a = (window as any).upgradeArena;
    a.setPaused(true);
    a.lastResult.runupSpeed = 16.4;
  });
  const stages: [[number, string], ...Array<[number, string]>] = [
    [0.2, "distance"],
    [1, "runup-speed"],
    [1.9, "player-height"],
    [2.4, "power"],
    [3.8, "shot-speed"],
    [5.2, "keeper-height"],
    [6.2, "entry-height"],
    [7.8, "conversion"],
  ];
  for (const [clock, metric] of stages) {
    await page.evaluate((time) => {
      const a = (window as any).upgradeArena;
      a.replayClock = time;
      a.stepReplay(0);
      a.football.position.set(
        a.ball.position.x,
        a.ball.position.y,
        a.ball.position.z,
      );
      a.updateCamera(1, true);
      a.camera.updateMatrixWorld();
      a.taker.updateLod(a.camera);
      a.keeperModel.updateLod(a.camera);
      a.scene.updateMatrixWorld(true);
      a.updateWorldLabels(0.5);
      for (const animation of a.labels.root.getAnimations({ subtree: true }))
        animation.finish();
      a.post.render();
    }, clock);
    await expect(page.locator(".world-stat")).toHaveAttribute(
      "data-metric",
      metric,
    );
    await expect(page.locator(".world-stat")).toHaveClass(/is-visible/);
    await expect(page.locator(".world-stat")).toHaveCSS("opacity", "1");
    await expect(page.locator(".world-stat b")).toHaveText(
      metric === "conversion" ? /^\d+$|…/ : /^\d+(\.\d+)?$/,
    );
    if (
      ["power", "shot-speed", "keeper-height", "entry-height"].includes(metric)
    )
      await page.screenshot({ path: `.artifacts/replay-${metric}.png` });
  }
  const strike = await page.evaluate(() => {
    const a = (window as any).upgradeArena;
    a.replayClock = 2.4;
    a.stepReplay(0);
    a.football.position.set(
      a.ball.position.x,
      a.ball.position.y,
      a.ball.position.z,
    );
    a.updateCamera(1, true);
    return {
      range: a.camera.position.distanceTo(a.football.position),
      scale: a.football.scale.x,
    };
  });
  expect(strike.range).toBeLessThan(3.2);
  expect(strike.scale).toBe(1);
  const keeper = await page.locator("#analysis-keeper-height").textContent();
  expect(keeper).toBe("1.90");
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => {
      const a = (window as any).upgradeArena;
      a.resize();
      a.replayClock = 6.2;
      a.stepReplay(0);
      a.football.position.set(
        a.ball.position.x,
        a.ball.position.y,
        a.ball.position.z,
      );
      a.updateCamera(1, true);
      a.camera.updateMatrixWorld();
      a.updateWorldLabels(0.5);
      for (const animation of a.labels.root.getAnimations({ subtree: true }))
        animation.finish();
      a.post.render();
    });
    const rect = await page.locator(".world-stat").boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
  }
  expect(errors).toEqual([]);
});

test("Ultra surface/depth shaders compile, retain correct ping-pong depth, preserve baseline pixels and persist Custom switches", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await captureArena(page, "yamal");
  await page.keyboard.up("Space");
  await page.evaluate(() => (window as any).upgradeArena.setPaused(true));
  const rendered = await page.evaluate(async () => {
    const threePath = "/node_modules/.vite/deps/three.js",
      playerPath = "/src/game/player.ts",
      playersPath = "/src/players.ts",
      postPath = "/src/game/post.ts";
    const THREE = await import(threePath);
    const { Player } = await import(playerPath),
      { getPlayer } = await import(playersPath),
      { PostStack } = await import(postPath);
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(256, 256);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#203241");
    scene.add(new THREE.HemisphereLight("#edf2ff", "#5f5141", 2));
    const light = new THREE.DirectionalLight("#fff1dc", 3);
    light.position.set(-3, 5, -3);
    scene.add(light);
    const player = new Player("taker");
    player.setProfile(getPlayer("yamal"));
    scene.add(player.group);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshStandardMaterial({ color: "#294833" }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
    camera.position.set(0.25, 1.45, -3.1);
    camera.lookAt(0, 1.1, 0);
    camera.updateMatrixWorld();
    player.idle(0.5);
    player.updateLod(camera);
    const post = new PostStack(renderer, scene, camera),
      bindings = [],
      pixelEquality = [];
    for (const antialias of ["fxaa", "smaa"]) {
      post.configure(
        { antialias, bloom: false, dof: true, quality: "high" },
        256,
        256,
      );
      post.focus(3.2);
      for (let i = 0; i < 3; i++) {
        const depth = post.composer.readBuffer.depthTexture;
        post.render();
        bindings.push(depth === post.grade.uniforms.tDepth.value);
      }
      const optimized = renderer.domElement.toDataURL();
      post.composer.renderTarget1.depthBuffer = true;
      post.composer.renderTarget1.dispose();
      post.render();
      pixelEquality.push(optimized === renderer.domElement.toDataURL());
    }
    const variants = [];
    for (const dof of [false, true])
      for (const antialias of ["off", "fxaa", "smaa"]) {
        post.configure(
          {
            antialias,
            bloom: true,
            dof,
            ambientOcclusion: true,
            lensEffects: true,
            quality: "high",
          },
          256,
          256,
        );
        player.setSurfaceDetail(true);
        post.focus(3.2);
        for (let i = 0; i < 3; i++) {
          const source = post.composer.readBuffer.depthTexture;
          post.render();
          bindings.push(source === post.grade.uniforms.tDepth.value);
        }
        variants.push(renderer.domElement.toDataURL());
      }
    const ultra = variants.at(-1);
    player.setSurfaceDetail(false);
    post.configure(
      { antialias: "smaa", bloom: true, dof: true, quality: "high" },
      256,
      256,
    );
    post.focus(3.2);
    post.render();
    const differs = ultra !== renderer.domElement.toDataURL();
    post.dispose();
    renderer.dispose();
    return {
      bindings,
      pixelEquality,
      differs,
      variants: variants.length,
      ultra,
    };
  });
  expect(rendered.bindings.every(Boolean)).toBe(true);
  expect(rendered.pixelEquality).toEqual([true, true]);
  expect(rendered.differs).toBe(true);
  expect(rendered.variants).toBe(6);
  await test.info().attach("ultra-athlete-shaders", {
    body: Buffer.from(rendered.ultra.split(",")[1], "base64"),
    contentType: "image/png",
  });
  await page.locator("#settings-button").click();
  await page.locator('[data-settings-tab="graphics"]').click();
  await page.locator("#setting-preset").selectOption("ultra");
  await page.locator("#setting-preset").selectOption("custom");
  await expect(page.locator("#gfx-ambientOcclusion")).toBeChecked();
  await expect(page.locator("#gfx-surfaceDetail")).toBeChecked();
  await expect(page.locator("#gfx-lensEffects")).toBeChecked();
  await page.locator("#gfx-dof").uncheck();
  await page.locator("#gfx-lensEffects").uncheck();
  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem("fkm.settings.v1")!);
    return (
      s.graphics.preset === "custom" &&
      !s.graphics.dof &&
      s.graphics.ambientOcclusion &&
      s.graphics.surfaceDetail &&
      !s.graphics.lensEffects
    );
  });
  await page.locator("#resume-button").click();
  await page.waitForFunction(() => {
    const a = (window as any).upgradeArena;
    return (
      a.post.grade.ambientOcclusion &&
      !a.post.grade.dof &&
      a.post.grade.uniforms.uLensEffects.value === 0
    );
  });
  expect(errors).toEqual([]);
});
