import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
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
  private readonly geometry = new LineGeometry();
  private readonly segments = new Float32Array(639*6);
  private readonly segmentTimes = new Float32Array(639*2);
  private readonly segmentBuffer = new THREE.InstancedInterleavedBuffer(this.segments,6).setUsage(THREE.DynamicDrawUsage);
  private readonly timeBuffer = new THREE.InstancedInterleavedBuffer(this.segmentTimes,2).setUsage(THREE.DynamicDrawUsage);
  private readonly target = new THREE.Mesh(new THREE.RingGeometry(.19, .215, 48), new THREE.MeshBasicMaterial({ color: '#caff76', side: THREE.DoubleSide, depthWrite: false }));
  private readonly heightPoints = new Float32Array(6);
  private readonly heightGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.heightPoints, 3).setUsage(THREE.DynamicDrawUsage));
  private readonly scan: THREE.Mesh;
  constructor() {
    this.group.name = 'goal-analysis'; this.group.visible = false;
    const material = new LineMaterial({ color: '#f0fff9', transparent:true, opacity:.95, linewidth:2.8,depthWrite:false });
    this.geometry.setAttribute('instanceStart',new THREE.InterleavedBufferAttribute(this.segmentBuffer,3,0));
    this.geometry.setAttribute('instanceEnd',new THREE.InterleavedBufferAttribute(this.segmentBuffer,3,3));
    this.geometry.setAttribute('instanceStartTime',new THREE.InterleavedBufferAttribute(this.timeBuffer,1,0));
    this.geometry.setAttribute('instanceEndTime',new THREE.InterleavedBufferAttribute(this.timeBuffer,1,1));
    this.geometry.instanceCount=0;
    material.onBeforeCompile = shader => {
      shader.uniforms.uReveal = this.reveal;
      shader.vertexShader='attribute float instanceStartTime; attribute float instanceEndTime; varying float vShotTime;\n'+shader.vertexShader.replace('void main() {','void main() {\nvShotTime=mix(instanceStartTime,instanceEndTime,clamp(position.y,0.,1.));');
      shader.fragmentShader='uniform float uReveal; varying float vShotTime;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vShotTime>uReveal)discard;');
    };
    material.customProgramCacheKey=()=> 'recorded-wide-shot-reveal-v2';
    const line=new Line2(this.geometry,material);line.name='recorded-flight-path';line.frustumCulled=false;
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
    this.geometry.instanceCount=Math.max(0,count-1);
    for(let i=0;i<count-1;i++) {
      const j=i*3,k=i*6;
      this.segments[k]=this.points[j];this.segments[k+1]=this.points[j+1];this.segments[k+2]=this.points[j+2];
      this.segments[k+3]=this.points[j+3];this.segments[k+4]=this.points[j+4];this.segments[k+5]=this.points[j+5];
      this.segmentTimes[i*2]=this.times[i];this.segmentTimes[i*2+1]=this.times[i+1];
    }
    for(const buffer of [this.segmentBuffer,this.timeBuffer]) {
      buffer.clearUpdateRanges();buffer.addUpdateRange(0,Math.max(0,count-1)*buffer.stride);buffer.needsUpdate=true;
    }
    this.target.position.set(result.point.x, result.point.y, -.02);
    this.heightPoints.set([result.point.x, .02, -.02, result.point.x, result.point.y, -.02]);
    this.heightGeometry.attributes.position.needsUpdate = true;
    const origin = start ?? { x: this.points[0], z: this.points[2] };
    this.scan.position.set(origin.x / 2, .018, origin.z / 2);
    this.scan.scale.set(Math.max(24, Math.abs(origin.x) + 18), Math.max(18, origin.z + 12), 1);
    this.clock.value = this.reveal.value = 0;
    this.group.visible = count > 1;
  }
  /** Only two uniforms change during playback. Path uploads occur once, never each frame. */
  update(elapsed: number, shotTime: number) { this.clock.value = elapsed; this.reveal.value = shotTime; }
  hide() { this.group.visible = false; }
}
