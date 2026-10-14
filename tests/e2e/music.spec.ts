import { expect, test } from '@playwright/test';

declare global {
  interface Window { testMusic: HTMLAudioElement; testPlayCalls: number }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('fkm.settings.v1')) localStorage.setItem('fkm.settings.v1', JSON.stringify({ quality: 'low', sound: false, music: true }));
    window.testPlayCalls = 0;
    window.Audio = new Proxy(Audio, {
      construct(Target, args) {
        const audio = new Target(...args);
        window.testMusic = audio;
        const play = audio.play.bind(audio);
        audio.play = () => { window.testPlayCalls++; return play(); };
        return audio;
      },
    });
  });
});

test('attempts autoplay, plays bundled songs, navigates history and stays menu-only', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await expect.poll(() => page.evaluate(() => window.testPlayCalls)).toBeGreaterThan(0);
  await expect(page.locator('#menu-music')).toBeVisible();
  const first = await page.locator('#music-title').textContent();
  expect(first).toMatch(/Feet Don't Fail Me Now|Hayya Hayya|Ai Se Eu Te Pego/);
  // Keyboard is also an audio unlock gesture (no pointer-only startup requirement).
  await page.keyboard.press('Shift');
  await expect.poll(() => page.evaluate(() => !window.testMusic.paused && window.testMusic.currentTime > 0)).toBe(true);
  await page.locator('#music-next').click();
  await expect(page.locator('#music-title')).not.toHaveText(first!);
  const second = await page.locator('#music-title').textContent();
  await page.locator('#music-previous').click();
  await expect(page.locator('#music-title')).toHaveText(first!);
  await page.locator('#music-next').click();
  await expect(page.locator('#music-title')).toHaveText(second!);
  await page.evaluate(() => window.testMusic.dispatchEvent(new Event('ended')));
  await expect(page.locator('#music-title')).not.toHaveText(second!);
  await expect(page.locator('#music-title')).not.toHaveText(first!);
  const third = await page.locator('#music-title').textContent();

  await page.locator('#menu-settings').click();
  await expect(page.locator('#menu-music')).toBeHidden();
  await page.locator('#settings-back').click();
  await expect(page.locator('#menu-music')).toBeVisible();
  await page.locator('#menu-help').click();
  await expect(page.locator('#menu-music')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-music')).toBeVisible();
  await page.locator('#menu-practice').click();
  await expect(page.locator('#menu-music')).toBeHidden();
  expect(await page.evaluate(() => window.testMusic.volume)).toBe(0.75);
  await page.locator('#back-button').click();
  await expect(page.locator('#menu-music')).toBeVisible();
  await expect(page.locator('#music-title')).toHaveText(third!);
  expect(await page.evaluate(() => window.testMusic.volume)).toBe(1);

  await page.locator('#music-toggle').click();
  await expect(page.locator('#music-state')).toHaveText('MUSIC OFF');
  expect(await page.evaluate(() => window.testMusic.paused)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fkm.settings.v1')!).music)).toBe(false);
  await page.locator('#music-next').click();
  expect(await page.evaluate(() => window.testMusic.paused)).toBe(true);
  await page.reload();
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await expect(page.locator('#music-state')).toHaveText('MUSIC OFF');
  expect(await page.evaluate(() => window.testPlayCalls)).toBe(0);
  await page.locator('#music-toggle').click();
  await expect.poll(() => page.evaluate(() => !window.testMusic.paused)).toBe(true);
  await page.screenshot({ path: '.artifacts/menu-music-desktop.png' });
  expect(errors).toEqual([]);
});

test('compact controls fit a portrait phone and short landscape screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  for (const size of [{ width: 390, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    const controls = page.locator('#menu-music');
    await expect(controls).toBeVisible();
    const box = await controls.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    const title = await page.locator('#music-title').textContent();
    await page.locator('#music-next').click();
    await expect(page.locator('#music-title')).not.toHaveText(title!);
    await page.screenshot({ path: `.artifacts/menu-music-${size.width}.png` });
  }
});


test('a blocked browser can start music with the song-title button', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    let firstAttempt = true;
    HTMLMediaElement.prototype.play = function () {
      if (firstAttempt) {
        firstAttempt = false;
        return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await expect(page.locator('#music-state')).toHaveText('TAP OR PRESS A KEY TO PLAY');
  const first = await page.locator('#music-title').textContent();
  await page.locator('#music-toggle').click();
  await expect.poll(() => page.evaluate(() => !window.testMusic.paused && window.testMusic.currentTime > 0)).toBe(true);
  await expect(page.locator('#music-title')).toHaveText(first!);
  await expect(page.locator('#music-state')).toHaveText('NOW PLAYING · SHUFFLE');
});
