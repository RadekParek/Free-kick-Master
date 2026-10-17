import { expect, test } from '@playwright/test';
import type { BallState } from '../../src/game/physics';
import type { KeeperState } from '../../src/game/keeper';
import type { ArenaEvents, Phase } from '../../src/game/arena';
import type { ReplayBuffer } from '../../src/game/replay';
import type { ShotResult } from '../../src/state';
import type { MotionRig } from '../../src/game/animation';
import type { Object3D, Mesh } from 'three';

interface ArenaProbe {
  ball: BallState; keeper: KeeperState; wall: []; phase: Phase; phaseTime: number;
  analysisPlayed: boolean; frameCounter: number; accumulator: number; resultBallTime: number;
  replayFrames: ReplayBuffer; events: ArenaEvents; lastResult: ShotResult;
  taker: { rigs: (MotionRig & { root: Object3D })[] };
  setPhase(phase: Phase): void;
}
declare global { interface Window { reboundArena: ArenaProbe; woodworkCount: number } }

test('post-and-in counts once, plays impact feedback, and replays without recounting', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('fkm.settings.v1', JSON.stringify({ quality: 'low', sound: false, music: false })));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  await page.locator('#menu-practice').click();
  // Capture the existing arena through its normal charge method; no debug API is shipped.
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/game/arena.ts')?.name ?? '/src/game/arena.ts';
    const { Arena } = await import(/* @vite-ignore */ path);
    const original = Arena.prototype.charge;
    Arena.prototype.charge = function () {
      window.reboundArena = this;
      Arena.prototype.charge = original;
      return original.call(this);
    };
  });
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  // A controlled near-post flight makes this regression independent of software-GPU/input timing.
  await page.evaluate(() => {
    const arena = window.reboundArena;
    Object.assign(arena.ball, { position: { x: 3.51, y: 1, z: 0.4 }, velocity: { x: 0, y: 0, z: -25 }, sideSpin: 0, topSpin: 0, knuckle: false, frameHits: 0, time: 0, bounces: 0 });
    arena.keeper.x = 0; arena.keeper.glove.x = 0;
    arena.wall = [];
    arena.frameCounter = 0; arena.accumulator = 0; arena.resultBallTime = Infinity;
    arena.replayFrames.clear();
    arena.analysisPlayed = true; // Isolate aftermath pose/manual replay; automatic analysis has its own regression.
    window.woodworkCount = 0;
    const feedback = arena.events.woodwork;
    arena.events.woodwork = () => { window.woodworkCount++; feedback?.(); };
    arena.setPhase('flight');
  });
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'result');
  await expect(page.locator('#result-eyebrow')).toHaveText('OFF THE WOODWORK. AND IN.');
  await expect(page.locator('#stat-attempts')).toHaveText('1');
  await expect(page.locator('#stat-goals')).toHaveText('1');
  expect(await page.evaluate(() => window.woodworkCount)).toBe(1);
  expect(await page.evaluate(() => window.reboundArena.lastResult.frameHits)).toBe(1);
  await page.waitForFunction(() => window.reboundArena.phaseTime > 1.8);
  const rigCheck = await page.evaluate(() => {
    const [high, low] = window.reboundArena.taker.rigs;
    const joints = ['body', 'head', 'torso', 'leftLeg', 'rightLeg', 'leftShin', 'rightShin', 'leftArm', 'rightArm', 'leftForearm', 'rightForearm'] as const;
    let frozen = 0, unexpectedDynamicMeshes = 0;
    high.root.traverse(object => {
      if ((object as Mesh).isMesh) {
        if (!object.matrixAutoUpdate) frozen++;
        else if (object !== high.torso) unexpectedDynamicMeshes++;
      }
    });
    return {
      posesMatch: joints.every(key => high[key].position.equals(low[key].position) && high[key].quaternion.equals(low[key].quaternion)),
      celebrating: high.rightArm.rotation.z > 1,
      frozen, unexpectedDynamicMeshes,
    };
  });
  expect(rigCheck.posesMatch).toBe(true);
  expect(rigCheck.celebrating).toBe(true);
  expect(rigCheck.frozen).toBeGreaterThan(10);
  expect(rigCheck.unexpectedDynamicMeshes).toBe(0);
  await page.screenshot({ path: '.artifacts/post-and-in-celebration.png' });
  await page.locator('#replay-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'replay');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'result');
  await expect(page.locator('#stat-attempts')).toHaveText('1');
  await expect(page.locator('#stat-goals')).toHaveText('1');
  expect(await page.evaluate(() => window.woodworkCount)).toBe(1);
  await page.locator('#shoot-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'ready');
  expect(errors).toEqual([]);
});
