import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameTask } from '../../src/ui/frame-task';

let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
  frames = new Map();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => vi.unstubAllGlobals());

function nextFrame() {
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(16);
}

describe('coalesced preference writes', () => {
  it('runs once for an input burst and uses the latest state', () => {
    let value = 0;
    const writes: number[] = [];
    const task = new FrameTask(() => writes.push(value));
    for (let i = 1; i <= 20; i++) { value = i; task.schedule(); }
    expect(writes).toEqual([]);
    expect(frames.size).toBe(1);
    nextFrame();
    expect(writes).toEqual([20]);
    value = 21;
    task.schedule();
    nextFrame();
    expect(writes).toEqual([20, 21]);
  });

  it('flushes immediately before backgrounding/navigation and cancels the pending frame', () => {
    const run = vi.fn();
    const task = new FrameTask(run);
    task.schedule();
    task.flush();
    expect(run).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    nextFrame();
    task.flush();
    expect(run).toHaveBeenCalledOnce();
    task.schedule();
    nextFrame();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
