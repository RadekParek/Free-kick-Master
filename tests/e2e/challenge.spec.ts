import { test, expect } from '@playwright/test';

test('completes all five challenge shots, shows results, restores practice, and resets statistics', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.addInitScript(() => localStorage.setItem('fkm.settings.v1', JSON.stringify({ quality: 'low', sound: false })));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await page.locator('#challenges-tab').click();
  await page.locator('[data-start-challenge="long-range"]').click();
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.keyboard.down('Space');
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'charging');
    await page.waitForFunction(() => Number(document.querySelector('#power-value')?.textContent) >= 68);
    await page.keyboard.up('Space');
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'result');
    await expect(page.locator('#stat-attempts')).toHaveText(String(attempt));
    if (attempt < 5) {
      await page.locator('#shoot-button').click();
      await expect(page.locator('#app')).toHaveAttribute('data-phase', 'ready');
      await expect(page.locator('#mode-pill')).toContainText(`${attempt + 1}/5`);
    }
  }
  await expect(page.locator('#shoot-label')).toHaveText('VIEW RESULTS');
  await page.locator('#shoot-button').click();
  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('.challenge-results > span')).toHaveCount(5);
  await expect(page.locator('.challenge-score')).toContainText('TARGETS COMPLETED');
  await page.locator('#back-training').click();
  await expect(page.locator('#mode-pill')).toContainText('FREE PRACTICE');
  await expect(page.locator('#distance-slider')).toBeEnabled();
  await page.locator('#settings-button').click();
  await page.locator('#reset-session').click();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#stat-attempts')).toHaveText('0');
  await expect(page.locator('#stat-goals')).toHaveText('0');
});
