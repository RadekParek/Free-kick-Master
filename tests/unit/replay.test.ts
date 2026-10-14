import { describe, expect, it } from 'vitest';
import { ReplayBuffer } from '../../src/game/replay';
import { createKeeper } from '../../src/game/keeper';
import { launchBall, previewShot, previewShotInto, type ShotSetup } from '../../src/game/physics';

const setup: ShotSetup = { position: { x: -6, z: 24 }, aim: { x: 1.9, y: 1.9 }, contact: { x: -0.43, y: 0.02 }, foot: 'right', power: 0.628 };

describe('allocation-free preview and replay paths', () => {
  it('writes the exact same trajectory into reusable GPU storage', () => {
    const buffer = new Float32Array(512 * 3);
    for (const power of [0.1, 0.4, 0.65, 1]) {
      const shot = { ...setup, power };
      const reference = previewShot(shot);
      const count = previewShotInto(shot, buffer);
      expect(count).toBe(reference.length);
      for (let i = 0; i < count; i++) {
        expect(buffer[i * 3]).toBe(Math.fround(reference[i].x));
        expect(buffer[i * 3 + 1]).toBe(Math.fround(reference[i].y));
        expect(buffer[i * 3 + 2]).toBe(Math.fround(reference[i].z));
      }
    }
    expect(previewShotInto(setup, new Float32Array(3))).toBe(1);
    expect(previewShotInto(setup, new Float32Array(0))).toBe(0);
  });

  it('records without state aliases and samples in place with smoothly interpolated keeper motion', () => {
    const replay = new ReplayBuffer(3), ball = launchBall(setup), keeper = createKeeper(0);
    ball.position.x = 1; ball.time = 0.1; keeper.x = 0; keeper.dive = 0.2; keeper.glove.y = 1; keeper.velocityX = 1;
    replay.record(ball, keeper);
    ball.position.x = 3; ball.time = 0.2; keeper.x = 2; keeper.dive = 0.4; keeper.glove.y = 2; keeper.velocityX = 3;
    replay.record(ball, keeper);
    const position = ball.position, velocity = ball.velocity, glove = keeper.glove;
    replay.sample(0.5, ball, keeper);
    expect(ball.position).toBe(position); expect(ball.velocity).toBe(velocity); expect(keeper.glove).toBe(glove);
    expect(ball.position.x).toBe(2); expect(ball.time).toBeCloseTo(0.15);
    expect(keeper.x).toBe(1); expect(keeper.dive).toBeCloseTo(0.3); expect(keeper.glove.y).toBe(1.5); expect(keeper.velocityX).toBe(2);
    replay.sample(0, ball, keeper);
    expect(ball.position.x).toBe(1);
    replay.sample(99, ball, keeper);
    expect(ball.position.x).toBe(3);
  });

  it('bounds recording memory and reuses storage across repeated kicks', () => {
    const replay = new ReplayBuffer(2), ball = launchBall(setup), keeper = createKeeper(0);
    for (let n = 0; n < 20; n++) {
      replay.clear();
      expect(replay.sample(0, ball, keeper)).toBe(false);
      for (let i = 0; i < 10; i++) { ball.position.x = i; replay.record(ball, keeper); }
      expect(replay.length).toBe(2);
      replay.sample(100, ball, keeper);
      expect(ball.position.x).toBe(1);
    }
  });
});
