import { test, expect, type Page } from '@playwright/test';

async function openGame(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('fkm.settings.v1')) {
      localStorage.setItem('fkm.settings.v1', JSON.stringify({ quality: 'low', sound: false }));
    }
  });
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await page.locator('#menu-practice').click();
  await expect(page.locator('#game-view')).toBeVisible();
  await expect(page.locator('#shoot-button')).toBeEnabled();
}
async function shoot(page: Page, targetPower = 63) {
  await page.keyboard.down('Space');
  await page.waitForFunction(power => Number(document.querySelector('#power-value')?.textContent) >= power, targetPower);
  await page.keyboard.up('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'result');
}

test('practice cycles atmospheres and the in-game field map works without opening settings', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.addInitScript(() => localStorage.setItem('fkm.settings.v1', JSON.stringify({ atmosphere: 'night', quality: 'low', sound: false })));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await page.locator('#menu-practice').click();
  await expect(page.locator('#game-view')).toBeVisible();
  const firstAtmosphere = await page.locator('#setting-atmosphere').inputValue();
  expect(firstAtmosphere).not.toBe('night');
  await expect(page.locator('#shoot-label')).toHaveText('Shoot!');
  await expect(page.locator('#settings-view')).toBeHidden();

  const mapButton = page.locator('#quick-map-button');
  await mapButton.click();
  await expect(page.locator('#quick-map-panel')).toBeVisible();
  const before = await page.locator('#quick-map-readout').textContent();
  await page.locator('#quick-pitch-map').click({ position: { x: 34, y: 95 } });
  await expect(page.locator('#quick-map-readout')).not.toHaveText(before!);
  await expect(page.locator('#settings-view')).toBeHidden();
  await mapButton.click();
  await expect(page.locator('#quick-map-panel')).toBeHidden();
  await expect(mapButton).toHaveAttribute('aria-expanded', 'false');
  await mapButton.click();
  await expect(page.locator('#quick-map-panel')).toBeVisible();
  await page.locator('#quick-map-close').click();
  await expect(mapButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#camera-left')).toBeEnabled();
  await expect(page.locator('#camera-right')).toBeEnabled();
  await page.locator('#camera-left').click();
  await page.locator('#camera-right').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await mapButton.click();
  const mapBounds = await page.locator('#quick-map-panel').boundingBox();
  expect(mapBounds).not.toBeNull();
  expect(mapBounds!.x).toBeGreaterThanOrEqual(0);
  expect(mapBounds!.x + mapBounds!.width).toBeLessThanOrEqual(390);
  expect(mapBounds!.y + mapBounds!.height).toBeLessThanOrEqual(844);
  await page.locator('#quick-map-close').click();

  await page.locator('#back-button').click();
  await page.locator('#menu-practice').click();
  const secondAtmosphere = await page.locator('#setting-atmosphere').inputValue();
  expect(secondAtmosphere).not.toBe(firstAtmosphere);
});

test('uses the phone graphics budget and caps high-DPI rendering on a mobile device', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('fkm.settings.v1', JSON.stringify({ sound: false, showFps: true })));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await page.locator('#menu-settings').click();
  await page.locator('[data-settings-tab="graphics"]').click();
  await expect(page.locator('#setting-preset')).toHaveValue('balanced');
  await page.locator('#setting-preset').selectOption('custom');
  await expect(page.locator('#gfx-resolution')).toHaveValue('0.75');
  await expect(page.locator('#gfx-bloom')).not.toBeChecked();
  await expect(page.locator('#gfx-shadows')).toHaveValue('512');
  await page.locator('#settings-back').click();
  await page.locator('#menu-practice').click();
  await expect(page.locator('#performance')).toBeVisible();
  await expect(page.locator('#performance')).toHaveText(/RENDER 1\.5×/);
  await context.close();
});

test('offers and renders the full 3088 × 1440 phone resolution, including after rotation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 772, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 4 });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('fkm.settings.v1', JSON.stringify({ quality: 'low', sound: false, music: false })));
    await page.goto('/');
    await expect(page.locator('#app')).toHaveClass('is-ready');
    await page.locator('#menu-practice').click();
    // Settings pause gameplay, allowing us to verify real backing-buffer dimensions without
    // requiring software WebGL to sustain a native-resolution frame rate in the test worker.
    await page.locator('#settings-button').click();
    await page.locator('[data-settings-tab="graphics"]').click();
    await page.locator('#setting-preset').selectOption('custom');
    const resolution = page.locator('#gfx-resolution');
    await expect(resolution.locator('option[value="1"]')).toHaveText('Native (100%) · 3088 × 1440');
    await resolution.selectOption('1');
    const canvas = page.locator('#arena canvas');
    await expect(canvas).toHaveAttribute('width', '3088');
    await expect(canvas).toHaveAttribute('height', '1440');

    await page.setViewportSize({ width: 360, height: 772 });
    await expect(resolution.locator('option[value="1"]')).toHaveText('Native (100%) · 1440 × 3088');
    await expect(canvas).toHaveAttribute('width', '1440');
    await expect(canvas).toHaveAttribute('height', '3088');
    await expect(resolution).toHaveValue('1');

    await resolution.selectOption('0.75');
    await expect(canvas).toHaveAttribute('width', '540');
    await expect(canvas).toHaveAttribute('height', '1158');
    await resolution.selectOption('0.5');
    await expect(canvas).toHaveAttribute('width', '360');
    await expect(canvas).toHaveAttribute('height', '772');
    await resolution.selectOption('1');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fkm.settings.v1')!).graphics)).toMatchObject({ preset: 'custom', resolution: 1 });
  } finally {
    await context.close();
  }
});

test('loads actual WebGL full-screen, adjusts pitch, contact, difficulty and remembers preferences', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  await openGame(page);
  await expect(page.locator('#arena canvas')).toBeVisible();
  const arenaBounds = await page.locator('#arena').boundingBox();
  const viewport = page.viewportSize()!;
  expect(arenaBounds).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  await expect(page.locator('#settings-view')).toBeHidden();
  await expect(page.locator('#menu-view')).toBeHidden();
  await expect(page.locator('#scene-loading')).toHaveCount(0);
  await page.locator('#settings-button').click();
  await expect(page.locator('#settings-view')).toBeVisible();
  await page.locator('[data-spot="right"]').click();
  await expect(page.locator('#distance-value')).toHaveText('26.0 m');
  const map = page.locator('#pitch-map');
  await map.focus();
  const before = await map.getAttribute('aria-valuetext');
  await page.keyboard.press('ArrowRight');
  await expect(map).not.toHaveAttribute('aria-valuetext', before!);
  await page.locator('[data-difficulty="legend"]').click();
  await expect(page.locator('#difficulty-name')).toHaveText('Legend');
  await page.locator('[data-foot="left"]').click();
  await expect(page.locator('#stage-foot')).toHaveText('LEFT FOOT');
  await page.locator('#resume-button').click();
  await expect(page.locator('#game-view')).toBeVisible();
  await page.locator('[data-strike="knuckle"]').click();
  await expect(page.locator('#strike-name')).toHaveText('Knuckleball');
  await page.locator('#contact-pad').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#contact-pad')).toHaveAttribute('aria-valuetext', /vertical 7 percent/);
  await page.reload();
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await page.locator('#menu-practice').click();
  await expect(page.locator('#difficulty-name')).toHaveText('Legend');
  await expect(page.locator('#stage-foot')).toHaveText('LEFT FOOT');
  expect(errors).toEqual([]);
});

test('scores a physical goal, records it once, replays, and prepares the next kick', async ({ page }) => {
  await openGame(page);
  await page.locator('#settings-button').click();
  await page.locator('[data-difficulty="rookie"]').click();
  for (let i = 0; i < 4; i++) await page.locator('#wall-minus').click();
  await expect(page.locator('#wall-count')).toHaveText('0');
  await page.locator('#resume-button').click();
  await page.locator('[data-strike="knuckle"]').click();
  // Slight topspin prevents wake activation; a low launch stays scoreable across
  // real input/frame scheduling jitter on software WebGL workers.
  await page.locator('#contact-pad').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await page.locator('#shoot-button').focus();
  for (let i = 0; i < 16; i++) await page.keyboard.press('Shift+ArrowLeft');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowDown');
  await shoot(page, 62);
  await expect(page.locator('#result-title')).toHaveText(/GOAL|TOP BINS/);
  await expect(page.locator('#stat-attempts')).toHaveText('1');
  await expect(page.locator('#stat-goals')).toHaveText('1');
  // Cosmetic settings must not erase a completed shot or its replay.
  await page.locator('#settings-button').click();
  await page.locator('[data-settings-tab="graphics"]').click();
  await page.locator('#setting-guides').uncheck();
  await page.locator('#resume-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'result');
  await page.locator('#replay-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'replay');
  await expect(page.locator('#replay-label')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'result');
  await expect(page.locator('#stat-attempts')).toHaveText('1');
  await page.locator('#shoot-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('#power-value')).toHaveText('0');
  await expect(page.locator('#shot-result')).toBeHidden();
});

test('cancels charge safely when settings open and does not create a phantom attempt', async ({ page }) => {
  await openGame(page);
  await page.keyboard.down('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'charging');
  await page.locator('#settings-button').click();
  await page.keyboard.up('Space');
  await expect(page.locator('#settings-view')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'ready');
  await page.locator('[data-settings-tab="graphics"]').click();
  await page.locator('#setting-guides').uncheck();
  await page.locator('#setting-preset').selectOption('balanced');
  await page.locator('#resume-button').click();
  await expect(page.locator('#settings-view')).toBeHidden();
  await expect(page.locator('#stat-attempts')).toHaveText('0');
  await page.locator('#settings-button').click();
  await page.locator('#settings-help').click();
  await expect(page.locator('#modal-title')).toHaveText('Own the dead ball.');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).not.toBeVisible();
});

test('settings scroll on a short phone screen and back returns to the menu', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await openGame(page);
  await page.locator('#settings-button').click();
  const scroller = page.locator('#settings-scroll');
  const scrollable = await scroller.evaluate(element => element.scrollHeight > element.clientHeight);
  expect(scrollable).toBe(true);
  await scroller.evaluate(element => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.locator('#settings-back').click();
  await expect(page.locator('#game-view')).toBeVisible();
  await page.locator('#back-button').click();
  await expect(page.locator('#menu-view')).toBeVisible();
  await context.close();
});

test('touch viewport has no horizontal overflow and supports a touch shoot gesture', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await openGame(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.screenshot({ path: '.artifacts/phone-portrait.png', fullPage: true });
  const rect = await page.locator('#shoot-button').boundingBox();
  expect(rect).not.toBeNull();
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect!.x + rect!.width / 2, y: rect!.y + rect!.height / 2 }] });
  await page.waitForFunction(() => Number(document.querySelector('#power-value')?.textContent) >= 63);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'result');
  await expect(page.locator('#stat-attempts')).toHaveText('1');
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const shootRect = await page.locator('#shoot-button').boundingBox();
  expect(shootRect!.y + shootRect!.height).toBeLessThanOrEqual(391);
  await page.screenshot({ path: '.artifacts/phone-landscape.png', fullPage: true });
  await context.close();
});


test('keeps resolution option nodes during setup bursts and flushes preferences before pagehide', async ({ page }) => {
  await openGame(page);
  await page.locator('#settings-button').click();
  const result = await page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('#gfx-resolution')!;
    const firstOption = select.firstElementChild;
    const slider = document.querySelector<HTMLInputElement>('#distance-slider')!;
    for (const distance of [25, 26, 27, 28, 29, 30]) {
      slider.value = String(distance);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // No RAF can run inside this task: this tests the lifecycle flush, not the normal save.
    window.dispatchEvent(new Event('pagehide'));
    const saved = JSON.parse(localStorage.getItem('fkm.settings.v1')!);
    return {
      sameOption: firstOption === select.firstElementChild,
      optionCount: select.options.length,
      distance: Math.hypot(saved.position.x, saved.position.z),
      sliderDistance: Number(slider.value),
    };
  });
  expect(result.sameOption).toBe(true);
  expect(result.optionCount).toBe(3);
  // The native range control snaps to its min-relative step grid, not integer metres.
  expect(result.distance).toBeCloseTo(result.sliderDistance, 10);
  expect(result.distance).toBeGreaterThan(29);
  await page.reload();
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await expect(page.locator('#distance-value')).toHaveText(`${result.sliderDistance.toFixed(1)} m`);
});
