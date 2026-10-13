import * as THREE from 'three';
import {
  AIM_LIMITS, BALL_RADIUS, FIXED_DT, GOAL_HEIGHT, GOAL_WIDTH, clamp, cloneBall,
  distanceToGoal, getWall, integrateBall, launchBall,
  lerp, previewShot, recommendedPower, shotSpeed, strikeName, wallJump,
  type Aim, type BallState, type Outcome, type ShotSetup, type Vec3, type WallPlayer,
} from './physics';
import { inPenaltyBox } from './physics';
import { cloneKeeper, createKeeper, KEEPER_Z, type KeeperState } from './keeper';
import { Player, makeFootball } from './player';
import { Stadium } from './stadium';
import { PostStack } from './post';
import { applyStudioLight, studioEnvironment } from './pbr';
import { advanceShot } from './simulation';
import { getPlayer } from '../players';
import type { Settings, ShotResult } from '../state';

export type Phase = 'ready' | 'charging' | 'runup' | 'flight' | 'result' | 'replay';
export interface ArenaEvents {
  phase: (phase: Phase) => void;
  power: (power: number) => void;
  result: (result: ShotResult) => void;
  aim: (aim: Aim) => void;
  error: (message: string) => void;
  performance?: (stats: { fps: number; calls: number; triangles: number; pixelRatio: number }) => void;
}
interface ReplayFrame { ball: Vec3; keeper: KeeperState; time: number }

export class Arena {
  readonly renderer: THREE.WebGLRenderer;
  private readonly post: PostStack;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(39, 1, 0.05, 450);
  phase: Phase = 'ready';
  paused = false;
  power = 0;
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
  private readonly tracePositions = new Float32Array(720);
  private tracePointCount = 0;
  private readonly guidePositions = new Float32Array(512 * 3);
  private readonly guideDistances = new Float32Array(512);
  private readonly scratchObject = new THREE.Object3D();
  private wall: WallPlayer[] = [];
  private metricsStart = 0;
  private metricsFrames = 0;
  /** Attract mode: the menu background. Orbiting camera, no input, no shots. */
  attract = false;
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
    // Native resolution is always used; MSAA is only needed on low-density screens.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = settings.quality !== 'low';
    this.renderer.shadowMap.type = settings.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.post = new PostStack(this.renderer, this.scene, this.camera);
    this.renderer.setClearColor('#b9cfc6');
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D free-kick arena. Drag to aim, or use the arrow keys.');
    this.renderer.domElement.setAttribute('role', 'img');
    this.container.appendChild(this.renderer.domElement);
    this.stadium = new Stadium(this.scene);
    this.stadium.setAtmosphere(settings.atmosphere);
    this.stadium.setQuality(settings.quality);
    const shadowSize = settings.quality === 'high' ? 1024 : 512;
    this.stadium.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.football = makeFootball();
    this.scene.add(this.football);
    this.taker = new Player('taker', 7, 0);
    this.taker.setProfile(getPlayer(settings.playerId));
    this.keeperModel = new Player('keeper', 1, 2);
    this.keeperModel.group.position.z = KEEPER_Z;
    this.wallModels = Array.from({ length: 5 }, (_, i) => new Player('wall', [4, 5, 6, 8, 2][i], i + 1));
    this.scene.add(this.taker.group, this.keeperModel.group, ...this.wallModels.map(p => p.group));
    // Studio image-based lighting for the athletes and ball only (PBR reflections, generated once).
    const studio = studioEnvironment(this.renderer);
    for (const object of [this.football, this.taker.group, this.keeperModel.group, ...this.wallModels.map(p => p.group)]) applyStudioLight(object, studio);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.425, 48), new THREE.MeshBasicMaterial({ color: '#d8ffad', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.scene.add(this.ring);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: '#183420', transparent: true, opacity: 0.3, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
    this.guide = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.guidePositions, 3).setUsage(THREE.DynamicDrawUsage)).setAttribute('lineDistance', new THREE.BufferAttribute(this.guideDistances, 1).setUsage(THREE.DynamicDrawUsage)), new THREE.LineBasicMaterial({ color: '#2d9cff', transparent: true, opacity: 0.95, depthWrite: false }));
    this.guide.frustumCulled = false;
    this.scene.add(this.guide);
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.043, 6, 4), new THREE.MeshBasicMaterial({ color: '#d4ffa0' }), 100);
    this.dots.frustumCulled = false;
    this.dots.visible = false; // single blue line only, no waypoint dots
    this.scene.add(this.dots);
    this.trace = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.tracePositions, 3).setUsage(THREE.DynamicDrawUsage)), new THREE.LineBasicMaterial({ color: '#2d9cff', transparent: true, opacity: 0.6, depthWrite: false }));
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
      contact: { ...this.settings.contact }, power, foot: this.settings.foot, attributes: { ...getPlayer(this.settings.playerId).attributes },
    };
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.phaseTime = 0;
    this.events.phase(phase);
  }

  updateSettings(settings: Settings) {
    const old = this.settings;
    const moved = settings.position.x !== old.position.x || settings.position.z !== old.position.z || settings.foot !== old.foot || settings.wall !== old.wall;
    const techniqueChanged = settings.aim.x !== old.aim.x || settings.aim.y !== old.aim.y || settings.contact.x !== old.contact.x || settings.contact.y !== old.contact.y;
    const playerChanged = settings.playerId !== old.playerId;
    const gameplayChanged = moved || techniqueChanged || playerChanged || settings.difficulty !== old.difficulty;
    const qualityChanged = settings.quality !== old.quality;
    this.settings = structuredClone(settings);
    if (inPenaltyBox(this.settings.position)) this.settings.wall = 0;
    if (playerChanged) this.taker.setProfile(getPlayer(settings.playerId));
    if (settings.atmosphere !== old.atmosphere) this.stadium.setAtmosphere(settings.atmosphere);
    if (qualityChanged) {
      this.stadium.setQuality(settings.quality);
      this.renderer.shadowMap.enabled = settings.quality !== 'low';
      this.renderer.shadowMap.type = settings.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      this.scene.traverse(object => {
        if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.needsUpdate = true;
      });
      const size = settings.quality === 'high' ? 1024 : 512;
      this.stadium.sun.shadow.mapSize.set(size, size);
      this.stadium.sun.shadow.map?.dispose();
      this.stadium.sun.shadow.map = null;
      this.resize();
    }
    if (moved || playerChanged || (this.phase === 'result' && gameplayChanged)) this.reset();
    else if (this.phase === 'ready' || this.phase === 'charging') this.updatePreview(true);
    this.trace.visible = this.settings.guides && this.tracePointCount > 1 && (this.phase === 'flight' || this.phase === 'result');
  }

  private resize() {
    const bounds = this.container.getBoundingClientRect();
    this.width = Math.max(1, bounds.width);
    this.height = Math.max(1, bounds.height);
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(this.width, this.height, false);
    this.post.configure(this.settings.quality, this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.fov = this.width < this.height ? 50 : this.height < 500 ? 44 : 39;
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
    const wall = this.wall = getWall(this.settings.position, this.settings.wall);
    this.renderer.shadowMap.needsUpdate = true;
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
    this.tracePointCount = 0;
    this.setTrace();
    this.setPhase('ready');
    this.updatePreview(true);
    this.events.power(0);
  }

  charge(): boolean {
    if (this.phase !== 'ready' || this.paused || this.attract) return false;
    this.power = 0;
    this.chargeTime = 0;
    this.setPhase('charging');
    return true;
  }

  release() {
    if (this.phase !== 'charging') return;
    this.power = clamp(this.power, 0.06, 1);
    this.shotSetup = this.setup(this.power);
    this.guide.visible = false;
    this.ring.visible = false;
    this.replayFrames = [];
    this.lastResult = null;
    this.tracePointCount = 0;
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

  setAttract(on: boolean) {
    this.attract = on;
    this.cancelCharge();
    this.lastTick = 0;
    this.pointer = null;
    this.renderer.domElement.style.cursor = on ? 'default' : 'grab';
  }

  adjustAim(dx: number, dy: number) {
    if (this.phase !== 'ready') return;
    this.setAim({ x: this.settings.aim.x + dx, y: this.settings.aim.y + dy });
  }

  private setAim(aim: Aim) {
    this.settings.aim = { x: clamp(aim.x, -AIM_LIMITS.x, AIM_LIMITS.x), y: clamp(aim.y, AIM_LIMITS.yMin, AIM_LIMITS.yMax) };
    this.events.aim({ ...this.settings.aim });
    this.updatePreview(true);
  }

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', event => {
      if (this.phase !== 'ready' || this.paused || this.attract || !event.isPrimary) return;
      el.setPointerCapture(event.pointerId);
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, aim: { ...this.settings.aim }, moved: false };
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', event => {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      if (Math.hypot(dx, dy) > 3) this.pointer.moved = true;
      // A wider drag range than v2: a full screen width is 24 m of aim, a full height is 9 m.
      this.setAim({ x: this.pointer.aim.x + dx / this.width * 24, y: this.pointer.aim.y - dy / this.height * 9 });
    });
    el.addEventListener('pointerup', event => {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      if (!this.pointer.moved) {
        const rect = el.getBoundingClientRect();
        const point = new THREE.Vector2((event.clientX - rect.left) / this.width * 2 - 1, -(event.clientY - rect.top) / this.height * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(point, this.camera);
        const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
        if (hit && Math.abs(hit.x) < AIM_LIMITS.x && hit.y > AIM_LIMITS.yMin && hit.y < AIM_LIMITS.yMax) this.setAim(hit);
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
    const e = t * t * (3 - 2 * t); // eased: the run-up accelerates, then settles at the ball
    const length = distanceToGoal(p);
    const back = lerp(2.6, 0.21, e);
    // The lateral offset falls off faster than the distance, which bends the approach into an arc.
    const lateral = side * lerp(1.3, 0.22, Math.pow(e, 0.7));
    this.taker.group.position.set(p.x + p.x / length * back + p.z / length * lateral, 0, p.z + p.z / length * back - p.x / length * lateral);
    this.taker.group.rotation.y = Math.atan2(p.x - this.settings.aim.x, p.z);
  }

  private updatePreview(force = false) {
    const power = this.phase === 'charging' ? this.power : recommendedPower(this.settings.position);
    if (!force && Math.abs(power - this.previewPower) < 0.025) return;
    this.previewPower = power;
    const points = previewShot(this.setup(power));
    const count = Math.min(points.length, 512);
    let travelled = 0;
    let dot = 0;
    const object = this.scratchObject;
    for (let i = 0; i < count; i++) {
      const p = points[i];
      this.guidePositions.set([p.x, p.y, p.z], i * 3);
      if (i) travelled += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y, p.z - points[i - 1].z);
      this.guideDistances[i] = travelled;
      if (i % 3 === 0 && dot < 100) {
        object.position.set(p.x, p.y, p.z); object.updateMatrix(); this.dots.setMatrixAt(dot++, object.matrix);
      }
    }
    this.guide.geometry.setDrawRange(0, count);
    this.guide.geometry.attributes.position.needsUpdate = true;
    this.guide.geometry.attributes.lineDistance.needsUpdate = true;
    this.dots.count = dot;
    this.dots.instanceMatrix.needsUpdate = true;
    this.guide.visible = this.settings.guides && (this.phase === 'ready' || this.phase === 'charging');
    this.ring.visible = true;
  }

  private tick = (timestamp: number) => {
    this.raf = requestAnimationFrame(this.tick);
    if (this.paused) { this.metricsStart = timestamp; this.metricsFrames = 0; return; }
    // Every frame renders at the display rate, idle included: no throttling, so no catch-up spikes.
    const dt = this.lastTick ? Math.min((timestamp - this.lastTick) / 1000, 0.1) : 1 / 60;
    this.lastTick = timestamp;
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
      this.football.rotation.x -= dt * (this.ball.knuckle ? 1.3 : Math.hypot(this.ball.velocity.x, this.ball.velocity.z) * 2.8);
      this.football.rotation.y += dt * this.ball.sideSpin;
    }
    this.ballShadow.position.set(this.ball.position.x, 0.022, this.ball.position.z);
    this.ballShadow.scale.setScalar(1 + this.ball.position.y * 0.18);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.05, 0.32 - this.ball.position.y * 0.055);
    this.stadium.update(this.time);
    this.updateCamera(dt);
    this.renderer.shadowMap.needsUpdate = true;
    this.post.render();
    this.metricsFrames++;
    if (!this.metricsStart) this.metricsStart = timestamp;
    if (timestamp - this.metricsStart >= 1200) {
      const fps = Math.round(this.metricsFrames * 1000 / (timestamp - this.metricsStart));
      this.events.performance?.({ fps, calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, pixelRatio: this.renderer.getPixelRatio() });
      this.metricsStart = timestamp; this.metricsFrames = 0;
    }
  };

  private stepShot() {
    const event = advanceShot(this.ball, this.keeper, this.wall, this.settings.difficulty);
    this.recordFrame();
    if (!event) return;
    const impact = new THREE.Vector3(event.point.x, event.point.y, -1.6);
    if (event.outcome === 'goal') this.stadium.ripple(impact, this.time);
    if (event.outcome === 'goal' || event.outcome === 'post') this.stadium.celebrate(impact, this.time, event.outcome === 'goal');
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
    if (this.tracePointCount >= 240) this.tracePositions.copyWithin(0, 3);
    else this.tracePointCount++;
    const i = (this.tracePointCount - 1) * 3;
    this.tracePositions[i] = this.ball.position.x;
    this.tracePositions[i + 1] = this.ball.position.y;
    this.tracePositions[i + 2] = this.ball.position.z;
    this.setTrace();
  }

  private setTrace() {
    this.trace.geometry.setDrawRange(0, this.tracePointCount);
    this.trace.geometry.attributes.position.needsUpdate = true;
    this.trace.visible = this.tracePointCount > 1 && this.settings.guides;
  }

  private resolve(outcome: Outcome, point = this.ball.position) {
    this.lastResult = {
      outcome,
      distance: distanceToGoal(this.shotSetup.position),
      speed: shotSpeed(this.shotSetup.power, this.shotSetup.attributes) * 3.6,
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
    if (this.attract) {
      // Menu background: a slow, drifting broadcast view around the kicker.
      const t = this.time;
      this.desiredCamera.set(p.x + 13 + Math.sin(t * 0.11) * 4, 8.4 + Math.sin(t * 0.23) * 0.5, p.z + 9 + Math.sin(t * 0.07) * 3);
      this.desiredLook.set(p.x * 0.3, 1.2, p.z * 0.3 + Math.sin(t * 0.09) * 0.6);
    } else if (replay) {
      this.desiredCamera.set(p.x + 12.5, 9.2, p.z + 8);
      this.desiredLook.set(p.x * 0.3, 1.0, p.z * 0.3);
    } else {
      const forward = this.phase === 'flight' || this.phase === 'result' ? Math.min(2.3, this.ball.time * 1.8) : 0;
      const portrait = this.width < this.height;
      const length = distanceToGoal(p);
      const back = (portrait ? 13.2 : 9.7) - forward;
      const lateral = portrait ? (this.settings.foot === 'right' ? -.45 : .45) : .65;
      this.desiredCamera.set(p.x + p.x / length * back + p.z / length * lateral, 2.5, p.z + p.z / length * back - p.x / length * lateral);
      // Constant camera pitch and shot-local positioning also frame wide spots/portrait phones.
      this.desiredLook.set(0, 1.2, 0);
      // Barely perceptible handheld drift while the kicker sets up.
      if (this.phase === 'ready' || this.phase === 'charging') {
        this.desiredCamera.x += Math.sin(this.time * 0.61) * 0.028;
        this.desiredCamera.y += Math.sin(this.time * 0.93) * 0.02;
      }
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
