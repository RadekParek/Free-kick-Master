/** Coalesce bursty work, while allowing lifecycle/discrete transitions to flush it immediately. */
export class FrameTask {
  private frame = 0;
  constructor(private readonly run: () => void) {}

  schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.run();
    });
  }

  flush() {
    if (!this.frame) return;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.run();
  }
}
