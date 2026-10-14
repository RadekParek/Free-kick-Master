import * as THREE from 'three';
import {
  AIM_LIMITS, BALL_RADIUS, FIXED_DT, GOAL_HEIGHT, GOAL_WIDTH, clamp, cloneBall,
  distanceToGoal, getWall, integrateBall, launchBall,
  lerp, previewShotInto, recommendedPower, shotSpeed, strikeName, wallJump,
  type Aim, type BallState, type Outcome, type ShotSetup, type WallPlayer,
} from './physics';
import { inPenaltyBox } from './physics';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { cloneKeeper, createKeeper, KEEPER_Z, keeperYaw, type KeeperState } from './keeper';
import { Player, makeFootball } from './player';
import { Stadium } from './stadium';
import { PostStack, type PostOptions } from './post';
import { applyStudioLight, studioEnvironment } from './pbr';
import { advanceShot, createShotScratch } from './simulation';
import { ReplayBuffer } from './replay';
import { getPlayer } from '../players';
import type { Settings, ShotResult } from '../state';

/** Real penalty run-ups take about 1.2 to 1.4 s; the taker reaches the ball at this run progress. */
const RUNUP_SECONDS = 1.3;
const RUNUP_PROGRESS_END = 0.9;

export type Phase = 'ready' | 'charging' | 'runup' | 'flight' | 'result' | 'replay';
export interface ArenaEvents {
  phase: (phase: Phase) => void;
  power: (power: number) => void;
  result: (result: ShotResult) => void;
  aim: (aim: Aim) => void;
  error: (message: string) => void;
  woodwork?: () => void;
  performance?: (stats: { fps: number; calls: number; triangles: number; pixelRatio: number }) => void;
}

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
  private trace: Line2;
  private readonly tracePositions = new Float32Array(720);
  private tracePointCount = 0;
  private wallGap = -1;
  private shift = 0;
  private traceGeometry = new LineGeometry();
  private traceMaterial = new LineMaterial({ color: 0x2d9cff, linewidth: 4.5, transparent: true, opacity: 0.85, depthWrite: false });
  private readonly guidePositions = new Float32Array(512 * 3);
  private previewDirty = false;
  private readonly traceSegments = new Float32Array(239 * 6);
  private readonly traceBuffer = new THREE.InstancedInterleavedBuffer(this.traceSegments, 6).setUsage(THREE.DynamicDrawUsage);
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
  private readonly replayFrames = new ReplayBuffer();
  private resultBallTime = Infinity;
  private readonly shotScratch = createShotScratch();
  private traceDirty = false;
  private traceUploadedCount = 0;
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
    // Canvas MSAA is off: anti-aliasing comes from the post pipeline so the settings can change it live.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = settings.graphics.shadows > 0;
    this.renderer.shadowMap.type = settings.graphics.shadows >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.post = new PostStack(this.renderer, this.scene, this.camera);
    this.renderer.setClearColor('#b9cfc6');
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D free-kick arena. Drag to aim, or use the arrow keys.');
    this.renderer.domElement.setAttribute('role', 'img');
    this.container.appendChild(this.renderer.domElement);
    this.stadium = new Stadium(this.scene);
    this.stadium.setAtmosphere(settings.atmosphere);
    this.stadium.setQuality(settings.quality);
    const shadowSize = settings.graphics.shadows || 512;
    this.stadium.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.football = makeFootball();
    this.scene.add(this.football);
    this.taker = new Player('taker', 7, 0);
    this.taker.setProfile(getPlayer(settings.playerId));
    this.keeperModel = new Player('keeper', 1, 2);
    this.keeperModel.group.position.z = KEEPER_Z;
    this.wallModels = Array.from({ length: 5 }, (_, i) => new Player('wall', [4, 5, 6, 8, 2][i], i + 1));
    // Real defenders differ in height; this varies the wall silhouette.
    this.wallModels.forEach((m, i) => { m.group.scale.y = [1, 0.97, 1.03, 0.985, 1.015][i] ?? 1; });
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
    this.guide = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.guidePositions, 3).setUsage(THREE.DynamicDrawUsage)), new THREE.LineBasicMaterial({ color: '#2d9cff', transparent: true, opacity: 0.95, depthWrite: false }));
    this.guide.frustumCulled = false;
    this.scene.add(this.guide);
    this.traceGeometry.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(this.traceBuffer, 3, 0));
    this.traceGeometry.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(this.traceBuffer, 3, 3));
    this.traceGeometry.instanceCount = 0;
    this.trace = new Line2(this.traceGeometry, this.traceMaterial);
    this.trace.frustumCulled = false;
    this.scene.add(this.trace);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.bindInput();
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.setPaused(true);
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
    const g = settings.graphics, previous = old.graphics;
    if (qualityChanged) this.stadium.setQuality(settings.quality);
    if (g.shadows !== previous.shadows) {
      this.renderer.shadowMap.enabled = g.shadows > 0;
      this.renderer.shadowMap.type = g.shadows >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      // Only a shadow-mode change requires shadow shader invalidation.
      this.scene.traverse(object => {
        if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.needsUpdate = true;
      });
      const size = g.shadows || 512;
      this.stadium.sun.shadow.mapSize.set(size, size);
      this.stadium.sun.shadow.map?.dispose();
      this.stadium.sun.shadow.map = null;
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (g.resolution !== previous.resolution) this.resize();
    else if (qualityChanged || g.msaa !== previous.msaa || g.smaa !== previous.smaa || g.bloom !== previous.bloom) {
      this.post.configure(this.postOptions(), this.width, this.height);
    }
    if (moved || playerChanged || (this.phase === 'result' && gameplayChanged)) this.reset();
    else if (this.phase === 'ready' || this.phase === 'charging') this.previewDirty = true;
    this.trace.visible = this.settings.guides && this.tracePointCount > 1 && (this.phase === 'flight' || this.phase === 'result');
  }

  /** Horizontal lens shift: moves the menu subject to the right of centre without moving the camera. */
  private setShift(px: number) {
    if (px === this.shift) return;
    this.shift = px;
    if (px === 0) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.width, this.height, px, 0, this.width, this.height);
  }

  private postOptions(): PostOptions {
    const g = this.settings.graphics;
    return { msaa: g.msaa, smaa: g.smaa, bloom: g.bloom, quality: this.settings.quality };
  }

  private resize() {
    const bounds = this.container.getBoundingClientRect();
    this.width = Math.max(1, bounds.width);
    this.height = Math.max(1, bounds.height);
    this.renderer.setPixelRatio((window.devicePixelRatio || 1) * this.settings.graphics.resolution);
    this.renderer.setSize(this.width, this.height, false);
    this.traceMaterial.resolution.set(this.width, this.height);
    this.post.configure(this.postOptions(), this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.fov = this.width < this.height ? 50 : this.height < 500 ? 44 : 39;
    this.camera.updateProjectionMatrix();
  }

  reset() {
    this.keeperModel.yaw = keeperYaw(this.settings.position);
    this.power = 0;
    this.chargeTime = 0;
    this.accumulator = 0;
    this.ball = launchBall(this.setup(recommendedPower(this.settings.position)));
    this.keeper = createKeeper(this.settings.position.x);
    this.football.position.set(this.ball.position.x, BALL_RADIUS, this.ball.position.z);
    this.football.rotation.set(0, 0.3, 0.1);
    this.ring.position.set(this.ball.position.x, 0.022, this.ball.position.z);
    // 20% of the time one defender leans away and opens a gap; rolled once per kick, not per frame.
    this.wallGap = this.settings.wall > 0 && Math.random() < 0.2 ? Math.floor(Math.random() * this.settings.wall) : -1;
    const wall = this.wall = getWall(this.settings.position, this.settings.wall, this.wallGap);
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
    this.traceUploadedCount = 0;
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
    this.replayFrames.clear();
    this.resultBallTime = Infinity;
    this.lastResult = null;
    this.tracePointCount = 0;
    this.traceUploadedCount = 0;
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
    if (this.paused === paused) return;
    this.paused = paused;
    this.lastTick = 0;
    this.metricsStart = 0;
    this.metricsFrames = 0;
    if (paused) { cancelAnimationFrame(this.raf); this.raf = 0; }
    else if (!this.raf) this.raf = requestAnimationFrame(this.tick);
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
    this.previewDirty = true;
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

  /** Ground position of the taker along a curved approach: about 4.8 m back, bending in to the ball. */
  private takerGround(run: number): { x: number; z: number } {
    const p = this.settings.position;
    const side = this.settings.foot === 'right' ? -1 : 1;
    const t = Math.min(1, Math.max(0, run) / RUNUP_PROGRESS_END);
    const e = t * t * (3 - 2 * t); // eased: the approach accelerates, then settles at the ball
    const length = distanceToGoal(p);
    const back = lerp(4.8, 0.21, e);
    // The lateral offset falls off faster than the distance, which bends the approach into an arc.
    const lateral = side * lerp(1.6, 0.22, Math.pow(e, 0.7));
    return { x: p.x + p.x / length * back + p.z / length * lateral, z: p.z + p.z / length * back - p.x / length * lateral };
  }

  private positionTaker(run: number) {
    const p = this.settings.position;
    const here = this.takerGround(run);
    const before = this.takerGround(Math.max(0, run - 0.02));
    this.taker.group.position.set(here.x, 0, here.z);
    // The body faces the line of travel while running and turns to the ball at the plant.
    const dx = here.x - before.x, dz = here.z - before.z;
    // Model forward is (-sin yaw, -cos yaw), so a heading (x, z) maps to atan2(-x, -z).
    const travel = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(-dx, -dz) : Math.atan2(-(p.x - here.x), -(p.z - here.z));
    const faceBall = Math.atan2(-(p.x - here.x), -(p.z - here.z));
    const turn = Math.min(1, Math.max(0, (run - 0.85) / 0.15));
    this.taker.group.rotation.y = travel + (faceBall - travel) * turn;
  }

  private updatePreview(force = false) {
    this.guide.visible = this.settings.guides && (this.phase === 'ready' || this.phase === 'charging');
    this.ring.visible = true;
    // Keep invalidation pending while hidden; regenerate with current settings when shown.
    if (!this.guide.visible) { this.previewDirty = true; return; }
    const power = this.phase === 'charging' ? this.power : recommendedPower(this.settings.position);
    if (!force && !this.previewDirty && Math.abs(power - this.previewPower) < 0.025) return;
    this.previewDirty = false;
    this.previewPower = power;
    const count = previewShotInto(this.setup(power), this.guidePositions);
    this.guide.geometry.setDrawRange(0, count);
    const attribute = this.guide.geometry.attributes.position as THREE.BufferAttribute;
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, count * 3);
    attribute.needsUpdate = true;
  }

  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly viewSphere = new THREE.Sphere(new THREE.Vector3(), 1.4);
  /** Smart culling: an athlete outside the camera view skips its per-frame pose math. Its pose is recomputed from the clock when it returns, so nothing changes on screen. */
  private inView(object: THREE.Object3D): boolean {
    if (!object.visible) return false;
    this.viewSphere.center.setFromMatrixPosition(object.matrixWorld);
    this.viewSphere.center.y = 1;
    return this.frustum.intersectsSphere(this.viewSphere);
  }

  private tick = (timestamp: number) => {
    this.raf = 0;
    if (this.paused) return;
    this.raf = requestAnimationFrame(this.tick);
    this.viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    // Every frame renders at the display rate, idle included: no throttling, so no catch-up spikes.
    const dt = this.lastTick ? Math.min((timestamp - this.lastTick) / 1000, 0.1) : 1 / 60;
    this.lastTick = timestamp;
    this.time += dt;
    this.phaseTime += dt;
    if (this.previewDirty && this.phase === 'ready') this.updatePreview();
    if (this.phase === 'charging') {
      this.chargeTime += dt;
      this.power = Math.min(1, this.chargeTime / 1.65);
      this.events.power(this.power);
      this.updatePreview();
      if (this.chargeTime >= 2.05) this.release();
    }
    if (this.phase === 'ready' || this.phase === 'charging') {
      if (this.phase === 'charging') this.taker.prepare(this.time, this.power);
      else this.taker.idle(this.time);
      this.keeperModel.keeperPose(this.keeper, this.time);
      this.wallModels.forEach((p, i) => { if (this.inView(p.group)) p.wallPose(0, this.time + i * 0.7); });
    } else if (this.phase === 'runup') {
      const progress = Math.min(1, this.phaseTime / RUNUP_SECONDS);
      this.positionTaker(progress);
      this.taker.run(progress, this.settings.foot);
      this.keeperModel.keeperPose(this.keeper, this.time, Math.max(0, (progress - 0.55) / 0.45));
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
      const jump = wallJump(this.ball.time);
      this.wallModels.forEach(p => { if (this.inView(p.group)) p.wallPose(jump, this.ball.time); });
      this.keeperModel.keeperPose(this.keeper, this.time);
    } else if (this.phase === 'result') {
      if (this.phaseTime < 1.8) {
        this.accumulator += dt;
        while (this.accumulator >= FIXED_DT) {
          this.stepAftermath();
          this.accumulator -= FIXED_DT;
        }
      }
      this.taker.react(this.lastResult!.outcome, this.phaseTime, this.ball.time, this.settings.foot);
      this.wallModels.forEach(p => { if (this.inView(p.group)) p.wallPose(0, this.time); });
      this.keeperModel.keeperRecover(this.keeper, this.time, this.phaseTime, this.lastResult!.outcome);
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
    if (this.traceDirty) this.setTrace();
    this.renderer.info.reset();
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
    const event = advanceShot(this.ball, this.keeper, this.wall, this.settings.difficulty, this.shotScratch);
    this.recordFrame();
    if (!event) return;
    if (event.frameImpact) this.events.woodwork?.();
    const impact = new THREE.Vector3(event.point.x, event.point.y, -1.6);
    if (event.outcome === 'goal') this.stadium.ripple(impact, this.time);
    if (event.outcome === 'goal' || event.frameImpact) this.stadium.celebrate(impact, this.time, event.outcome === 'goal');
    if (event.continues) return;
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
    this.recordFrame();
  }

  private recordFrame() {
    this.frameCounter++;
    if (this.frameCounter % 2 !== 0) return;
    this.replayFrames.record(this.ball, this.keeper);
    if (this.tracePointCount >= 240) this.tracePositions.copyWithin(0, 3);
    else this.tracePointCount++;
    const i = (this.tracePointCount - 1) * 3;
    this.tracePositions[i] = this.ball.position.x;
    this.tracePositions[i + 1] = this.ball.position.y;
    this.tracePositions[i + 2] = this.ball.position.z;
    this.traceDirty = true;
  }

  private setTrace() {
    const count = Math.max(0, this.tracePointCount - 1);
    // Persistent Line2 segment storage: no setPositions allocations during flight.
    const start = count === 239 ? 0 : Math.min(this.traceUploadedCount || 0, count);
    for (let i = start; i < count; i++) {
      const point = i * 3, segment = i * 6;
      for (let j = 0; j < 6; j++) this.traceSegments[segment + j] = this.tracePositions[point + j];
    }
    this.traceGeometry.instanceCount = count;
    if (count > start) {
      this.traceBuffer.clearUpdateRanges();
      this.traceBuffer.addUpdateRange(start * 6, (count - start) * 6);
      this.traceBuffer.needsUpdate = true;
    }
    this.trace.visible = this.tracePointCount > 1 && this.settings.guides && this.phase !== 'replay';
    this.traceUploadedCount = count;
    this.traceDirty = false;
  }

  private resolve(outcome: Outcome, point = this.ball.position) {
    this.resultBallTime = this.ball.time;
    this.lastResult = {
      outcome,
      frameHits: this.ball.frameHits,
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
    if (this.replayFrames.sample(this.replayClock * 60, this.ball, this.keeper)) {
      const elapsed = this.ball.time - this.resultBallTime;
      if (elapsed >= 0 && this.lastResult) {
        this.keeperModel.keeperRecover(this.keeper, this.ball.time, elapsed, this.lastResult.outcome);
        this.taker.react(this.lastResult.outcome, elapsed, this.ball.time, this.settings.foot);
      } else {
        this.keeperModel.keeperPose(this.keeper, this.ball.time);
        this.taker.followThrough(this.ball.time, this.settings.foot);
      }
      const jump = wallJump(this.ball.time);
      this.wallModels.forEach(p => { if (p.group.visible) p.wallPose(jump, this.ball.time); });
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
    if (!this.attract) this.setShift(0);
    const replay = this.phase === 'replay';
    if (this.attract) {
      // Menu background: a slow, drifting broadcast view around the kicker.
      const t = this.time;
      const tx = this.taker.group.position.x, tz = this.taker.group.position.z;
      this.desiredCamera.set(tx + 1.0 + Math.sin(t * 0.11) * 0.2, 1.4, tz + 2.9);
      this.desiredLook.set(tx, 1.05, tz);
      this.setShift(this.width >= this.height ? -this.width * 0.21 : 0);
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
    this.post.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
