import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

export type PostQuality = 'high' | 'balanced' | 'low';
export interface PostOptions { antialias: 'off' | 'fxaa' | 'smaa'; bloom: boolean; quality: PostQuality }

/** Tone mapping -> sRGB -> broadcast grade in ONE draw, with AA still after sRGB.
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
      col = mix(vec3(l), col, 1.025);
      col = (col - 0.5) * 1.02 + 0.5;
      col *= vec3(1.005, 1.0, 0.995);
      vec2 d = vUv - 0.5;
      float v = 1.0 - smoothstep(0.25, 0.95, length(d * vec2(1.0, 0.85)));
      col *= mix(0.84, 1.0, v);
      gl_FragColor.rgb = clamp(col, 0.0, 1.0);
    }`;
    this.material.depthTest = false; this.material.depthWrite = false;
  }
}

/**
 * Single-sample HDR composer with bloom, fused output/grade and optional FXAA or SMAA.
 * All presets retain the same grading pipeline.
 */
export class PostStack {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: BroadcastOutputPass | null = null;
  private aa: SMAAPass | ShaderPass | null = null;
  private key = '';
  private width = 0;
  private height = 0;
  private pixelRatio = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, private readonly camera: THREE.Camera) {}

  /**
   * Rebuilds only when pass topology changes. No multisampled colour/depth targets or resolves.
   * FXAA runs on the tone-mapped sRGB image; SMAA remains an optional sharper alternative.
   */
  configure(options: PostOptions, width: number, height: number) {
    const { antialias, bloom, quality } = options;
    const key = `${antialias}|${bloom}`;
    if (key === this.key) {
      // Quality only changes bloom strength, not pass topology or render targets.
      if (this.bloom) this.bloom.strength = quality === 'high' ? 0.16 : 0.1;
      this.setSize(width, height);
      return;
    }
    this.dispose();
    this.key = key;
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 0 });
    const composer = this.composer = new EffectComposer(this.renderer, target);
    this.pixelRatio = this.renderer.getPixelRatio();
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), quality === 'high' ? 0.16 : 0.1, 0.5, 0.92);
      composer.addPass(this.bloom);
    }
    this.grade = new BroadcastOutputPass();
    composer.addPass(this.grade);
    if (antialias !== 'off') {
      this.aa = antialias === 'smaa' ? new SMAAPass() : new ShaderPass(FXAAShader);
      composer.addPass(this.aa);
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
    if (this.aa instanceof ShaderPass) this.aa.uniforms.resolution.value.set(
      1 / Math.max(1, Math.floor(width * pixelRatio)), 1 / Math.max(1, Math.floor(height * pixelRatio)));
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
    this.composer = null; this.bloom = null; this.grade = null; this.aa = null; this.key = '';
  }
}
