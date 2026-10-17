import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// Expand the fixed golden-angle disk once in JS: no driver-dependent loop unrolling,
// sine/cosine/square-root kernel construction in millions of fragment invocations.
const DOF_GATHER = Array.from({length:12},(_,i)=>{
  const a=i*2.399963,r=Math.sqrt((i+.5)/12);
  return `{
    vec2 tap=uv+vec2(${(Math.cos(a)*r).toFixed(8)},${(Math.sin(a)*r).toFixed(8)})*radius/uPixels;
    float sampleZ=viewDepth(tap);
    float weight=1.-smoothstep(.15,max(.3,z*.04),z-sampleZ);
    sum+=texture2D(tDiffuse,tap)*weight;weights+=weight;
  }`;
}).join('\n');

export type PostQuality = 'high' | 'balanced' | 'low';
export interface PostOptions { antialias: 'off' | 'fxaa' | 'smaa'; bloom: boolean; dof?: boolean; ambientOcclusion?: boolean; lensEffects?: boolean; quality: PostQuality }

/** Tone mapping -> sRGB -> broadcast grade in ONE draw, with AA still after sRGB.
 * Extending OutputPass retains Three.js' exposure and output-colour-space define management.
 */
export class BroadcastOutputPass extends OutputPass {
  declare uniforms: Record<string, THREE.IUniform>;
  constructor(readonly dof = false, readonly ambientOcclusion = false, lensEffects = false) {
    super();
    this.uniforms.uLensEffects = { value:lensEffects ? 1 : 0 };
    this.material.uniforms = this.uniforms;
    this.material.fragmentShader = "precision highp float;\nuniform float uLensEffects;\n" + this.material.fragmentShader;
    if (dof || ambientOcclusion) {
      this.uniforms.tDepth = { value: null };
      this.uniforms.uLens = { value: new THREE.Vector4(.05, 450, 15, .04) };
      this.uniforms.uPixels = { value: new THREE.Vector2(1, 1) };
      this.material.uniforms = this.uniforms;
      this.material.fragmentShader = `uniform sampler2D tDepth;
        uniform vec4 uLens; uniform vec2 uPixels;
        float viewDepth(vec2 uv) { float z = texture2D(tDepth, uv).x; return uLens.x*uLens.y/(uLens.y-z*(uLens.y-uLens.x)); }
        vec4 lensSample(vec2 uv) {
          vec4 centre = texture2D(tDiffuse, uv);
          float z = viewDepth(uv), focus = max(uLens.z, .1), f = uLens.w;
          // Thin-lens circle of confusion: 24 mm sensor height, f/2.8; bounded 8-pixel radius.
          float radius = min(8., abs(f*f*(z-focus)/(2.8*z*max(.05,focus-f)))/.024*uPixels.y*.5);
          if (radius < .35) return centre;
          vec4 sum = centre; float weights = 1.;
          // Depth rejection protects sharp foreground silhouettes.
          ${DOF_GATHER}
          return sum/weights;
        }
` + this.material.fragmentShader;
      // Function declaration needs tDiffuse before lensSample; OutputShader's own declaration is removed.
      this.material.fragmentShader = this.material.fragmentShader.replace('uniform sampler2D tDiffuse;', '');
      this.material.fragmentShader = 'precision highp float;\nuniform sampler2D tDiffuse;\n' + this.material.fragmentShader;
      this.material.fragmentShader = this.material.fragmentShader.replace('texture2D( tDiffuse, vUv )', dof ? 'lensSample(vUv)' : 'texture2D( tDiffuse, vUv )');
      if (ambientOcclusion) {
        const gather=Array.from({length:6},(_,i)=>{ const a=i*Math.PI/3; return ` { float dz=z-viewDepth(vUv+vec2(${Math.cos(a).toFixed(7)},${Math.sin(a).toFixed(7)})*3./uPixels); occ+=smoothstep(.015,.09,dz)*(1.-smoothstep(.2,.8,dz)); }`; }).join('\n');
        // Insert directly after the initial HDR sample, before OutputShader tone mapping.
        this.material.fragmentShader=this.material.fragmentShader.replace(/gl_FragColor = ([^;]+);/, `gl_FragColor = $1; float z=viewDepth(vUv); float occ=0.; ${gather} gl_FragColor.rgb*=1.-occ*.035;`);
      }
    }
    this.material.name = 'BroadcastOutput';
    // Add grading after OutputShader's conversion, not before ACES or after antialiasing.
    const end = this.material.fragmentShader.lastIndexOf('}');
    this.material.fragmentShader = this.material.fragmentShader.slice(0, end) + `
      vec3 col = gl_FragColor.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.025);
      col = (col - 0.5) * 1.02 + 0.5;
      col *= vec3(1.005, 1.0, 0.995);
      // Optional optical finish; no time-dependent grain, no extra full-screen pass.
      if (uLensEffects > .5) { col = mix(col, col*col*(3.-2.*col), .12); col += vec3(.006,.003,-.002)*smoothstep(.5,1.,l); }
      vec2 d = vUv - 0.5;
      float v = 1.0 - smoothstep(0.25, 0.95, length(d * vec2(1.0, 0.85)));
      col *= mix(0.84, 1.0, v);
      gl_FragColor.rgb = clamp(col, 0.0, 1.0);
    }`;
    this.material.depthTest = false; this.material.depthWrite = false;
  }
  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime = 0, maskActive = false) {
    // Bind the ACTUAL RenderPass source after composer swaps, never a stale ping-pong attachment.
    if (this.dof || this.ambientOcclusion) this.uniforms.tDepth.value = readBuffer.depthTexture;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
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
  private focusFov = NaN;
  private focalLength = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, private readonly camera: THREE.Camera) {}

  /**
   * Rebuilds only when pass topology changes. No multisampled colour/depth targets or resolves.
   * FXAA runs on the tone-mapped sRGB image; SMAA remains an optional sharper alternative.
   */
  configure(options: PostOptions, width: number, height: number) {
    const { antialias, bloom, quality, dof = false, ambientOcclusion = false, lensEffects = false } = options;
    const key = `${antialias}|${bloom}|${dof}|${ambientOcclusion}`;
    if (key === this.key) {
      // Quality only changes bloom strength, not pass topology or render targets.
      if (this.bloom) this.bloom.strength = quality === 'high' ? 0.16 : 0.1;
      if(this.grade) this.grade.uniforms.uLensEffects.value=lensEffects ? 1 : 0;
      this.setSize(width, height);
      return;
    }
    this.dispose();
    this.key = key;
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 0 });
    if (dof || ambientOcclusion) target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
    const composer = this.composer = new EffectComposer(this.renderer, target);
    // With AA there are two swaps (output + AA), so RenderPass always reads target2.
    // target1 holds only post colour: no unused native-resolution depth attachment/clear.
    if (antialias !== 'off') { composer.renderTarget1.depthTexture?.dispose(); composer.renderTarget1.depthTexture=null; composer.renderTarget1.depthBuffer=false; }
    this.pixelRatio = this.renderer.getPixelRatio();
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), quality === 'high' ? 0.16 : 0.1, 0.5, 0.92);
      // These eleven full-screen colour targets never sample/test depth. Remove their otherwise
      // default depth renderbuffers before first GPU allocation; scene depth is untouched.
      for (const target of [this.bloom.renderTargetBright, ...this.bloom.renderTargetsHorizontal, ...this.bloom.renderTargetsVertical]) target.depthBuffer = false;
      for (const material of [this.bloom.materialHighPassFilter, ...this.bloom.separableBlurMaterials, this.bloom.compositeMaterial]) {
        material.depthTest = material.depthWrite = false;
      }
      composer.addPass(this.bloom);
    }
    this.grade = new BroadcastOutputPass(dof, ambientOcclusion, lensEffects);
    composer.addPass(this.grade);
    if (antialias !== 'off') {
      this.aa = antialias === 'smaa' ? new SMAAPass() : new ShaderPass(FXAAShader);
      if (this.aa instanceof ShaderPass) this.aa.material.depthTest = this.aa.material.depthWrite = false;
      composer.addPass(this.aa);
    }
    this.setSize(width, height);
  }

  setSize(width: number, height: number) {
    if (!this.composer) return;
    const pixelRatio = this.renderer.getPixelRatio();
    // ResizeObserver often reports unchanged bounds. Avoid walking/resizing every pass twice.
    const ratioChanged = pixelRatio !== this.pixelRatio;
    if (!ratioChanged && width === this.width && height === this.height) return;
    if (ratioChanged) this.composer.setPixelRatio(pixelRatio);
    if (width !== this.width || height !== this.height) this.composer.setSize(width, height);
    if (this.aa instanceof ShaderPass) this.aa.uniforms.resolution.value.set(
      1 / Math.max(1, Math.floor(width * pixelRatio)), 1 / Math.max(1, Math.floor(height * pixelRatio)));
    if (this.grade && (this.grade.dof || this.grade.ambientOcclusion)) this.grade.uniforms.uPixels.value.set(Math.max(1, width * pixelRatio), Math.max(1, height * pixelRatio));
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
  }

  /** Camera-tracked thin-lens focus. Pausing stops this along with the simulation. */
  focus(distance: number) {
    if (!this.grade || !(this.grade.dof || this.grade.ambientOcclusion) || !(this.camera instanceof THREE.PerspectiveCamera)) return;
    const lens = this.grade.uniforms.uLens.value as THREE.Vector4;
    if (this.camera.fov !== this.focusFov) {
      this.focusFov = this.camera.fov;
      this.focalLength = .024/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov)*.5));
    }
    lens.set(this.camera.near, this.camera.far, Math.max(.15, distance), this.focalLength);
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
