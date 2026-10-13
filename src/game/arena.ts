import * as THREE from 'three';
import {
  BALL_RADIUS, FIXED_DT, GOAL_HEIGHT, GOAL_WIDTH, clamp, cloneBall,
  distanceToGoal, getWall, integrateBall, launchBall,
  lerp, previewShot, recommendedPower, shotSpeed, strikeName, wallJump,
  type Aim, type BallState, type Outcome, type ShotSetup, type Vec3,
} from './physics';
import { cloneKeeper, createKeeper, KEEPER_Z, type KeeperState } from './keeper';
import { Player, makeFootball } from './player';
import { Stadium } from './stadium';
import { advanceShot } from './simulation';
import type { Settings, ShotResult } from '../state';

export type Phase = 'ready' | 'charging' | 'runup' | 'flight' | 'result' | 'replay';
export interface ArenaEvents {
  phase: (phase: Phase) => void;
  power: (power: number) => void;
  result: (result: ShotResult) => void;
  aim: (aim: Aim) => void;
  target: (x: number, y: number, visible: boolean) => void;
  error: (message: string) => void;
}
interface ReplayFrame { ball: Vec3; keeper: KeeperState; time: number }

export class Arena {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(39, 1, 0.05, 450);
  phase: Phase = 'ready';
  paused = false;
  power = 0;
  cameraMode: 'player' | 'broadcast' = 'player';
  lastResult: ShotResult | null = null;
  private settings: Settings;
  private events: ArenaEvents;
  private stadium: Stadium;
  private football: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private taker: Player;
  private keeperModel: Player;
  private wallModels: Player[];
  private ball: BallState;
  private keeper: KeeperState;
  private ring: THREE.Mesh;
  private guide: THREE.Line;
  private dots: THREE.InstancedMesh;
  private trace: THREE.Line;
  private tracePoints: number[] = [];
  private time = 0;
  private phaseTime = 0;
  private accumulator = 0;
  private lastTick = 0;
  private raf = 0;
  private chargeTime = 0;
  private width = 1;
  private height = 1;
  private previewPower = -1;
  private shotSetup: ShotSetup;
  private replayFrames: ReplayFrame[] = [];
  private replayClock = 0;
  private savedBall: BallState | null = null;
  private savedKeeper: KeeperState | null = null;
  private frameCounter = 0;
  private lookAt = new THREE.Vector3();
  private desiredCamera = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  private observer: ResizeObserver;
  private pointer: { id: number; x: number; y: number; aim: Aim; moved: boolean } | null = null;

  constructor(private container: HTMLElement, settings: Settings, events: ArenaEvents) {
    this.settings = structuredClone(settings);
    this.events = events;
    this.shotSetup = this.setup(recommendedPower(settings.position));
    this.ball = launchBall(this.shotSetup);
    this.keeper = createKeeper(settings.position.x);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = settings.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#b9cfc6');
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D free-kick arena. Drag to aim, or use the arrow keys.');
    this.renderer.domElement.setAttribute('role', 'img');
    this.container.appendChild(this.renderer.domElement);
    this.stadium = new Stadium(this.scene);
    this.football = makeFootball();
    this.scene.add(this.football);
    this.taker = new Player('taker', 10, 0);
    this.keeperModel = new Player('keeper', 1, 2);
    this.keeperModel.group.position.z = KEEPER_Z;
    this.wallModels = Array.from({ length: 5 }, (_, i) => new Player('wall', [4, 5, 6, 8, 2][i], i + 1));
    this.scene.add(this.taker.group, this.keeperModel.group, ...this.wallModels.map(p => p.group));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.425, 48), new THREE.MeshBasicMaterial({ color: '#d8ffad', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.scene.add(this.ring);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: '#183420', transparent: true, opacity: 0.3, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
    this.guide = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: '#efffd5', transparent: true, opacity: 0.65, dashSize: 0.2, gapSize: 0.19, depthWrite: false }));
    this.guide.frustumCulled = false;
    this.scene.add(this.guide);
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.043, 6, 4), new THREE.MeshBasicMaterial({ color: '#d4ffa0' }), 100);
    this.dots.frustumCulled = false;
    this.scene.add(this.dots);
    this.trace = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#edffd4', transparent: true, opacity: 0.42, depthWrite: false }));
    this.trace.frustumCulled = false;
    this.scene.add(this.trace);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.bindInput();
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.paused = true;
      this.events.error('The graphics context was interrupted. Reload the arena to continue.');
    });
    this.resize();
    this.reset();
    this.updateCamera(1, true);
    this.raf = requestAnimationFrame(this.tick);
  }

  private setup(power: number): ShotSetup {
    return {
      position: { ...this.settings.position }, aim: { ...this.settings.aim },
      contact: { ...this.settings.contact }, power, foot: this.settings.foot,
    };
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.phaseTime = 0;
    this.events.phase(phase);
  }

  updateSettings(settings: Settings) {
    const moved = settings.position.x !== this.settings.position.x || settings.position.z !== this.settings.position.z || settings.foot !== this.settings.foot || settings.wall !== this.settings.wall;
    this.settings = structuredClone(settings);
    this.renderer.shadowMap.enabled = settings.quality !== 'low';
    this.resize();
    if (this.phase === 'result' || moved) this.reset();
    else if (this.phase === 'ready' || this.phase === 'charging') this.updatePreview(true);
  }

  private resize() {
    const bounds = this.container.getBoundingClientRect();
    this.width = Math.max(1, bounds.width);
    this.height = Math.max(1, bounds.height);
    const maxRatio = this.settings.quality === 'high' ? 1.75 : this.settings.quality === 'balanced' ? 1.25 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.fov = this.width < 600 ? 47 : 39;
    this.camera.updateProjectionMatrix();
  }

  reset() {
    this.power = 0;
    this.chargeTime = 0;
    this.accumulator = 0;
    this.ball = launchBall(this.setup(recommendedPower(this.settings.position)));
    this.keeper = createKeeper(this.settings.position.x);
    this.football.position.set(this.ball.position.x, BALL_RADIUS, this.ball.position.z);
    this.football.rotation.set(0, 0.3, 0.1);
    this.ring.position.set(this.ball.position.x, 0.022, this.ball.position.z);
    const wall = getWall(this.settings.position, this.settings.wall);
    this.wallModels.forEach((model, i) => {
      model.group.visible = i < wall.length;
      if (wall[i]) {
        model.group.position.set(wall[i].x, 0, wall[i].z);
        model.group.rotation.y = Math.atan2(wall[i].x - this.settings.position.x, wall[i].z - this.settings.position.z);
        model.wallPose(0, this.time);
      }
    });
    this.positionTaker(0);
    this.keeperModel.keeperPose(this.keeper, this.time);
    this.tracePoints = [];
    this.setTrace();
    this.setPhase('ready');
    this.updatePreview(true);
    this.events.power(0);
  }

  charge(): boolean {
    if (this.phase !== 'ready' || this.paused) return false;
    this.power = 0;
    this.chargeTime = 0;
    this.setPhase('charging');
    return true;
  }

  release() {
    if (this.phase !== 'charging') return;
    this.power = clamp(this.power, 0.06, 1);
    this.shotSetup = this.setup(this.power);
    this.guide.visible = this.dots.visible = false;
    this.ring.visible = false;
    this.replayFrames = [];
    this.lastResult = null;
    this.tracePoints = [];
    this.setTrace();
    this.setPhase('runup');
  }

  cancelCharge() {
    if (this.phase === 'charging') {
      this.power = 0;
      this.events.power(0);
      this.setPhase('ready');
      this.updatePreview(true);
    }
  }

  toggleCamera(): string {
    this.cameraMode = this.cameraMode === 'player' ? 'broadcast' : 'player';
    return this.cameraMode;
  }

  replay(): boolean {
    if (this.phase !== 'result' || this.replayFrames.length < 3) return false;
    this.savedBall = cloneBall(this.ball);
    this.savedKeeper = cloneKeeper(this.keeper);
    this.replayClock = 0;
    this.setPhase('replay');
    this.trace.visible = false;
    return true;
  }

  setPaused(paused: boolean) {
    if (paused) this.cancelCharge();
    this.paused = paused;
    this.lastTick = 0;
  }

  adjustAim(dx: number, dy: number) {
    if (this.phase !== 'ready') return;
    this.setAim({ x: this.settings.aim.x + dx, y: this.settings.aim.y + dy });
  }

  private setAim(aim: Aim) {
    this.settings.aim = { x: clamp(aim.x, -8, 8), y: clamp(aim.y, 0.15, 5.2) };
    this.events.aim({ ...this.settings.aim });
    this.updatePreview(true);
  }

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', event => {
      if (this.phase !== 'ready' || this.paused || !event.isPrimary) return;
      el.setPointerCapture(event.pointerId);
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, aim: { ...this.settings.aim }, moved: false };
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', event => {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      if (Math.hypot(dx, dy) > 3) this.pointer.moved = true;
      this.setAim({ x: this.pointer.aim.x + dx / this.width * 17, y: this.pointer.aim.y - dy / this.height * 6 });
    });
    el.addEventListener('pointerup', event => {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      if (!this.pointer.moved) {
        const rect = el.getBoundingClientRect();
        const point = new THREE.Vector2((event.clientX - rect.left) / this.width * 2 - 1, -(event.clientY - rect.top) / this.height * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(point, this.camera);
        const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
        if (hit && Math.abs(hit.x) < 8 && hit.y > 0.1 && hit.y < 5.2) this.setAim(hit);
      }
      this.pointer = null;
      el.style.cursor = 'grab';
    });
    el.addEventListener('pointercancel', () => { this.pointer = null; el.style.cursor = 'grab'; });
  }

  private positionTaker(run: number) {
    const p = this.settings.position;
    const side = this.settings.foot === 'right' ? -1 : 1;
    const t = Math.min(1, run / 0.85);
    this.taker.group.position.set(p.x + side * lerp(1.07, 0.2, t), 0, p.z + lerp(2.15, 0.21, t));
    this.taker.group.rotation.y = Math.atan2(p.x - this.settings.aim.x, p.z);
  }

  private updatePreview(force = false) {
    const power = this.phase === 'charging' ? this.power : recommendedPower(this.settings.position);
    if (!force && Math.abs(power - this.previewPower) < 0.025) return;
    this.previewPower = power;
    const points = previewShot(this.setup(power));
    const vectors = points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    this.guide.geometry.dispose();
    this.guide.geometry = new THREE.BufferGeometry().setFromPoints(vectors);
    this.guide.computeLineDistances();
    const object = new THREE.Object3D();
    const selected = vectors.filter((_, i) => i % 3 === 0);
    this.dots.count = Math.min(100, selected.length);
    selected.slice(0, 100).forEach((point, index) => {
      object.position.copy(point);
      object.updateMatrix();
      this.dots.setMatrixAt(index, object.matrix);
    });
    this.dots.instanceMatrix.needsUpdate = true;
    this.guide.visible = this.dots.visible = this.settings.guides && (this.phase === 'ready' || this.phase === 'charging');
    this.ring.visible = true;
  }

  private tick = (timestamp: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = this.lastTick ? Math.min((timestamp - this.lastTick) / 1000, 0.05) : 1 / 60;
    this.lastTick = timestamp;
    if (this.paused) return;
    this.time += dt;
    this.phaseTime += dt;
    if (this.phase === 'charging') {
      this.chargeTime += dt;
      this.power = Math.min(1, this.chargeTime / 1.65);
      this.events.power(this.power);
      this.updatePreview();
      if (this.chargeTime >= 2.05) this.release();
    }
    if (this.phase === 'ready' || this.phase === 'charging') {
      this.taker.idle(this.time);
      this.keeperModel.keeperPose(this.keeper, this.time);
      this.wallModels.forEach((p, i) => p.wallPose(0, this.time + i * 0.7));
    } else if (this.phase === 'runup') {
      const progress = Math.min(1, this.phaseTime / 0.72);
      this.positionTaker(progress);
      this.taker.run(progress, this.settings.foot);
      if (progress >= 1) {
        this.ball = launchBall(this.shotSetup);
        this.frameCounter = 0;
        this.accumulator = 0;
        this.setPhase('flight');
      }
    } else if (this.phase === 'flight') {
      this.accumulator += dt;
      while (this.accumulator >= FIXED_DT && this.phase === 'flight') {
        this.stepShot();
        this.accumulator -= FIXED_DT;
      }
      this.taker.followThrough(this.ball.time, this.settings.foot);
      this.wallModels.forEach(p => p.wallPose(wallJump(this.ball.time), this.time));
      this.keeperModel.keeperPose(this.keeper, this.time);
    } else if (this.phase === 'result') {
      if (this.phaseTime < 1.8) {
        this.accumulator += dt;
        while (this.accumulator >= FIXED_DT) {
          this.stepAftermath();
          this.accumulator -= FIXED_DT;
        }
      }
      this.taker.followThrough(this.ball.time, this.settings.foot);
      this.wallModels.forEach(p => p.wallPose(0, this.time));
      this.keeperModel.keeperPose(this.keeper, this.time);
    } else if (this.phase === 'replay') this.stepReplay(dt);
    this.football.position.set(this.ball.position.x, this.ball.position.y, this.ball.position.z);
    if (this.phase === 'flight' || this.phase === 'result' || this.phase === 'replay') {
      this.football.rotation.x -= dt * Math.hypot(this.ball.velocity.x, this.ball.velocity.z) * 2.8;
      this.football.rotation.y += dt * this.ball.sideSpin;
    }
    this.ballShadow.position.set(this.ball.position.x, 0.022, this.ball.position.z);
    this.ballShadow.scale.setScalar(1 + this.ball.position.y * 0.18);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.05, 0.32 - this.ball.position.y * 0.055);
    this.stadium.update(this.time);
    this.updateCamera(dt);
    const aim = new THREE.Vector3(this.settings.aim.x, this.settings.aim.y, 0).project(this.camera);
    this.events.target((aim.x + 1) / 2 * this.width, (-aim.y + 1) / 2 * this.height, this.phase === 'ready' || this.phase === 'charging');
    this.renderer.render(this.scene, this.camera);
  };

  private stepShot() {
    const event = advanceShot(this.ball, this.keeper, getWall(this.shotSetup.position, this.settings.wall), this.settings.difficulty);
    this.recordFrame();
    if (!event) return;
    if (event.outcome === 'goal') this.stadium.ripple(new THREE.Vector3(event.point.x, event.point.y, -1.6), this.time);
    this.resolve(event.outcome, event.point);
  }

  private stepAftermath() {
    integrateBall(this.ball);
    if (this.lastResult?.outcome === 'goal') {
      if (this.ball.position.z < -2.05) {
        this.ball.position.z = -2.05;
        this.ball.velocity.z = Math.abs(this.ball.velocity.z) * 0.1;
      }
      if (this.ball.position.z > -BALL_RADIUS) {
        this.ball.position.z = -BALL_RADIUS;
        this.ball.velocity.z = 0;
      }
      this.ball.position.x = clamp(this.ball.position.x, -GOAL_WIDTH / 2 + 0.15, GOAL_WIDTH / 2 - 0.15);
      this.ball.position.y = Math.min(this.ball.position.y, GOAL_HEIGHT - 0.1);
      this.ball.velocity.x *= 0.98;
    }
    if (this.phaseTime < 0.9) this.recordFrame();
  }

  private recordFrame() {
    this.frameCounter++;
    if (this.frameCounter % 2 !== 0) return;
    if (this.replayFrames.length < 480) this.replayFrames.push({ ball: { ...this.ball.position }, keeper: cloneKeeper(this.keeper), time: this.ball.time });
    this.tracePoints.push(this.ball.position.x, this.ball.position.y, this.ball.position.z);
    if (this.tracePoints.length > 720) this.tracePoints.splice(0, 3);
    this.setTrace();
  }

  private setTrace() {
    this.trace.geometry.dispose();
    this.trace.geometry = new THREE.BufferGeometry();
    this.trace.geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.tracePoints, 3));
    this.trace.visible = this.tracePoints.length > 3 && this.settings.guides;
  }

  private resolve(outcome: Outcome, point = this.ball.position) {
    this.lastResult = {
      outcome,
      distance: distanceToGoal(this.shotSetup.position),
      speed: shotSpeed(this.shotSetup.power) * 3.6,
      power: this.shotSetup.power,
      point: { x: point.x, y: point.y },
      technique: strikeName(this.shotSetup.contact, this.shotSetup.foot),
    };
    this.setPhase('result');
    this.events.result(this.lastResult);
  }

  private stepReplay(dt: number) {
    this.replayClock += dt * 0.55;
    const index = Math.floor(this.replayClock * 60);
    const a = this.replayFrames[Math.min(index, this.replayFrames.length - 1)];
    const b = this.replayFrames[Math.min(index + 1, this.replayFrames.length - 1)];
    if (a && b) {
      const fraction = this.replayClock * 60 - index;
      this.ball.position = { x: lerp(a.ball.x, b.ball.x, fraction), y: lerp(a.ball.y, b.ball.y, fraction), z: lerp(a.ball.z, b.ball.z, fraction) };
      this.keeper = cloneKeeper(a.keeper);
      this.keeperModel.keeperPose(this.keeper, this.time);
      this.wallModels.forEach(p => p.wallPose(wallJump(a.time), this.time));
      this.taker.followThrough(a.time, this.settings.foot);
    }
    if (index >= this.replayFrames.length + 15) {
      if (this.savedBall) this.ball = this.savedBall;
      if (this.savedKeeper) this.keeper = this.savedKeeper;
      this.setPhase('result');
      // Do not simulate or count this shot twice after leaving replay.
      this.phaseTime = 2;
      this.trace.visible = this.settings.guides;
    }
  }

  private updateCamera(dt: number, snap = false) {
    const p = this.settings.position;
    const replay = this.phase === 'replay';
    if (this.cameraMode === 'broadcast' || replay) {
      this.desiredCamera.set(p.x + 12.5, 9.2, p.z + 8);
      this.desiredLook.set(p.x * 0.3, 1.0, p.z * 0.3);
    } else {
      const forward = this.phase === 'flight' || this.phase === 'result' ? Math.min(2.3, this.ball.time * 1.8) : 0;
      this.desiredCamera.set(p.x + 0.65, 3.1, p.z + 9.5 - forward);
      // Frame the kicker's whole body and the ball, rather than cropping at the waist.
      this.desiredLook.set(p.x * 0.12, -2.7, 0);
    }
    const blend = snap ? 1 : 1 - Math.exp(-dt * 4.5);
    this.camera.position.lerp(this.desiredCamera, blend);
    this.lookAt.lerp(this.desiredLook, blend);
    this.camera.lookAt(this.lookAt);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const mat of materials) mat.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
