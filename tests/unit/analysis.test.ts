import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ANALYSIS_DURATION, sampleAnalysis, type AnalysisFrame } from '../../src/game/analysis-timeline';
import { GoalAnalysis } from '../../src/game/goal-analysis';
import { ReplayBuffer } from '../../src/game/replay';
import { launchBall } from '../../src/game/physics';
import { createKeeper } from '../../src/game/keeper';
import { applyStudioLight } from '../../src/game/pbr';

const frame = (): AnalysisFrame => ({ stage: 'intro', shotTime: 0, progress: 0 });
describe('HyperMotionV-inspired recorded replay choreography', () => {
  it.each([[0, 'intro', -1.65], [.45, 'runup', -1.65], [1.275, 'runup', -.825], [2.1, 'strike', 0], [2.7, 'flight', 0], [4.15, 'flight', 1], [5.6, 'finish', 2], [7.25, 'overview', 2], [ANALYSIS_DURATION, 'done', 2]] as const)('samples stage/time at %s seconds', (elapsed, stage, time) => {
    const output = frame(); expect(sampleAnalysis(elapsed, 2, output)).toBe(output);
    expect(output.stage).toBe(stage); expect(output.shotTime).toBeCloseTo(time);
    expect(output.progress).toBeGreaterThanOrEqual(0); expect(output.progress).toBeLessThanOrEqual(1);
  });
  it('has monotonic recorded shot time and bounded frame progress for short and long shots', () => {
    for (const duration of [0, .04, 1, 4, 8]) {
      let last = -1.65; const out = frame();
      for (let time = -.1; time < 9; time += .02) {
        sampleAnalysis(time, duration, out);
        expect(out.shotTime).toBeGreaterThanOrEqual(last); expect(out.shotTime).toBeLessThanOrEqual(duration);
        last = out.shotTime;
      }
    }
  });
  it('uploads analysis geometry once and animates reveal/scan with uniforms only', () => {
    const replay = new ReplayBuffer(), keeper = createKeeper(0);
    const ball = launchBall({ position: { x: 0, z: 24 }, aim: { x: 1, y: 2 }, power: .7, foot: 'right', contact: { x: 0, y: 0 } });
    for (let i = 0; i < 10; i++) { ball.time = i / 60; ball.position.z = 24 - i; replay.record(ball, keeper); }
    const analysis = new GoalAnalysis();
    analysis.show(replay, { outcome: 'goal', distance: 24, speed: 100, power: .7, point: { x: 1, y: 2 }, technique: 'Knuckleball' }, 1, { x: 0, z: 24 });
    const path = analysis.group.children.find(o => o.name === 'recorded-flight-path') as THREE.Line;
    const positions = (path.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
    const times = (path.geometry.attributes.instanceStartTime as THREE.InterleavedBufferAttribute).data;
    const versions = [positions.version, times.version], original = positions.array.slice();
    const shader = { uniforms: {}, vertexShader: 'void main() {', fragmentShader: '#include <clipping_planes_fragment>' };
    (path.material as THREE.Material).onBeforeCompile(shader as never, {} as never);
    for (let t = 0; t < 8; t += .016) analysis.update(t, Math.min(.15, t));
    expect([positions.version, times.version]).toEqual(versions); expect(positions.array).toEqual(original);
    expect(shader.fragmentShader).toContain('vShotTime>uReveal');
    expect((shader.uniforms as Record<string, {value:number}>).uReveal.value).toBe(.15);
    analysis.hide(); expect(analysis.group.visible).toBe(false);
  });
});
describe('safe shader/material preparation', () => {
  it('invalidates each shared material only once, then skips an identical environment assignment', () => {
    const material = new THREE.MeshStandardMaterial(), texture = new THREE.Texture(), root = new THREE.Group();
    for (let i = 0; i < 5; i++) root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const version = material.version;
    applyStudioLight(root, texture, .5); expect(material.version).toBe(version + 1);
    applyStudioLight(root, texture, .5); expect(material.version).toBe(version + 1);
    applyStudioLight(root, texture, .7); expect(material.version).toBe(version + 2);
    expect(material.envMap).toBe(texture); expect(material.envMapIntensity).toBe(.7);
  });
});
