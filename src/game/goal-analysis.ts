import * as THREE from 'three';
import type { ShotResult } from '../state';
import type { ReplayBuffer } from './replay';
import type { Position } from './physics';

/** Original HyperMotionV-inspired presentation, not EA's proprietary capture/animation technology. */
export class GoalAnalysis {
  readonly group = new THREE.Group();
  private readonly clock = { value: 0 };
  private readonly reveal = { value: 0 };
  private readonly points = new Float32Array(640 * 3);
  private readonly times = new Float32Array(640);
  private readonly geometry = new THREE.BufferGeometry()
    .setAttribute('position', new THREE.BufferAttribute(this.points, 3).setUsage(THREE.DynamicDrawUsage))
    .setAttribute('shotTime', new THREE.BufferAttribute(this.times, 1).setUsage(THREE.DynamicDrawUsage));
  private readonly target = new THREE.Mesh(new THREE.RingGeometry(.19, .215, 48), new THREE.MeshBasicMaterial({ color: '#caff76', side: THREE.DoubleSide, depthWrite: false }));
  private readonly heightPoints = new Float32Array(6);
  private readonly heightGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.heightPoints, 3).setUsage(THREE.DynamicDrawUsage));
  private readonly scan: THREE.Mesh;
  constructor() {
    this.group.name = 'goal-analysis'; this.group.visible = false;
    const material = new THREE.LineBasicMaterial({ color: '#f0fff9', transparent: true, opacity: .95, depthWrite: false });
    material.onBeforeCompile = shader => {
      shader.uniforms.uReveal = this.reveal;
      shader.vertexShader = 'attribute float shotTime; varying float vShotTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvShotTime = shotTime;');
      shader.fragmentShader = 'uniform float uReveal; varying float vShotTime;\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vShotTime > uReveal) discard;');
    };
    material.customProgramCacheKey = () => 'recorded-shot-reveal-v1';
    const line = new THREE.Line(this.geometry, material); line.frustumCulled = false;
    const height = new THREE.Line(this.heightGeometry, new THREE.LineBasicMaterial({ color: '#caff76', transparent: true, opacity: .85 }));
    height.frustumCulled = false;
    const scanMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uClock: this.clock },
      vertexShader: 'varying vec2 vGrid; void main(){ vec4 world=modelMatrix*vec4(position,1.); vGrid=world.xz; gl_Position=projectionMatrix*viewMatrix*world; }',
      fragmentShader: `varying vec2 vGrid; uniform float uClock;
        void main(){
          vec2 dist=abs(fract(vGrid*.5-.5)-.5)/max(fwidth(vGrid*.5),vec2(.0001));
          float grid=1.-min(min(dist.x,dist.y),1.);
          float sweep=exp(-pow((vGrid.y-mod(uClock*12.,64.))* .65,2.));
          float alpha=(grid*.13+sweep*.22)*min(uClock*2.,1.);
          gl_FragColor=vec4(.68,1.,.43,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.scan = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), scanMaterial);
    this.scan.rotation.x = -Math.PI / 2;
    this.target.material.onBeforeCompile = shader => {
      shader.uniforms.uClock = this.clock;
      shader.vertexShader = 'uniform float uClock;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xy *= 1. + sin(uClock * 5.) * .08;');
    };
    this.target.material.customProgramCacheKey = () => 'analysis-entry-pulse-v1';
    this.group.add(this.scan, line, height, this.target);
  }
  show(replay: ReplayBuffer, result: ShotResult, goalTime: number, start?: Position) {
    const count = replay.copyPath(this.points, goalTime, this.times);
    this.geometry.setDrawRange(0, count);
    for (const name of ['position', 'shotTime']) {
      const attribute = this.geometry.attributes[name] as THREE.BufferAttribute;
      attribute.clearUpdateRanges(); attribute.addUpdateRange(0, count * attribute.itemSize); attribute.needsUpdate = true;
    }
    this.target.position.set(result.point.x, result.point.y, -.02);
    this.heightPoints.set([result.point.x, .02, -.02, result.point.x, result.point.y, -.02]);
    this.heightGeometry.attributes.position.needsUpdate = true;
    const origin = start ?? { x: this.points[0], z: this.points[2] };
    this.scan.position.set(origin.x / 2, .018, origin.z / 2);
    this.scan.scale.set(Math.max(12, Math.abs(origin.x) + 8), Math.max(8, origin.z + 4), 1);
    this.clock.value = this.reveal.value = 0;
    this.group.visible = count > 1;
  }
  /** Only two uniforms change during playback. Path uploads occur once, never each frame. */
  update(elapsed: number, shotTime: number) { this.clock.value = elapsed; this.reveal.value = shotTime; }
  hide() { this.group.visible = false; }
}
