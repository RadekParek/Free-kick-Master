/** Original, deterministic set-piece physics. All distances are metres, time is seconds. */
import type { TakerAttributes } from '../players';
export interface Vec3 { x: number; y: number; z: number }
export interface Position { x: number; z: number }
export interface Contact { x: number; y: number }
export interface Aim { x: number; y: number }
export type Foot = 'right' | 'left';
export interface ShotSetup {
  position: Position;
  aim: Aim;
  contact: Contact;
  power: number;
  foot: Foot;
  attributes?: TakerAttributes;
}
export interface BallState {
  position: Vec3;
  velocity: Vec3;
  sideSpin: number;
  topSpin: number;
  knuckle: boolean;
  knuckleStrength: number;
  time: number;
  bounces: number;
  frameHits: number;
}
export interface WallPlayer { x: number; z: number }
export type Outcome = 'goal' | 'saved' | 'wall' | 'post' | 'wide' | 'over' | 'short';
export const BALL_RADIUS = 0.11;
export const POST_RADIUS = 0.06;
export const GOAL_WIDTH = 7.32;
export const GOAL_HEIGHT = 2.44;
export const FIXED_DT = 1 / 120;
export const GRAVITY = 9.81;
/** Aim intentionally reaches well beyond the frame and below ground for low drives and misses. */
export const AIM_LIMITS = { x: 22, yMin: -1.25, yMax: 10.5 } as const;
const DRAG = 0.16;
/** Distance from the kick to the defensive wall. Slightly further back than the 9.15 m law. */
export const WALL_DISTANCE = 10.5;
export const SIDE_MAGNUS = 0.011; // ~16% more curve than the previous tuning.
const TOP_MAGNUS = 0.005;
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const distanceToGoal = (p: Position) => Math.hypot(p.x, p.z);
export const recommendedPower = (p: Position) => clamp(0.48 + distanceToGoal(p) * 0.006, 0.59, 0.79);
export const shotSpeed = (power: number, attributes?: TakerAttributes) =>
  (16 + clamp(power, 0, 1) * 21) * (attributes ? 0.9 + (attributes.power - 80) * 0.012 : 1);

/** Penalty spot, 11 m from the goal line. A kick placed inside the box is moved here, with no wall. */
export const PENALTY_SPOT: Position = { x: 0, z: 11 };
/** Real penalty-area size: 16.5 m deep, 40.32 m wide (half-width 20.16 m). */
export function inPenaltyBox(p: Position): boolean { return Math.abs(p.x) <= 20.16 && p.z <= 16.5; }

export function constrainPosition(p: Position): Position {
  const x = clamp(Number.isFinite(p.x) ? p.x : 0, -30, 30);
  const z = clamp(Number.isFinite(p.z) ? p.z : 24, -5, 46);
  if (inPenaltyBox({ x, z })) return { ...PENALTY_SPOT };
  // Outside the box, the minimum distance keeps free kicks at the edge of the area.
  const minZ = Math.abs(x) < 20.65 - 1e-8 ? 17.5 : 10;
  return { x, z: clamp(z, minZ, 46) };
}

/** Legal radial range along the selected bearing; avoids a misleading distance slider. */
export function distanceBounds(position: Position): { min: number; max: number } {
  const p = constrainPosition(position);
  const length = distanceToGoal(p);
  const ux = Math.abs(p.x) / length;
  const uz = p.z / length;
  const min = Math.max(10 / uz, Math.min(17.5 / uz, ux > 1e-8 ? 20.65 / ux : Infinity));
  const max = Math.min(46 / uz, ux > 1e-8 ? 30 / ux : Infinity);
  return { min, max };
}

/** Aiming sets elevation for a reference power, NOT a homing target for the actual shot. */
function referenceElevation(distance: number, height: number, speed: number): number {
  let low = -0.12;
  let high = 1.18;
  for (let i = 0; i < 22; i++) {
    const angle = (low + high) / 2;
    const vHorizontal = speed * Math.cos(angle);
    const ratio = clamp(1 - DRAG * distance / vHorizontal, 0.001, 1);
    const t = -Math.log(ratio) / DRAG;
    const y = BALL_RADIUS + (speed * Math.sin(angle) + GRAVITY / DRAG) * (1 - ratio) / DRAG - GRAVITY * t / DRAG;
    if (y < height) low = angle;
    else high = angle;
  }
  return (low + high) / 2;
}

export function launchBall(setup: ShotSetup): BallState {
  const p = constrainPosition(setup.position);
  const cx = clamp(setup.contact.x, -1, 1);
  const cy = clamp(setup.contact.y, -1, 1);
  const dx = clamp(setup.aim.x, -AIM_LIMITS.x, AIM_LIMITS.x) - p.x;
  const dz = -p.z;
  const distance = Math.hypot(dx, dz);
  const speed = shotSpeed(setup.power, setup.attributes);
  const controlPenalty = setup.attributes ? Math.max(0, setup.power - recommendedPower(p) - 0.1) ** 2 * (100 - setup.attributes.control) / 100 * 0.65 : 0;
  const angle = referenceElevation(distance, clamp(setup.aim.y, AIM_LIMITS.yMin, AIM_LIMITS.yMax), shotSpeed(recommendedPower(p), setup.attributes)) - cy * 0.07 + controlPenalty;
  const curveScale = setup.attributes ? 0.78 + (setup.attributes.curve - 80) * 0.028 : 1;
  const horizontal = speed * Math.cos(angle);
  return {
    position: { x: p.x, y: BALL_RADIUS, z: p.z },
    velocity: { x: dx / distance * horizontal, y: speed * Math.sin(angle), z: dz / distance * horizontal },
    sideSpin: -cx * 36 * curveScale,
    topSpin: cy * 22,
    knuckle: Math.hypot(cx, cy) < 0.17 && setup.power > 0.64,
    knuckleStrength: (setup.attributes ? 0.6 + (setup.attributes.knuckle - 60) * 0.017 : 1) * (0.75 + clamp((setup.power - 0.64) / 0.36, 0, 1) * 0.25),
    time: 0,
    bounces: 0,
    frameHits: 0,
  };
}

export function cloneBall(ball: BallState): BallState {
  return { ...ball, position: { ...ball.position }, velocity: { ...ball.velocity } };
}

export function integrateBall(ball: BallState, dt = FIXED_DT): void {
  const v = ball.velocity;
  const horizontalSpeed = Math.hypot(v.x, v.z);
  const decay = Math.exp(-ball.time * 0.13);
  let ax = -DRAG * v.x + SIDE_MAGNUS * ball.sideSpin * -v.z * decay;
  let az = -DRAG * v.z + SIDE_MAGNUS * ball.sideSpin * v.x * decay;
  let ay = -GRAVITY - DRAG * v.y - TOP_MAGNUS * ball.topSpin * horizontalSpeed * decay;
  if (v.y < 0) ay *= 1.2; // the ball drops faster after its apex
  if (ball.knuckle) {
    // Low-frequency wake transitions cause visible lateral direction changes.
    // Unlike tiny high-frequency jitter, this produces measurable late movement.
    // Still deterministic; the ball is never steered toward the goal or away from a keeper.
    const t = ball.time;
    const wake = Math.min(1, t / 0.2) * ball.knuckleStrength;
    const sideForce = (Math.cos(t * 8.8) * 19 + Math.sin(t * 15.4) * 6) * wake;
    const speed = Math.max(1, horizontalSpeed);
    ax += -v.z / speed * sideForce;
    az += v.x / speed * sideForce;
    ay += (Math.sin(t * 9.7 + 0.6) * 10.5 - 1.6) * wake;
  }
  v.x += ax * dt;
  v.y += ay * dt;
  v.z += az * dt;
  ball.position.x += v.x * dt;
  ball.position.y += v.y * dt;
  ball.position.z += v.z * dt;
  ball.time += dt;
  if (ball.position.y < BALL_RADIUS) {
    ball.position.y = BALL_RADIUS;
    if (v.y < -0.7) {
      v.y = -v.y * 0.43;
      v.x *= 0.81;
      v.z *= 0.81;
      ball.bounces++;
    } else {
      v.y = 0;
      const friction = Math.max(0, 1 - dt * 1.8);
      v.x *= friction;
      v.z *= friction;
    }
    ball.sideSpin *= 0.985;
    ball.topSpin *= 0.985;
  }
}

export function crossingAtZ(a: Vec3, b: Vec3, z: number): Vec3 | null {
  if (a.z <= z || b.z > z || a.z === b.z) return null;
  const t = (z - a.z) / (b.z - a.z);
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z };
}

export function classifyGoalCrossing(point: Vec3): Outcome {
  if (Math.abs(point.x) > GOAL_WIDTH / 2 - BALL_RADIUS) return 'wide';
  if (point.y > GOAL_HEIGHT - BALL_RADIUS) return 'over';
  return 'goal';
}

export interface FrameContact {
  kind: 'post' | 'bar';
  fraction: number;
  point: Vec3;
  normal: Vec3;
}

/** Swept sphere versus a finite round frame member (cylinder with rounded end joins).
 * Only approaching contacts count: separation after an impact cannot trigger it again.
 */
function sweepFrameMember(a: Vec3, b: Vec3, axis: 'x' | 'y', centre: number, low: number, high: number, kind: FrameContact['kind']): FrameContact | null {
  const radial = axis === 'y' ? 'x' : 'y';
  const u = a[radial] - centre, z = a.z;
  const du = b[radial] - a[radial], dz = b.z - a.z, da = b[axis] - a[axis];
  const radius = BALL_RADIUS + POST_RADIUS;
  let best = Infinity;
  let cap: number | null = null;
  // Analytic cylinder intersection; no time sampling, even for a very fast shot.
  const A = du * du + dz * dz, B = u * du + z * dz, C = u * u + z * z - radius * radius;
  if (A > 1e-12 && B < 0) {
    const discriminant = B * B - A * C;
    if (discriminant >= 0) {
      const t = Math.max(0, (-B - Math.sqrt(discriminant)) / A);
      const height = a[axis] + da * t;
      if (t <= 1 && height >= low && height <= high) best = t;
    }
  }
  // End caps close the top-corner join and avoid infinite posts above the goal.
  for (let end = 0; end < 2; end++) {
    const h = end === 0 ? low : high, w = a[axis] - h;
    const aa = A + da * da, bb = B + w * da, cc = C + w * w;
    const disc = bb * bb - aa * cc;
    if (aa < 1e-12 || bb >= 0 || disc < 0) continue;
    const t = Math.max(0, (-bb - Math.sqrt(disc)) / aa);
    const height = a[axis] + da * t;
    if (t <= 1 && t < best && (end === 0 ? height <= low : height >= high)) { best = t; cap = h; }
  }
  if (!Number.isFinite(best)) return null;
  const point = { x: lerp(a.x, b.x, best), y: lerp(a.y, b.y, best), z: lerp(a.z, b.z, best) };
  const normal: Vec3 = { x: 0, y: 0, z: point.z };
  normal[radial] = point[radial] - centre;
  if (cap !== null) normal[axis] = point[axis] - cap;
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (length < 1e-9) return null;
  normal.x /= length; normal.y /= length; normal.z /= length;
  return { kind, fraction: best, point, normal };
}

export function frameContact(a: Vec3, b: Vec3): FrameContact | null {
  const radius = BALL_RADIUS + POST_RADIUS;
  // Most fixed ticks are metres from the frame. Reject them without any quadratics/objects.
  if (Math.min(a.z, b.z) > radius || Math.max(a.z, b.z) < -radius || Math.min(a.y, b.y) > GOAL_HEIGHT + radius) return null;
  let first: FrameContact | null = null;
  for (const x of [-GOAL_WIDTH / 2, GOAL_WIDTH / 2]) {
    if (Math.min(a.x, b.x) > x + radius || Math.max(a.x, b.x) < x - radius) continue;
    const hit = sweepFrameMember(a, b, 'y', x, 0, GOAL_HEIGHT, 'post');
    if (hit && (!first || hit.fraction < first.fraction)) first = hit;
  }
  if (Math.max(a.y, b.y) >= GOAL_HEIGHT - radius && Math.min(a.y, b.y) <= GOAL_HEIGHT + radius) {
    const bar = sweepFrameMember(a, b, 'x', GOAL_HEIGHT, -GOAL_WIDTH / 2, GOAL_WIDTH / 2, 'bar');
    if (bar && (!first || bar.fraction < first.fraction)) first = bar;
  }
  return first;
}

/** Compatibility helper for callers only interested in which member was struck. */
export function intersectsFrame(a: Vec3, b: Vec3): 'post' | 'bar' | null {
  return frameContact(a, b)?.kind ?? null;
}

/** Lossy normal impulse against painted metal. Glancing hits keep most tangential speed;
 * direct hits bounce out. There is no random 'post and in' roll or goal-directed velocity.
 */
export function reboundFromFrame(ball: BallState, contact: FrameContact): void {
  const n = contact.normal, v = ball.velocity;
  const normalSpeed = v.x * n.x + v.y * n.y + v.z * n.z;
  if (normalSpeed >= 0) return;
  const restitution = 0.68, tangentRetention = 0.97;
  const impulse = (tangentRetention + restitution) * normalSpeed;
  v.x = tangentRetention * v.x - impulse * n.x;
  v.y = tangentRetention * v.y - impulse * n.y;
  v.z = tangentRetention * v.z - impulse * n.z;
  ball.sideSpin *= 0.8;
  ball.topSpin *= 0.8;
  ball.knuckle = false;
  ball.frameHits++;
  // Separate by 0.1 mm, not a frame-sized teleport. The remaining tick is swept again.
  ball.position.x = contact.point.x + n.x * 0.0001;
  ball.position.y = Math.max(BALL_RADIUS, contact.point.y + n.y * 0.0001);
  ball.position.z = contact.point.z + n.z * 0.0001;
}

export function getWall(position: Position, count: number, gapIndex = -1): WallPlayer[] {
  if (count <= 0) return [];
  const nearPost = position.x <= 0 ? -2 : 2;
  const dx = nearPost - position.x;
  const dz = -position.z;
  const length = Math.hypot(dx, dz);
  const cx = position.x + dx / length * WALL_DISTANCE;
  const cz = position.z + dz / length * WALL_DISTANCE;
  const tangentX = -dz / length;
  const tangentZ = dx / length;
  return Array.from({ length: clamp(Math.round(count), 0, 5) }, (_, i) => {
    // A defender who leans away opens a gap of about 0.25 m beside him.
    const gap = i === gapIndex ? (i < (count - 1) / 2 ? -0.25 : 0.25) : 0;
    const offset = (i - (count - 1) / 2) * 0.56 + gap;
    return { x: cx + tangentX * offset, z: cz + tangentZ * offset };
  });
}

export function wallJump(time: number): number {
  const phase = (time - 0.16) / 0.66;
  return phase > 0 && phase < 1 ? Math.sin(phase * Math.PI) * 0.36 : 0;
}

const AXES = ['x', 'y', 'z'] as const;
function segmentWall(a: Vec3, b: Vec3, p: WallPlayer, jump: number): boolean {
  let lo = 0;
  let hi = 1;
  for (const axis of AXES) {
    const min = axis === 'x' ? p.x - 0.26 - BALL_RADIUS : axis === 'y' ? jump - BALL_RADIUS : p.z - 0.2 - BALL_RADIUS;
    const max = axis === 'x' ? p.x + 0.26 + BALL_RADIUS : axis === 'y' ? 1.83 + jump + BALL_RADIUS : p.z + 0.2 + BALL_RADIUS;
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-8) {
      if (a[axis] < min || a[axis] > max) return false;
    } else {
      const t1 = (min - a[axis]) / delta;
      const t2 = (max - a[axis]) / delta;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return true;
}

export function hitsWall(a: Vec3, b: Vec3, wall: WallPlayer[], time: number): boolean {
  if (!wall.length) return false;
  const jump = wallJump(time);
  for (const p of wall) {
    if (Math.min(a.z, b.z) > p.z + 0.2 + BALL_RADIUS || Math.max(a.z, b.z) < p.z - 0.2 - BALL_RADIUS) continue;
    if (segmentWall(a, b, p, jump)) return true;
  }
  return false;
}

/** Shared sampling loop for the public object preview and the renderer's persistent buffer. */
function samplePreview(setup: ShotSetup, maxTime: number, output: Vec3[] | Float32Array): number {
  const ball = launchBall(setup);
  const previous: Vec3 = { x: 0, y: 0, z: 0 };
  let count = 0;
  const limit = output instanceof Float32Array ? Math.floor(output.length / 3) : Infinity;
  if (!limit) return 0;
  writePreviewPoint(output, count++, ball.position);
  for (let i = 0; i < maxTime / FIXED_DT && count < limit; i++) {
    previous.x = ball.position.x; previous.y = ball.position.y; previous.z = ball.position.z;
    integrateBall(ball);
    const goal = crossingAtZ(previous, ball.position, -BALL_RADIUS);
    if (goal) { writePreviewPoint(output, count++, goal); break; }
    if (i % 5 === 0) writePreviewPoint(output, count++, ball.position);
    if (ball.bounces > 1 || ball.position.z < -3) break;
  }
  return count;
}
function writePreviewPoint(output: Vec3[] | Float32Array, index: number, point: Vec3) {
  if (output instanceof Float32Array) {
    const offset = index * 3;
    output[offset] = point.x; output[offset + 1] = point.y; output[offset + 2] = point.z;
  } else output.push({ ...point });
}
export function previewShot(setup: ShotSetup, maxTime = 3): Vec3[] {
  const points: Vec3[] = [];
  samplePreview(setup, maxTime, points);
  return points;
}
export function previewShotInto(setup: ShotSetup, output: Float32Array, maxTime = 3): number {
  return samplePreview(setup, maxTime, output);
}

export function strikeName(contact: Contact, foot: Foot): string {
  if (Math.hypot(contact.x, contact.y) < 0.17) return 'Knuckleball';
  if (contact.y > 0.5 && Math.abs(contact.x) < 0.3) return 'Low driven';
  if (contact.y < -0.55 && Math.abs(contact.x) < 0.3) return 'Backspin lob';
  if (Math.abs(contact.x) < 0.25) return 'Topspin';
  const inside = foot === 'right' ? contact.x < 0 : contact.x > 0;
  return inside ? 'Outside-foot curl' : 'Inside-foot curl';
}
