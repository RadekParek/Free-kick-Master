import { defineConfig } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import chromium from '@sparticuz/chromium';

// The npm-distributed browser avoids a separate browser-download host in restricted CI.
// Set PLAYWRIGHT_CHROMIUM_PATH to use a system browser instead.
const bundled = process.platform === 'linux' && !process.env.PLAYWRIGHT_CHROMIUM_PATH;
if (bundled) {
  const directory = resolve('.artifacts/browser');
  mkdirSync(directory, { recursive: true });
  if (!existsSync(`${directory}/lib/libnss3.so`)) {
    const archive = `${directory}/al2023.tar`;
    writeFileSync(archive, brotliDecompressSync(readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')));
    execFileSync('tar', ['-xf', archive, '-C', directory]);
  }
  process.env.LD_LIBRARY_PATH = `${directory}/lib:/tmp:${process.env.LD_LIBRARY_PATH || ''}`;
}
const executablePath = bundled ? await chromium.executablePath() : process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath,
      args: bundled ? chromium.args.filter(arg => arg !== '--single-process') : ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
