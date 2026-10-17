import { expect, test } from '@playwright/test';

test('Carlos ICON has right-side Power+, records a real approach and enters analysis on the goal tick', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'fkm.settings.v1',
      JSON.stringify({ quality: 'low', sound: false, music: false }),
    ),
  );
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await page.locator('#menu-players').click();
  await page.locator('[data-edition-filter="icon"]').click();
  await expect(page.locator('.player-card:visible')).toHaveCount(7);
  const card = page.locator('[data-player="roberto-carlos"]');
  await expect(card).toHaveClass(/is-icon/);
  await expect(card.locator('.card-stats')).toContainText('99');
  const rect = await card.boundingBox(),
    badge = await card.locator('.playstyle-badge').boundingBox();
  expect(badge!.x).toBeGreaterThan(rect!.x + rect!.width / 2);
  expect(
    await card
      .locator('.card-portrait')
      .evaluate((e) => getComputedStyle(e).filter),
  ).toContain('grayscale(1)');
  await page.screenshot({ path: '.artifacts/icon-cards.png' });
  await card.click();
  await page.locator('#confirm-player').click();
  await page.locator('#menu-practice').click();
  await expect(page.locator('#stage-foot')).toHaveText('LEFT FOOT');
  await expect(page.locator('#taker-button .playstyle-badge')).toHaveAttribute(
    'aria-label',
    'Power Shot+',
  );
  await page.evaluate(async () => {
    const path =
      performance
        .getEntriesByType('resource')
        .find((e) => new URL(e.name).pathname === '/src/game/arena.ts')?.name ??
      '/src/game/arena.ts';
    const { Arena } = await import(path);
    const charge = Arena.prototype.charge;
    Arena.prototype.charge = function () {
      (window as any).realArena = this;
      Arena.prototype.charge = charge;
      return charge.call(this);
    };
  });
  await expect(page.locator('#shoot-button')).toBeEnabled();
  await page.keyboard.down('Space');
  await page.waitForFunction(() => !!(window as any).realArena);
  const candidate = await page.evaluate(async () => {
    const arena = (window as any).realArena;
    const physicsPath = '/src/game/physics.ts',
      simulationPath = '/src/game/simulation.ts',
      keeperPath = '/src/game/keeper.ts';
    const physics = await import(physicsPath),
      { advanceShot, createShotScratch } = await import(simulationPath),
      { createKeeper, keeperYaw } = await import(keeperPath);
    arena.settings.wall = 0;
    arena.settings.difficulty = 'rookie';
    let candidate: any = null;
    outer: for (const x of [-3, 3, -2.5, 2.5])
      for (const y of [1.8, 1.2, 2.1])
        for (const power of [0.6, 0.65, 0.7]) {
          arena.settings.aim = { x, y };
          arena.settings.contact = { x: 0.2, y: 0 };
          const setup = arena.setup(power),
            ball = physics.launchBall(setup),
            keeper = createKeeper(setup.position.x),
            scratch = createShotScratch();
          keeper.yaw = keeperYaw(setup.position);
          keeper.metrics = arena.keeperModel.collisionMetrics();
          for (let i = 0; i < 1000; i++) {
            const event = advanceShot(
              ball,
              keeper,
              [],
              'rookie',
              scratch,
              false,
            );
            if (event && !event.continues) {
              if (event.outcome === 'goal') {
                candidate = { x, y, power };
                break outer;
              }
              break;
            }
          }
        }
    if (!candidate) throw new Error('Expected a scoreable Carlos test shot');
    arena.settings.aim = { x: candidate.x, y: candidate.y };
    arena.reset();
    arena.charge();
    arena.power = candidate.power;
    const result = arena.events.result,
      phase = arena.events.phase;
    arena.events.result = (value: any) => {
      (window as any).goalTick = arena.time;
      result(value);
    };
    arena.events.phase = (value: string) => {
      if (value === 'replay') (window as any).replayTick = arena.time;
      phase(value);
    };
    arena.release();
    return candidate;
  });
  await page.keyboard.up('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'replay');
  await expect(page.locator('#analysis-power')).toHaveText(
    String(candidate.power * 100),
  );
  await expect(page.locator('#analysis-player-height')).toHaveText('1.68');
  await expect(page.locator('#analysis-keeper-height')).toHaveText('1.90');
  const info = await page.evaluate(() => {
    const a = (window as any).realArena;
    return {
      sameTick: (window as any).goalTick === (window as any).replayTick,
      runup: a.runupFrames.length,
      speed: a.lastResult.runupSpeed,
      phase: a.analysisFrame.stage,
    };
  });
  expect(info.sameTick).toBe(true);
  expect(info.runup).toBeGreaterThan(10);
  expect(info.speed).toBeGreaterThan(5);
  expect(info.speed).toBeLessThan(60);
  await expect(page.locator('#analysis-chance')).toHaveText(/^\d+$/);
  await page.locator('#settings-button').click();
  const motion = await page.evaluate(() => {
    const a = (window as any).realArena;
    a.replayClock = 2.15;
    a.stepReplay(0);
    const start = a.football.quaternion.toArray();
    a.stepReplay(0.3);
    const frozen = a.football.quaternion.toArray();
    a.replayClock = 4.15;
    a.stepReplay(0);
    a.updateCamera(0, true);
    a.camera.updateMatrixWorld();
    const p = a.ball.position;
    // Reuse the actor's vector as a temporary projection scratch (simulation is paused).
    const projected = a.desiredLook
      .clone()
      .set(p.x, p.y, p.z)
      .project(a.camera);
    return {
      start,
      frozen,
      moving: a.football.quaternion.toArray(),
      x: projected.x,
      y: projected.y,
    };
  });
  expect(motion.frozen).toEqual(motion.start);
  expect(motion.moving).not.toEqual(motion.start);
  expect(motion.x).toBeCloseTo(0, 5);
  expect(motion.y).toBeCloseTo(0, 5);
  await page.locator('#resume-button').click();
  await page.locator('#skip-analysis').click();
  await expect(page.locator('#stat-goals')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('DOF defaults only to High and remains an independently persisted Custom option', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('fkm.settings.v1'))
      localStorage.setItem(
        'fkm.settings.v1',
        JSON.stringify({ quality: 'low', sound: false, music: false }),
      );
  });
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await page.locator('#menu-settings').click();
  await page.locator('[data-settings-tab="graphics"]').click();
  await expect(page.locator('#gfx-dof')).not.toBeChecked();
  await page.locator('#setting-preset').selectOption('high');
  await expect(page.locator('#gfx-dof')).toBeChecked();
  await page.locator('#setting-preset').selectOption('balanced');
  await expect(page.locator('#gfx-dof')).not.toBeChecked();
  await page.locator('#setting-preset').selectOption('custom');
  await page.locator('#gfx-dof').check();
  await expect(page.locator('#setting-preset')).toHaveValue('custom');
  await page.reload();
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await page.locator('#menu-settings').click();
  await page.locator('[data-settings-tab="graphics"]').click();
  await expect(page.locator('#gfx-dof')).toBeChecked();
  await expect(page.locator('#setting-preset')).toHaveValue('custom');
});
