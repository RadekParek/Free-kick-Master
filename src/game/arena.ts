import * as THREE from 'three';
import {
  AIM_LIMITS, BALL_RADIUS, FIXED_DT, GOAL_HEIGHT, GOAL_WIDTH, clamp, cloneBall,
  distanceToGoal, getWall, integrateBall, launchBall,
  lerp, previewShotInto, recommendedPower, shotSpeed, strikeName, defenderJump, rollWallJump,
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
import { GoalAnalysis } from './goal-analysis';
import { sampleAnalysis, ANALYSIS_DURATION, type AnalysisFrame, type AnalysisStage } from './analysis-timeline';
import { broadcastLens } from './camera';
import { disposeAthleteModelCaches } from './athlete-model';
import { disposeKitCache } from './kits';
import { disposeIdentityCache } from './identity';
import { getPlayer, playStyleFor } from '../players';
import { disposeSceneResources } from './resources';
import { effectivePixelRatio, isMobileDevice, type Settings, type ShotResult } from '../state';

/** Real penalty run-ups take about 1.2 to 1.4 s; the taker reaches the ball at this run progress. */
const RUNUP_SECONDS = 1.65;
const RUNUP_PROGRESS_END = 0.9;
const CAMERA_ROTATION_STEP = Math.PI / 90;
const CAMERA_ROTATION_LIMIT = Math.PI / 9;
const SHADOW_REFRESH_EVERY = 2;

export type Phase = 'ready' | 'charging' | 'runup' | 'flight' | 'result' | 'replay';
export interface ArenaEvents {
  phase: (phase: Phase) => void;
  power: (power: number) => void;
  result: (result: ShotResult) => void;
  aim: (aim: Aim) => void;
  error: (message: string) => void;
  woodwork?: () => void;
  analysis?: (stage: AnalysisStage) => void;
  performance?: (stats: { fps: number; calls: number; triangles: number; pixelRatio: number }) => void;
}

export class Arena {
  readonly renderer: THREE.WebGLRenderer;
  private readonly post: PostStack;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.05, 450);
  phase: Phase = 'ready';
  paused = false;
  power = 0;
  lastResult: ShotResult | null = null;
  private settings: Settings;
  private events: ArenaEvents;
  private stadium: Stadium;
  private readonly studio: THREE.WebGLRenderTarget;
  private readonly takerHere = { x: 0, z: 0 };
  private readonly takerBefore = { x: 0, z: 0 };
  private football: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private taker: Player;
  private keeperModel: Player;
  private wallModels: Player[];
  private ball: BallState;
  private keeper: KeeperState;
  private ring: THREE.Mesh;
  private guide: Line2;
  private readonly guideGeometry = new LineGeometry();
  private readonly guideMaterial = new LineMaterial({ color: 0x2d9cff, linewidth: 2, transparent: true, opacity: .95, depthWrite: false });
  private readonly guideSegments = new Float32Array(511 * 6);
  private readonly guideBuffer = new THREE.InstancedInterleavedBuffer(this.guideSegments, 6).setUsage(THREE.DynamicDrawUsage);
  private analysisPlayed = false;
  private readonly goalAnalysis = new GoalAnalysis();
  private readonly analysisFrame: AnalysisFrame = { stage: 'intro', shotTime: 0, progress: 0 };
  private analysisCameraCut = false;
  private wallGap = -1;
  private shift = 0;
  private cameraYawOffset = 0;
  private shadowFrame = 0;
  private resizeFrame = 0;
  private readonly guidePositions = new Float32Array(512 * 3);
  private previewDirty = false;
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
  private lens = broadcastLens(1, 1);
  private width = 1;
  private height = 1;
  private previewPower = -1;
  private shotSetup: ShotSetup;
  private readonly replayFrames = new ReplayBuffer();
  private resultBallTime = Infinity;
  private readonly shotScratch = createShotScratch();
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
    // Native-relative resolution and post-process AA are user controlled.
    // No canvas or HDR-target MSAA: avoid multisampled buffers and resolves on phones.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = settings.graphics.shadows > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    const studio = this.studio = studioEnvironment(this.renderer);
    for (const object of [this.football, this.taker.group, this.keeperModel.group, ...this.wallModels.map(p => p.group)]) applyStudioLight(object, studio.texture);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.425, 48), new THREE.MeshBasicMaterial({ color: '#d8ffad', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.scene.add(this.ring);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: '#183420', transparent: true, opacity: 0.3, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
    this.guideGeometry.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(this.guideBuffer, 3, 0));
    this.guideGeometry.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(this.guideBuffer, 3, 3));
    this.guideGeometry.instanceCount = 0;
    this.guide = new Line2(this.guideGeometry, this.guideMaterial);
    this.guide.frustumCulled = false;
    this.scene.add(this.guide, this.goalAnalysis.group);
    this.observer = new ResizeObserver(() => this.queueResize());
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
      contact: { ...this.settings.contact }, power, foot: this.settings.foot, attributes: { ...getPlayer(this.settings.playerId).attributes }, playStyle: playStyleFor(getPlayer(this.settings.playerId).baseId),
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
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // A size-only change does not change shader defines. Only toggling shadows does.
      if ((g.shadows > 0) !== (previous.shadows > 0)) {
        const materials = new Set<THREE.Material>();
        this.scene.traverse(object => {
          if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        });
        for (const material of materials) material.needsUpdate = true;
      }
      const size = g.shadows || 512;
      this.stadium.sun.shadow.mapSize.set(size, size);
      this.stadium.sun.shadow.map?.dispose();
      this.stadium.sun.shadow.map = null;
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (g.resolution !== previous.resolution) this.queueResize();
    else if (qualityChanged || g.antialias !== previous.antialias || g.bloom !== previous.bloom) {
      this.post.configure(this.postOptions(), this.width, this.height);
    }
    if (moved || playerChanged || (this.phase === 'result' && gameplayChanged)) this.reset();
    else if (this.phase === 'ready' || this.phase === 'charging') this.previewDirty = true;
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
    return { antialias: g.antialias, bloom: g.bloom, quality: this.settings.quality };
  }

  private queueResize() {
    // ResizeObserver can fire repeatedly during rotation, toolbars, and browser chrome changes.
    // One RAF performs the final renderer/post-stack resize for the whole burst.
    if (this.resizeFrame) return;
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0;
      this.resize();
    });
  }

  private resize() {
    const bounds = this.container.getBoundingClientRect();
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    const pixelRatio = effectivePixelRatio(window.devicePixelRatio || 1, this.settings.graphics.resolution, isMobileDevice());
    if (width !== this.width || height !== this.height || pixelRatio !== this.renderer.getPixelRatio()) {
      // setPixelRatio calls setSize internally. Update size + ratio atomically instead,
      // and avoid resetting the canvas at all for unchanged ResizeObserver notifications.
      this.renderer.setDrawingBufferSize(width, height, pixelRatio);
    }
    this.width = width;
    this.height = height;
    this.guideMaterial.resolution.set(this.width, this.height);
    this.post.configure(this.postOptions(), this.width, this.height);
    this.camera.aspect = this.width / this.height;
    // Recompute optics only on resize, not twice per animation frame.
    this.lens = broadcastLens(this.width, this.height);
    this.camera.fov = this.lens.fov;
    this.camera.updateProjectionMatrix();
  }

  reset() {
    this.cameraYawOffset = 0;
    this.analysisPlayed = false;
    this.goalAnalysis.hide();
    this.stadium.setKickPosition(this.settings.position);
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
    rollWallJump(wall);
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
    // Every attempt leaves the next camera view at the familiar broadcast angle.
    this.cameraYawOffset = 0;
    this.power = clamp(this.power, 0.06, 1);
    this.shotSetup = { ...this.setup(this.power), seed: Math.floor(Math.random() * 0x100000000) };
    this.guide.visible = false;
    this.ring.visible = false;
    this.replayFrames.clear();
    this.resultBallTime = Infinity;
    this.lastResult = null;
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
    this.analysisPlayed = true;
    if (this.lastResult?.outcome === 'goal') {
      sampleAnalysis(0, this.resultBallTime, this.analysisFrame);
      this.analysisCameraCut = true;
      this.goalAnalysis.show(this.replayFrames, this.lastResult, this.resultBallTime, this.shotSetup.position);
      this.events.analysis?.('intro');
    }
    this.setPhase('replay');
    return true;
  }

  /** Exit analysis/replay without resimulating, scoring or changing the recorded outcome. */
  skipReplay(): boolean {
    if (this.phase !== 'replay') return false;
    if (this.savedBall) this.ball = this.savedBall;
    if (this.savedKeeper) this.keeper = this.savedKeeper;
    this.goalAnalysis.hide();
    this.setPhase('result');
    this.phaseTime = 2;
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
    this.cameraYawOffset = 0;
    this.cancelCharge();
    this.lastTick = 0;
    this.pointer = null;
    this.renderer.domElement.style.cursor = on ? 'default' : 'grab';
  }

  adjustAim(dx: number, dy: number) {
    if (this.phase !== 'ready') return;
    this.setAim({ x: this.settings.aim.x + dx, y: this.settings.aim.y + dy });
  }

  /** Orbit the shot camera in small, repeatable steps without altering the aim or physics. */
  rotateCamera(direction: -1 | 1): number {
    if (this.attract || !['ready', 'charging', 'result'].includes(this.phase)) return this.cameraYawOffset;
    this.cameraYawOffset = clamp(this.cameraYawOffset + direction * CAMERA_ROTATION_STEP, -CAMERA_ROTATION_LIMIT, CAMERA_ROTATION_LIMIT);
    return this.cameraYawOffset;
  }

  resetCameraRotation() { this.cameraYawOffset = 0; }

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
      // Full-screen drags now cover a wider horizontal and vertical aiming range.
      this.setAim({ x: this.pointer.aim.x + dx / this.width * 30, y: this.pointer.aim.y - dy / this.height * 13 });
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
  private takerGround(run: number, out: { x: number; z: number }): void {
    const p = this.settings.position;
    const side = this.settings.foot === 'right' ? -1 : 1;
    const t = Math.min(1, Math.max(0, run) / RUNUP_PROGRESS_END);
    const e = t ** 1.35; // accelerate into the plant instead of stopping before the strike
    const length = distanceToGoal(p);
    const back = lerp(4.8, 0.21, e);
    // The lateral offset falls off faster than the distance, which bends the approach into an arc.
    const lateral = side * lerp(1.6, 0.22, Math.pow(e, 0.7));
    out.x = p.x + p.x / length * back + p.z / length * lateral;
    out.z = p.z + p.z / length * back - p.x / length * lateral;
  }

  private positionTaker(run: number) {
    const p = this.settings.position;
    const here = this.takerHere, before = this.takerBefore;
    this.takerGround(run, here);
    this.takerGround(Math.max(0, run - 0.02), before);
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
    const deadBall = playStyleFor(getPlayer(this.settings.playerId).baseId) === 'deadball';
    const sampled = previewShotInto(this.setup(power), this.guidePositions, deadBall ? 6 : 3);
    const count = deadBall ? sampled : Math.max(2, Math.floor(sampled * .8));
    // Screen-space width on Android too; reuse storage instead of LineGeometry.setPositions allocations.
    for (let i = 0; i < count - 1; i++) {
      for (let j = 0; j < 6; j++) this.guideSegments[i * 6 + j] = this.guidePositions[i * 3 + j];
    }
    this.guideGeometry.instanceCount = count - 1;
    this.guideBuffer.clearUpdateRanges();
    this.guideBuffer.addUpdateRange(0, (count - 1) * 6);
    this.guideBuffer.needsUpdate = true;
  }

  private readonly spinAxis = new THREE.Vector3();
  private readonly spinRotation = new THREE.Quaternion();
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
      this.taker.run(progress, this.settings.foot, this.settings.contact);
      const plant = clamp((progress - .88) / .12, 0, 1);
      this.taker.alignStrike(this.settings.foot, this.shotSetup.position, plant * plant * (3 - 2 * plant));
      this.keeperModel.keeperPose(this.keeper, this.time, Math.max(0, (progress - 0.55) / 0.45));
      if (progress >= 1) {
        this.ball = launchBall(this.shotSetup);
        this.replayFrames.record(this.ball, this.keeper); // Include exact contact/launch, not only the first 60Hz sample.
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
      this.taker.followThrough(this.ball.time, this.settings.foot, this.settings.contact);
      this.wallModels.forEach((p, i) => { if (this.inView(p.group)) p.wallPose(defenderJump(this.wall[i], this.ball.time), this.ball.time); });
      this.keeperModel.keeperPose(this.keeper, this.time);
    } else if (this.phase === 'result') {
      if (this.phaseTime < 1.8) {
        this.accumulator += dt;
        while (this.accumulator >= FIXED_DT) {
          this.stepAftermath();
          this.accumulator -= FIXED_DT;
        }
      }
      this.taker.react(this.lastResult!.outcome, this.phaseTime, this.ball.time, this.settings.foot, this.settings.contact);
      this.wallModels.forEach(p => { if (this.inView(p.group)) p.wallPose(0, this.time); });
      this.keeperModel.keeperRecover(this.keeper, this.time, this.phaseTime, this.lastResult!.outcome);
      if (this.phaseTime >= 1.8 && this.lastResult?.outcome === 'goal' && !this.analysisPlayed) this.replay();
    } else if (this.phase === 'replay') this.stepReplay(dt);
    this.football.position.set(this.ball.position.x, this.ball.position.y, this.ball.position.z);
    if (this.phase === 'flight' || this.phase === 'result' || this.phase === 'replay') {
      const v = this.ball.velocity, speed = Math.max(.001, Math.hypot(v.x, v.z));
      const roll = this.ball.knuckle ? 1.3 : this.ball.topSpin;
      this.spinAxis.set(v.z / speed * roll, this.ball.sideSpin, -v.x / speed * roll);
      const angularSpeed = this.spinAxis.length();
      if (angularSpeed > .001) {
        this.spinRotation.setFromAxisAngle(this.spinAxis.multiplyScalar(1 / angularSpeed), angularSpeed * dt);
        this.football.quaternion.premultiply(this.spinRotation);
      }
    }
    this.ballShadow.position.set(this.ball.position.x, 0.022, this.ball.position.z);
    this.ballShadow.scale.setScalar(1 + this.ball.position.y * 0.18);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.05, 0.32 - this.ball.position.y * 0.055);
    this.stadium.update(this.time);
    this.updateCamera(dt);
    // Camera and LODs must be current before the renderer updates scene matrices.
    this.camera.updateMatrixWorld();
    this.taker.updateLod(this.camera); this.keeperModel.updateLod(this.camera);
    for (const player of this.wallModels) player.updateLod(this.camera);
    this.refreshDynamicShadows();
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

  private refreshDynamicShadows() {
    if (!this.renderer.shadowMap.enabled) return;
    // Render remains at the display rate; half-rate shadow maps have no visible impact on pose or physics.
    this.shadowFrame++;
    if (this.shadowFrame % SHADOW_REFRESH_EVERY === 0) this.renderer.shadowMap.needsUpdate = true;
  }

  private stepShot() {
    const event = advanceShot(this.ball, this.keeper, this.wall, this.settings.difficulty, this.shotScratch, inPenaltyBox(this.shotSetup.position));
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
      const half = GOAL_WIDTH / 2 - BALL_RADIUS;
      if (Math.abs(this.ball.position.x) > half) {
        this.ball.position.x = Math.sign(this.ball.position.x) * half;
        this.ball.velocity.x = -Math.sign(this.ball.position.x) * Math.abs(this.ball.velocity.x) * .18;
      }
      if (this.ball.position.y > GOAL_HEIGHT - BALL_RADIUS) {
        this.ball.position.y = GOAL_HEIGHT - BALL_RADIUS;
        this.ball.velocity.y = -Math.abs(this.ball.velocity.y) * .18;
      }
      // The front is open: a scored ball may rebound back out, without recounting the goal.

    }
    this.recordFrame();
  }

  private recordFrame() {
    this.frameCounter++;
    if (this.frameCounter % 2 !== 0) return;
    this.replayFrames.record(this.ball, this.keeper);
  }

  private resolve(outcome: Outcome, point = this.ball.position) {
    this.resultBallTime = this.ball.time;
    this.lastResult = {
      outcome,
      frameHits: this.ball.frameHits,
      distance: distanceToGoal(this.shotSetup.position),
      speed: shotSpeed(this.shotSetup.power, this.shotSetup.attributes, this.shotSetup.playStyle) * 3.6,
      power: this.shotSetup.power,
      point: { x: point.x, y: point.y },
      technique: strikeName(this.shotSetup.contact, this.shotSetup.foot),
    };
    this.setPhase('result');
    this.events.result(this.lastResult);
  }

  private stepReplay(dt: number) {
    const goal = this.lastResult?.outcome === 'goal';
    this.replayClock += dt * (goal ? 1 : .55);
    if (goal) {
      const previous = this.analysisFrame.stage;
      sampleAnalysis(this.replayClock, this.resultBallTime, this.analysisFrame);
      if (previous !== this.analysisFrame.stage) { this.analysisCameraCut = true; this.events.analysis?.(this.analysisFrame.stage); }
      this.goalAnalysis.update(this.replayClock, this.analysisFrame.shotTime);
    }
    const sampleTime = goal ? this.analysisFrame.shotTime : this.replayClock;
    const index = Math.floor(sampleTime * 60);
    if (this.replayFrames.sample(sampleTime * 60, this.ball, this.keeper)) {
      const elapsed = this.ball.time - this.resultBallTime;
      if (elapsed >= 0 && this.lastResult) {
        this.keeperModel.keeperRecover(this.keeper, this.ball.time, elapsed, this.lastResult.outcome);
        this.taker.react(this.lastResult.outcome, elapsed, this.ball.time, this.settings.foot, this.settings.contact);
      } else {
        this.keeperModel.keeperPose(this.keeper, this.ball.time);
        this.taker.followThrough(this.ball.time, this.settings.foot, this.settings.contact);
      }
      this.wallModels.forEach((p, i) => { if (p.group.visible) p.wallPose(defenderJump(this.wall[i], this.ball.time), this.ball.time); });
    }
    if (goal ? this.replayClock >= ANALYSIS_DURATION : index >= this.replayFrames.length + 15) {
      this.skipReplay();
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
      if (this.lastResult?.outcome === 'goal') {
        const { stage, progress } = this.analysisFrame;
        const side = p.x > 0 ? -1 : 1;
        if (stage === 'intro' || stage === 'overview' || stage === 'done') {
          this.desiredCamera.set(p.x + side * (10 + progress * 2), 9 + progress * 2, p.z + 6);
          this.desiredLook.set(p.x * .45, .85, p.z * .45);
        } else if (stage === 'strike') {
          this.desiredCamera.set(p.x + side * (3.5 + progress * .4), 1.3, p.z + 3.6);
          this.desiredLook.set(p.x, .7, p.z - .3);
        } else if (stage === 'flight') {
          this.desiredCamera.set(this.ball.position.x + side * (8 + Math.sin(progress * Math.PI) * 3), 3 + Math.sin(progress * Math.PI) * 3, this.ball.position.z + 8);
          this.desiredLook.set(this.ball.position.x, Math.max(.65, this.ball.position.y), this.ball.position.z - 2);
        } else {
          const entry = this.lastResult.point;
          this.desiredCamera.set(entry.x + side * (3.5 - progress), Math.max(1.5, entry.y + .4), 5 - progress);
          this.desiredLook.set(entry.x, entry.y, 0);
        }
      } else {
        this.desiredCamera.set(p.x + 12.5, 9.2, p.z + 8);
        this.desiredLook.set(p.x * .3, 1, p.z * .3);
      }
    } else {
      const forward = this.phase === 'flight' || this.phase === 'result' ? Math.min(2.3, this.ball.time * 1.8) : 0;
      const portrait = this.width < this.height;
      const length = distanceToGoal(p);
      const back = this.lens.back - forward;
      const lateral = portrait ? (this.settings.foot === 'right' ? -.45 : .45) : (this.settings.foot === 'right' ? -.25 : .25);
      this.desiredCamera.set(p.x + p.x / length * back + p.z / length * lateral, 2.5, p.z + p.z / length * back - p.x / length * lateral);
      // Constant camera pitch and shot-local positioning also frame wide spots/portrait phones.
      this.desiredLook.set(0, 1.2, 0);
      // Barely perceptible handheld drift while the kicker sets up.
      if (this.phase === 'ready' || this.phase === 'charging') {
        this.desiredCamera.x += Math.sin(this.time * 0.61) * 0.028;
        this.desiredCamera.y += Math.sin(this.time * 0.93) * 0.02;
      }
    }
    if (!this.attract && !replay && this.cameraYawOffset !== 0) {
      const pivot = this.taker.group.position;
      const dx = this.desiredCamera.x - pivot.x;
      const dz = this.desiredCamera.z - pivot.z;
      const cosine = Math.cos(this.cameraYawOffset), sine = Math.sin(this.cameraYawOffset);
      this.desiredCamera.x = pivot.x + dx * cosine + dz * sine;
      this.desiredCamera.z = pivot.z - dx * sine + dz * cosine;
    }
    const lens = this.attract ? 35 : this.phase === 'replay' ? 34 : this.lens.fov;
    if (this.camera.fov !== lens) { this.camera.fov = lens; this.camera.updateProjectionMatrix(); }
    const blend = snap || (replay && this.analysisCameraCut) ? 1 : 1 - Math.exp(-dt * 4.5);
    this.analysisCameraCut = false;
    this.camera.position.lerp(this.desiredCamera, blend);
    this.lookAt.lerp(this.desiredLook, blend);
    this.camera.lookAt(this.lookAt);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = 0;
    this.observer.disconnect();
    this.stadium.dispose();
    disposeSceneResources(this.scene, new Set([this.studio.texture]));
    this.studio.dispose();
    disposeAthleteModelCaches(); disposeKitCache(); disposeIdentityCache();
    this.post.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
