import { lerp, type BallState } from './physics';
import type { KeeperState } from './keeper';

// Fixed-capacity, full-precision recording. No per-sample objects or per-frame replay clones.
const STRIDE = 20;
export class ReplayBuffer {
  private readonly data: Float64Array;
  length = 0;
  constructor(readonly capacity = 640) { this.data = new Float64Array(capacity * STRIDE); }
  clear() { this.length = 0; }
  record(ball: BallState, keeper: KeeperState) {
    if (this.length >= this.capacity) return;
    let i = this.length++ * STRIDE;
    const d = this.data;
    d[i++] = ball.position.x; d[i++] = ball.position.y; d[i++] = ball.position.z;
    d[i++] = ball.velocity.x; d[i++] = ball.velocity.y; d[i++] = ball.velocity.z;
    d[i++] = ball.time; d[i++] = ball.sideSpin; d[i++] = Number(ball.knuckle);
    d[i++] = keeper.x; d[i++] = keeper.targetX; d[i++] = keeper.targetY;
    d[i++] = keeper.dive; d[i++] = keeper.direction;
    d[i++] = keeper.glove.x; d[i++] = keeper.glove.y; d[i++] = keeper.glove.z;
    d[i++] = Number(keeper.reacted);
    d[i++] = keeper.velocityX; d[i] = ball.topSpin;
  }
  /** Static analysis path, copied once on replay entry; no live-shot trail or new sample objects. */
  copyPath(output: Float32Array, untilTime = Infinity, times?: Float32Array): number {
    let count = 0;
    for (let frame = 0; frame < this.length && count < output.length / 3; frame++) {
      const offset = frame * STRIDE;
      if (this.data[offset + 6] > untilTime) break;
      output[count * 3] = this.data[offset]; output[count * 3 + 1] = this.data[offset + 1]; output[count * 3 + 2] = this.data[offset + 2];
      if (times && count < times.length) times[count] = this.data[offset + 6];
      count++;
    }
    return count;
  }
  /** Sample into the existing state objects. Continuous keeper motion is interpolated too. */
  sample(frame: number, ball: BallState, keeper: KeeperState): boolean {
    if (!this.length) return false;
    const position = Math.max(0, Math.min(frame, this.length - 1));
    const index = Math.floor(position), a = index * STRIDE, b = Math.min(index + 1, this.length - 1) * STRIDE;
    const t = position - index, d = this.data;
    ball.position.x = lerp(d[a], d[b], t); ball.position.y = lerp(d[a + 1], d[b + 1], t); ball.position.z = lerp(d[a + 2], d[b + 2], t);
    ball.velocity.x = lerp(d[a + 3], d[b + 3], t); ball.velocity.y = lerp(d[a + 4], d[b + 4], t); ball.velocity.z = lerp(d[a + 5], d[b + 5], t);
    ball.time = lerp(d[a + 6], d[b + 6], t); ball.sideSpin = lerp(d[a + 7], d[b + 7], t); ball.knuckle = Boolean(d[a + 8]);
    keeper.x = lerp(d[a + 9], d[b + 9], t); keeper.targetX = lerp(d[a + 10], d[b + 10], t); keeper.targetY = lerp(d[a + 11], d[b + 11], t);
    keeper.dive = lerp(d[a + 12], d[b + 12], t); keeper.direction = d[a + 13];
    keeper.glove.x = lerp(d[a + 14], d[b + 14], t); keeper.glove.y = lerp(d[a + 15], d[b + 15], t); keeper.glove.z = lerp(d[a + 16], d[b + 16], t);
    keeper.reacted = Boolean(d[a + 17]);
    keeper.velocityX = lerp(d[a + 18], d[b + 18], t);
    ball.topSpin = lerp(d[a + 19], d[b + 19], t);
    return true;
  }
}
