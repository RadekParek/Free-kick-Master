import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

export type PostQuality = 'high' | 'balanced' | 'low';
export interface PostOptions { msaa: 0 | 2; smaa: boolean; bloom: boolean; quality: PostQuality }

/** Broadcast-style grade: a little saturation, contrast, warm highlights and a soft vignette. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    saturation: { value: 1.08 },
    contrast: { value: 1.05 },
    warmth: { value: 0.025 },
    vignette: { value: 0.22 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float saturation; uniform float contrast; uniform float warmth; uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      col *= vec3(1.0 + warmth, 1.0, 1.0 - warmth);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.95, 0.25, length(d * vec2(1.0, 0.85)));
      col *= mix(1.0 - vignette, 1.0, v);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

/**
 * HDR composer with configurable MSAA, bloom, output transform, grade and SMAA.
 * All presets retain the same grading pipeline.
 */
export class PostStack {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private smaa: SMAAPass | null = null;
  private key = '';
  private width = 0;
  private height = 0;
  private pixelRatio = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, private readonly camera: THREE.Camera) {}

  /**
   * Rebuilds the composer only when a pass or target setting changes. MSAA lives on the
   * composer target, so every mode goes through it and the toggles take effect immediately.
   */
  configure(options: PostOptions, width: number, height: number) {
    const { msaa, smaa, bloom, quality } = options;
    const key = `${msaa}|${smaa}|${bloom}`;
    if (key === this.key) {
      // Quality only changes bloom strength, not pass topology or render targets.
      if (this.bloom) this.bloom.strength = quality === 'high' ? 0.16 : 0.1;
      this.setSize(width, height);
      return;
    }
    this.dispose();
    this.key = key;
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: msaa });
    const composer = this.composer = new EffectComposer(this.renderer, target);
    this.pixelRatio = this.renderer.getPixelRatio();
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), quality === 'high' ? 0.16 : 0.1, 0.5, 0.92);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    if (smaa) {
      this.smaa = new SMAAPass();
      composer.addPass(this.smaa);
    }
    this.setSize(width, height);
  }

  setSize(width: number, height: number) {
    if (!this.composer) return;
    const pixelRatio = this.renderer.getPixelRatio();
    // ResizeObserver often reports unchanged bounds. Avoid walking/resizing every pass twice.
    const ratioChanged = pixelRatio !== this.pixelRatio;
    if (ratioChanged) this.composer.setPixelRatio(pixelRatio);
    if (width !== this.width || height !== this.height) this.composer.setSize(width, height);
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    // EffectComposer.dispose only frees its own targets, not the passes' render targets/materials.
    for (const pass of this.composer?.passes ?? []) pass.dispose();
    this.composer?.dispose();
    this.width = this.height = this.pixelRatio = 0;
    this.composer = null; this.bloom = null; this.grade = null; this.smaa = null; this.key = '';
  }
}
