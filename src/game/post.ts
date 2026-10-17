import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

export type PostQuality = 'high' | 'balanced' | 'low';
export interface PostOptions { msaa: 0 | 2; smaa: boolean; bloom: boolean; quality: PostQuality }

/** Tone mapping -> sRGB -> broadcast grade in ONE draw, with SMAA still after sRGB.
 * Extending OutputPass retains Three.js' exposure and output-colour-space define management.
 */
export class BroadcastOutputPass extends OutputPass {
  constructor() {
    super();
    this.material.name = 'BroadcastOutput';
    // Add grading after OutputShader's conversion, not before ACES or after antialiasing.
    const end = this.material.fragmentShader.lastIndexOf('}');
    this.material.fragmentShader = this.material.fragmentShader.slice(0, end) + `
      vec3 col = gl_FragColor.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.06);
      col = (col - 0.5) * 1.035 + 0.5;
      col *= vec3(1.015, 1.0, 0.985);
      vec2 d = vUv - 0.5;
      float v = 1.0 - smoothstep(0.25, 0.95, length(d * vec2(1.0, 0.85)));
      col *= mix(0.84, 1.0, v);
      gl_FragColor.rgb = clamp(col, 0.0, 1.0);
    }`;
    this.material.depthTest = false; this.material.depthWrite = false;
  }
}

/**
 * HDR composer with configurable MSAA, bloom, output transform, grade and SMAA.
 * All presets retain the same grading pipeline.
 */
export class PostStack {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: BroadcastOutputPass | null = null;
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
    this.grade = new BroadcastOutputPass();
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
