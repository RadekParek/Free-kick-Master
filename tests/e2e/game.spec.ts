import { test, expect, type Page } from '@playwright/test';

async function openGame(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('fkm.settings.v1')) {
      localStorage.setItem('fkm.settings.v1', JSON.stringify({ quality: 'low', sound: false }));
    }
  });
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await expect(page.locator('#shoot-button')).toBeEnabled();
}
async function shoot(page: Page, targetPower = 63) {
  await page.keyboard.down('Space');
  await page.waitForFunction(power => Number(document.querySelector('#power-value')?.textContent) >= power, targetPower);
  await page.keyboard.up('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'result');
}

test('loads actual WebGL, adjusts pitch, contact, difficulty and remembers preferences', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  await openGame(page);
  await expect(page.locator('#arena canvas')).toBeVisible();
  const arenaBounds = await page.locator('#arena').boundingBox();
  const viewport = page.viewportSize()!;
  expect(arenaBounds).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  await expect(page.locator('#setup-drawer')).toBeHidden();
  await expect(page.locator('#scene-loading')).toHaveCount(0);
  await page.locator('#settings-button').click();
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
  await page.locator('[data-strike="knuckle"]').click();
  await expect(page.locator('#strike-name')).toHaveText('Knuckleball');
  await page.locator('#contact-pad').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#contact-pad')).toHaveAttribute('aria-valuetext', /vertical 7 percent/);
  await page.reload();
  await expect(page.locator('#app')).toHaveClass('is-ready');
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

test('cancels charge safely when paused and does not create a phantom attempt', async ({ page }) => {
  await openGame(page);
  await page.keyboard.down('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'charging');
  await page.locator('#settings-button').click();
  await page.keyboard.up('Space');
  await expect(page.locator('#setup-drawer')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'ready');
  await page.locator('[data-settings-tab="graphics"]').click();
  await page.locator('#setting-guides').uncheck();
  await page.locator('#setting-quality').selectOption('balanced');
  await page.locator('#resume-button').click();
  await expect(page.locator('#setup-drawer')).not.toBeVisible();
  await expect(page.locator('#stat-attempts')).toHaveText('0');
  await page.locator('#help-button').click();
  await expect(page.locator('#modal-title')).toHaveText('Own the dead ball.');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).not.toBeVisible();
});

test('challenge setup is real, locked to the challenge, and free practice restores the setup', async ({ page }) => {
  await openGame(page);
  await page.locator('#settings-button').click();
  await page.locator('[data-spot="right"]').click();
  await page.locator('[data-difficulty="world-class"]').click();
  await page.locator('#resume-button').click();
  await page.locator('#challenges-tab').click();
  await expect(page.locator('.challenge-card')).toHaveCount(3);
  await page.locator('[data-start-challenge="long-range"]').click();
  await expect(page.locator('#mode-pill')).toContainText('FROM WAY OUT');
  await expect(page.locator('#distance-value')).toHaveText('30.0 m');
  await expect(page.locator('#distance-slider')).toBeDisabled();
  await expect(page.locator('#wall-minus')).toBeDisabled();
  await expect(page.locator('[data-difficulty="rookie"]')).toBeDisabled();
  await page.locator('#training-tab').click();
  await expect(page.locator('#mode-pill')).toContainText('FREE PRACTICE');
  await expect(page.locator('#distance-slider')).toBeEnabled();
  await expect(page.locator('#distance-value')).toHaveText('26.0 m');
  await expect(page.locator('#difficulty-name')).toHaveText('World class');
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
