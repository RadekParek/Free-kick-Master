import { lerp, type BallState } from './physics';
import type { KeeperState } from './keeper';

// Fixed-capacity, full-precision recording. No per-sample objects or per-frame replay clones.
interface Orientation { x: number; y: number; z: number; w: number }
const STRIDE = 24;
export class ReplayBuffer {
  private readonly data: Float64Array;
  length = 0;
  constructor(readonly capacity = 640) { this.data = new Float64Array(capacity * STRIDE); }
  clear() { this.length = 0; }
  record(ball: BallState, keeper: KeeperState, orientation?: Orientation) {
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
    d[i++] = keeper.velocityX; d[i++] = ball.topSpin;
    d[i++] = orientation?.x ?? 0; d[i++] = orientation?.y ?? 0; d[i++] = orientation?.z ?? 0; d[i] = orientation?.w ?? 1;
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
  sample(frame: number, ball: BallState, keeper: KeeperState, orientation?: Orientation): boolean {
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
    if (orientation) {
      let dot = 0;
      for (let n = 0; n < 4; n++) dot += d[a + 20 + n] * d[b + 20 + n];
      const sign = dot < 0 ? -1 : 1; dot = Math.min(1, Math.abs(dot));
      const angle = Math.acos(dot), sin = Math.sin(angle);
      const u = dot > .9995 ? 1 - t : Math.sin((1 - t) * angle) / sin;
      const v = (dot > .9995 ? t : Math.sin(t * angle) / sin) * sign;
      orientation.x = d[a + 20] * u + d[b + 20] * v; orientation.y = d[a + 21] * u + d[b + 21] * v;
      orientation.z = d[a + 22] * u + d[b + 22] * v; orientation.w = d[a + 23] * u + d[b + 23] * v;
      const norm = Math.hypot(orientation.x, orientation.y, orientation.z, orientation.w) || 1;
      orientation.x /= norm; orientation.y /= norm; orientation.z /= norm; orientation.w /= norm;
    }
    return true;
  }
  /** Timestamps, not assumed 60-Hz indices: includes the exact final 120-Hz contact sample. */
  sampleTime(time: number, ball: BallState, keeper: KeeperState, orientation?: Orientation): boolean {
    let lo = 0, hi = this.length - 1;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (this.data[mid * STRIDE + 6] <= time) lo = mid; else hi = mid - 1; }
    const next = Math.min(lo + 1, this.length - 1);
    const start = this.data[lo * STRIDE + 6], span = this.data[next * STRIDE + 6] - start;
    return this.sample(lo + (span > 0 ? Math.max(0, Math.min(1, (time - start) / span)) : 0), ball, keeper, orientation);
  }
}

/** Actual rendered approach transforms and pose phase, including the plant correction. */
export class RunupBuffer {
  private readonly data = new Float64Array(256 * 6);
  length = 0;
  peakSpeed = 0;
  clear() { this.length = 0; this.peakSpeed = 0; }
  record(time: number, phase: number, position: {x:number; y:number; z:number}, yaw: number) {
    if (this.length >= 256) return;
    if (this.length && phase < 1 && time - this.data[(this.length - 1) * 6] < 1/120) return;
    const i = this.length * 6, d = this.data;
    if (this.length) {
      const dt = time - d[i - 6];
      if (dt > .001) this.peakSpeed = Math.max(this.peakSpeed, Math.hypot(position.x - d[i - 4], position.z - d[i - 2]) / dt * 3.6);
    }
    d[i] = time; d[i + 1] = phase; d[i + 2] = position.x; d[i + 3] = position.y; d[i + 4] = position.z; d[i + 5] = yaw; this.length++;
  }
  sample(time: number, position: {x:number; y:number; z:number}): {phase:number; yaw:number} {
    // Persistent result, no per-frame objects. <=128 samples; binary search handles varying display rates.
    if(!this.length) { this.output.phase=this.output.yaw=0; return this.output; }
    const d = this.data; let lo = 0, hi = Math.max(0, this.length - 1);
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (d[mid * 6] <= time) lo = mid; else hi = mid - 1; }
    const a = lo * 6, b = Math.min(lo + 1, this.length - 1) * 6;
    const t = b > a ? Math.max(0, Math.min(1, (time - d[a]) / (d[b] - d[a]))) : 0;
    this.output.phase = lerp(d[a + 1], d[b + 1], t); this.output.yaw = lerp(d[a + 5], d[b + 5], t);
    position.x = lerp(d[a + 2], d[b + 2], t); position.y = lerp(d[a + 3], d[b + 3], t); position.z = lerp(d[a + 4], d[b + 4], t);
    return this.output;
  }
  private readonly output = { phase: 0, yaw: 0 };
}
