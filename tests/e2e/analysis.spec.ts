import { expect, test } from '@playwright/test';

test('clean HUD, local PlayStyle+ artwork, and automatic recorded goal analysis without recounting', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('fkm.settings.v1', JSON.stringify({ quality: 'low', music: false, sound: false })));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await page.locator('#menu-practice').click();
  await expect(page.locator('#back-button')).toHaveText('');
  await expect(page.locator('#settings-button')).toHaveText('');
  await expect(page.locator('#scene-message')).toHaveCount(0);
  await expect(page.locator('#power-tip')).toHaveCount(0);
  await expect(page.locator('#power-sweetspot')).toHaveCount(0);
  expect(await page.locator('#power-block').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('#taker-button .playstyle-badge')).toHaveAttribute('aria-label', 'Power Shot+');
  await page.waitForFunction(() => (document.querySelector('#taker-button .playstyle-badge img') as HTMLImageElement).naturalWidth > 0);
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/game/arena.ts')?.name ?? '/src/game/arena.ts'; const { Arena } = await import(path);
    const original = Arena.prototype.charge;
    Arena.prototype.charge = function () {
      (window as any).analysisArena = this; Arena.prototype.charge = original; return original.call(this);
    };
  });
  await expect(page.locator('#shoot-button')).toBeEnabled();
  await page.keyboard.down('Space'); await page.keyboard.up('Space');
  await page.waitForFunction(() => !!(window as any).analysisArena);
  await page.evaluate(() => {
    const arena = (window as any).analysisArena;
    Object.assign(arena.ball, { position: { x: 0, y: 1.1, z: 2.4 }, velocity: { x: 0, y: 0, z: -25 }, sideSpin: 0, topSpin: 0, knuckle: false, frameHits: 0, time: 0, bounces: 0 });
    arena.keeper.x = 3; arena.keeper.glove.x = 3; arena.wall = [];
    arena.frameCounter = 0; arena.accumulator = 0; arena.resultBallTime = Infinity; arena.replayFrames.clear();
    arena.setPhase('flight');
  });
  await expect(page.locator('#stat-goals')).toHaveText('1');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'replay');
  await expect(page.locator('#goal-analysis')).toBeVisible();
  await expect(page.locator('.analysis-brand > strong')).toHaveText('HyperMotionV');
  await expect(page.locator('.analysis-brand')).toContainText('FAN-MADE');
  await expect(page.locator('.analysis-brand')).toContainText('NOT EA TECHNOLOGY');
  await expect(page.locator('#replay-label')).toContainText('REPLAY');
  await expect(page.locator('#replay-label')).not.toContainText('INSTANT');
  await expect(page.locator('#analysis-distance')).toHaveText(/\d+\.\d/);
  await expect(page.locator('#analysis-speed')).toHaveText(/\d+/);
  expect(await page.evaluate(() => {
    const arena = (window as any).analysisArena;
    return { analysis: arena.goalAnalysis.group.visible, path: arena.goalAnalysis.geometry.drawRange.count, hasTrail: 'trace' in arena };
  })).toEqual({ analysis: true, path: expect.any(Number), hasTrail: false });
  await expect(page.locator('#analysis-stage')).toHaveText('BALL FLIGHT');
  await page.screenshot({ path: '.artifacts/hypermotion-flight.png' });
  await expect(page.locator('#analysis-stage')).toHaveText('GOAL ENTRY');
  await page.screenshot({ path: '.artifacts/hypermotion-entry.png' });
  await expect(page.locator('#analysis-stage')).toHaveText('SHOT ANALYSIS');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'result');
  await expect(page.locator('#goal-analysis')).toBeHidden();
  await expect(page.locator('#stat-attempts')).toHaveText('1');
  await expect(page.locator('#stat-goals')).toHaveText('1');
  await page.locator('#replay-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'replay');
  await page.locator('#settings-button').click();
  const clock = await page.evaluate(() => (window as any).analysisArena.replayClock);
  await expect(page.locator('#app')).toHaveAttribute('data-paused', 'true');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).analysisArena.replayClock)).toBe(clock);
  await page.locator('#resume-button').click();
  await page.locator('#skip-analysis').click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'result');
  await expect(page.locator('#stat-goals')).toHaveText('1');
  await page.locator('#shoot-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'ready');
  expect(errors).toEqual([]);
});

test('analysis titles, measurements and skip control stay on-screen in both phone orientations', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fkm.settings.v1', JSON.stringify({ quality: 'low', music: false, sound: false })));
  await page.goto('/'); await expect(page.locator('#app')).toHaveClass('is-ready');
  await page.locator('#menu-practice').click();
  // Isolated responsive layout fixture; actual playback, shaders, scoring and pause are exercised above.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#app')!.dataset.phase = 'replay';
    document.querySelector<HTMLElement>('#app')!.dataset.analysis = 'finish';
    document.querySelector<HTMLElement>('#goal-analysis')!.hidden = false;
  });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const selector of ['.analysis-brand', '.analysis-data', '.analysis-timeline', '#skip-analysis']) {
      const rect = await page.locator(selector).boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.y).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
