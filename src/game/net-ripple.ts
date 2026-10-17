import * as THREE from 'three';
import { GOAL_HEIGHT, GOAL_WIDTH } from './physics';

/** Same damped wave as the former CPU loop; only presentation moves to GPU, never scoring physics. */
export const NET_RIPPLE_VERTEX = `
if (uNetElapsed >= 0. && uNetElapsed <= 3.) {
  transformed.z -= sin(uNetElapsed * 17. - ripple.x) * exp(-uNetElapsed * 2.2) * ripple.y;
}`;
export class NetRipple {
  private readonly elapsed = { value: -1 };
  private readonly parameters: THREE.BufferAttribute;
  private readonly edge: Float32Array;
  private readonly rest: THREE.BufferAttribute;
  private impactTime = -10;
  constructor(net: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>) {
    this.rest = net.geometry.attributes.position as THREE.BufferAttribute;
    this.edge = new Float32Array(this.rest.count);
    this.parameters = new THREE.BufferAttribute(new Float32Array(this.rest.count * 2), 2).setUsage(THREE.DynamicDrawUsage);
    net.geometry.setAttribute('ripple', this.parameters);
    for (let i = 0; i < this.rest.count; i++) this.edge[i] = Math.sin((this.rest.getX(i) + GOAL_WIDTH / 2) / GOAL_WIDTH * Math.PI) * Math.sin(this.rest.getY(i) / GOAL_HEIGHT * Math.PI);
    net.material.onBeforeCompile = shader => {
      shader.uniforms.uNetElapsed = this.elapsed;
      shader.vertexShader = 'attribute vec2 ripple; uniform float uNetElapsed;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + NET_RIPPLE_VERTEX);
    };
    net.material.customProgramCacheKey = () => 'damped-net-ripple-v1';
  }
  hit(point: { x: number; y: number }, time: number) {
    this.impactTime = time; this.elapsed.value = 0;
    for (let i = 0; i < this.rest.count; i++) {
      const distance = Math.hypot(this.rest.getX(i) - point.x, this.rest.getY(i) - point.y);
      this.parameters.setXY(i, distance * 2.5, Math.exp(-distance * .5) * .5 * this.edge[i]);
    }
    this.parameters.needsUpdate = true;
  }
  update(time: number) {
    const elapsed = time - this.impactTime;
    this.elapsed.value = elapsed >= 0 && elapsed <= 3 ? elapsed : -1;
  }
}
