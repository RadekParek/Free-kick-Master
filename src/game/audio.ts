/** Tiny synthesized soundscape. Bundled offline, no audio samples or autoplay requests. */
export class GameAudio {
  enabled = true;
  private context: AudioContext | null = null;
  private volume: GainNode | null = null;
  private crowdSource: AudioBufferSourceNode | null = null;
  private crowdGain: GainNode | null = null;

  unlock() {
    if (!this.enabled) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.volume = this.context.createGain();
      this.volume.gain.value = 0.35;
      this.volume.connect(this.context.destination);
      this.startAmbience();
    }
    if (this.context.state === 'suspended') void this.context.resume();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.volume && this.context) this.volume.gain.setTargetAtTime(enabled ? 0.35 : 0, this.context.currentTime, 0.08);
    if (enabled) this.unlock();
  }

  private noise(seconds: number): AudioBuffer | null {
    if (!this.context) return null;
    const buffer = this.context.createBuffer(1, this.context.sampleRate * seconds, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private startAmbience() {
    const ctx = this.context!;
    this.crowdSource = ctx.createBufferSource();
    this.crowdSource.buffer = this.noise(4);
    this.crowdSource.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 750;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.05;
    this.crowdSource.connect(filter).connect(this.crowdGain).connect(this.volume!);
    this.crowdSource.start();
  }

  kick() {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(155, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.13);
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain).connect(this.volume!);
    osc.start();
    osc.stop(now + 0.2);
    this.noiseHit(0.08, 1000, 0.3);
  }

  private noiseHit(duration: number, frequency: number, level: number) {
    const ctx = this.context!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.volume!);
    source.start();
  }

  result(goal: boolean, post = false) {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    if (goal && this.crowdGain) {
      this.crowdGain.gain.setTargetAtTime(0.65, ctx.currentTime, 0.16);
      this.crowdGain.gain.setTargetAtTime(0.05, ctx.currentTime + 0.9, 0.55);
      [523.25, 659.25, 783.99].forEach((frequency, i) => this.tone(frequency, i * 0.085, 0.22));
    } else if (post) {
      this.tone(730, 0, 0.4);
      this.noiseHit(0.15, 2500, 0.2);
    } else this.noiseHit(0.15, 500, 0.25);
  }

  private tone(frequency: number, delay: number, duration: number) {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime + delay;
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.volume!);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  pause() { if (this.context?.state === 'running') void this.context.suspend(); }
  resume() { if (this.enabled && this.context?.state === 'suspended') void this.context.resume(); }
}
