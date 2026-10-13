/** Original, deterministic set-piece physics. All distances are metres, time is seconds. */
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
}
export interface BallState {
  position: Vec3;
  velocity: Vec3;
  sideSpin: number;
  topSpin: number;
  knuckle: boolean;
  time: number;
  bounces: number;
}
export interface WallPlayer { x: number; z: number }
export type Outcome = 'goal' | 'saved' | 'wall' | 'post' | 'wide' | 'over' | 'short';
export const BALL_RADIUS = 0.11;
export const GOAL_WIDTH = 7.32;
export const GOAL_HEIGHT = 2.44;
export const FIXED_DT = 1 / 120;
export const GRAVITY = 9.81;
const DRAG = 0.16;
const MAGNUS = 0.005;
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const distanceToGoal = (p: Position) => Math.hypot(p.x, p.z);
export const recommendedPower = (p: Position) => clamp(0.48 + distanceToGoal(p) * 0.006, 0.59, 0.79);
export const shotSpeed = (power: number) => 16 + clamp(power, 0, 1) * 21;

export function constrainPosition(p: Position): Position {
  const x = clamp(Number.isFinite(p.x) ? p.x : 0, -30, 30);
  // Direct free kicks are not taken inside the penalty area. Wide positions can be closer.
  const minZ = Math.abs(x) < 20.65 ? 17.5 : 10;
  return { x, z: clamp(Number.isFinite(p.z) ? p.z : 24, minZ, 46) };
}

/** Aiming sets elevation for a reference power, NOT a homing target for the actual shot. */
function referenceElevation(distance: number, height: number, speed: number): number {
  let low = -0.12;
  let high = 0.72;
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
  const dx = clamp(setup.aim.x, -10, 10) - p.x;
  const dz = -p.z;
  const distance = Math.hypot(dx, dz);
  const speed = shotSpeed(setup.power);
  const angle = referenceElevation(distance, clamp(setup.aim.y, 0.15, 5.5), shotSpeed(recommendedPower(p))) - cy * 0.07;
  const horizontal = speed * Math.cos(angle);
  return {
    position: { x: p.x, y: BALL_RADIUS, z: p.z },
    velocity: { x: dx / distance * horizontal, y: speed * Math.sin(angle), z: dz / distance * horizontal },
    sideSpin: -cx * 36,
    topSpin: cy * 22,
    knuckle: Math.hypot(cx, cy) < 0.17 && setup.power > 0.64,
    time: 0,
    bounces: 0,
  };
}

export function cloneBall(ball: BallState): BallState {
  return { ...ball, position: { ...ball.position }, velocity: { ...ball.velocity } };
}

export function integrateBall(ball: BallState, dt = FIXED_DT): void {
  const v = ball.velocity;
  const horizontalSpeed = Math.hypot(v.x, v.z);
  const decay = Math.exp(-ball.time * 0.13);
  let ax = -DRAG * v.x + MAGNUS * ball.sideSpin * -v.z * decay;
  let az = -DRAG * v.z + MAGNUS * ball.sideSpin * v.x * decay;
  let ay = -GRAVITY - DRAG * v.y - MAGNUS * ball.topSpin * horizontalSpeed * decay;
  if (ball.knuckle) {
    // Repeatable unsteady wake, never a random goal/save roll.
    ax += Math.sin(ball.time * 18.4) * 2.3 + Math.sin(ball.time * 31.7) * 1.1;
    ay += Math.sin(ball.time * 22.3) * 1.2;
    az += Math.cos(ball.time * 15.7) * 0.35;
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

export function intersectsFrame(a: Vec3, b: Vec3): 'post' | 'bar' | null {
  const p = crossingAtZ(a, b, 0.07);
  if (!p) return null;
  const radius = BALL_RADIUS + 0.06;
  if (Math.abs(Math.abs(p.x) - GOAL_WIDTH / 2) < radius && p.y <= GOAL_HEIGHT + radius) return 'post';
  if (Math.abs(p.y - GOAL_HEIGHT) < radius && Math.abs(p.x) <= GOAL_WIDTH / 2 + radius) return 'bar';
  return null;
}

export function getWall(position: Position, count: number): WallPlayer[] {
  if (count <= 0) return [];
  const nearPost = position.x <= 0 ? -2 : 2;
  const dx = nearPost - position.x;
  const dz = -position.z;
  const length = Math.hypot(dx, dz);
  const cx = position.x + dx / length * 9.15;
  const cz = position.z + dz / length * 9.15;
  const tangentX = -dz / length;
  const tangentZ = dx / length;
  return Array.from({ length: clamp(Math.round(count), 0, 5) }, (_, i) => {
    const offset = (i - (count - 1) / 2) * 0.56;
    return { x: cx + tangentX * offset, z: cz + tangentZ * offset };
  });
}

export function wallJump(time: number): number {
  const phase = (time - 0.16) / 0.66;
  return phase > 0 && phase < 1 ? Math.sin(phase * Math.PI) * 0.36 : 0;
}

function segmentBox(a: Vec3, b: Vec3, min: Vec3, max: Vec3): boolean {
  let lo = 0;
  let hi = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-8) {
      if (a[axis] < min[axis] || a[axis] > max[axis]) return false;
    } else {
      const t1 = (min[axis] - a[axis]) / delta;
      const t2 = (max[axis] - a[axis]) / delta;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return true;
}

export function hitsWall(a: Vec3, b: Vec3, wall: WallPlayer[], time: number): boolean {
  const jump = wallJump(time);
  return wall.some(p => segmentBox(a, b,
    { x: p.x - 0.26 - BALL_RADIUS, y: jump - BALL_RADIUS, z: p.z - 0.2 - BALL_RADIUS },
    { x: p.x + 0.26 + BALL_RADIUS, y: 1.83 + jump + BALL_RADIUS, z: p.z + 0.2 + BALL_RADIUS },
  ));
}

export function previewShot(setup: ShotSetup, maxTime = 3): Vec3[] {
  const ball = launchBall(setup);
  const points: Vec3[] = [{ ...ball.position }];
  for (let i = 0; i < maxTime / FIXED_DT; i++) {
    const previous = { ...ball.position };
    integrateBall(ball);
    const goal = crossingAtZ(previous, ball.position, -BALL_RADIUS);
    if (goal) { points.push(goal); break; }
    if (i % 5 === 0) points.push({ ...ball.position });
    if (ball.bounces > 1 || ball.position.z < -3) break;
  }
  return points;
}

export function strikeName(contact: Contact, foot: Foot): string {
  if (Math.hypot(contact.x, contact.y) < 0.17) return 'Knuckleball';
  if (contact.y > 0.5 && Math.abs(contact.x) < 0.3) return 'Low driven';
  if (contact.y < -0.55 && Math.abs(contact.x) < 0.3) return 'Dipping lob';
  if (Math.abs(contact.x) < 0.25) return 'Topspin';
  const inside = foot === 'right' ? contact.x < 0 : contact.x > 0;
  return inside ? 'Inside-foot curl' : 'Outside-foot curl';
}
