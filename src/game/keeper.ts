import { BALL_RADIUS, SIDE_MAGNUS, clamp, type BallState, type Vec3 } from './physics';

export const DIFFICULTIES = ['rookie', 'amateur', 'pro', 'world-class', 'legend'] as const;
export type Difficulty = typeof DIFFICULTIES[number];
export interface KeeperProfile {
  label: string;
  reaction: number;
  speed: number;
  reach: number;
  maxHeight: number;
  anticipation: number;
  description: string;
}
export const KEEPER_PROFILES: Record<Difficulty, KeeperProfile> = {
  rookie: { label: 'Rookie', reaction: 0.43, speed: 1.65, reach: 0.57, maxHeight: 2.05, anticipation: 0.04, description: 'More time. More room. Find your rhythm.' },
  amateur: { label: 'Amateur', reaction: 0.32, speed: 2.25, reach: 0.7, maxHeight: 2.24, anticipation: 0.2, description: 'A little quicker off the line. Pick your corner.' },
  pro: { label: 'Professional', reaction: 0.24, speed: 2.85, reach: 0.84, maxHeight: 2.48, anticipation: 0.42, description: 'Quick reactions. You’ll need a little precision.' },
  'world-class': { label: 'World class', reaction: 0.17, speed: 3.6, reach: 1, maxHeight: 2.62, anticipation: 0.7, description: 'Reads the curve. Make every inch count.' },
  legend: { label: 'Legend', reaction: 0.11, speed: 4.2, reach: 1.12, maxHeight: 2.76, anticipation: 0.9, description: 'Exceptional reach. Only the very best will do.' },
};
export interface KeeperState {
  x: number;
  targetX: number;
  targetY: number;
  dive: number;
  direction: number;
  glove: Vec3;
  reacted: boolean;
}
export const KEEPER_Z = 0.7;
export function createKeeper(ballX: number): KeeperState {
  const x = ballX <= 0 ? 0.72 : -0.72;
  return { x, targetX: x, targetY: 1.2, dive: 0, direction: 1, glove: { x, y: 1.2, z: KEEPER_Z }, reacted: false };
}
/** Body yaw for the keeper: he turns part of the way toward the shot's angle, so the stance follows the spot. */
export function keeperYaw(spot: { x: number; z: number }): number {
  const full = Math.atan2(spot.x, -(spot.z - KEEPER_Z)); // facing the spot; PI is straight out
  let delta = full - Math.PI;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  return Math.PI + Math.max(-0.6, Math.min(0.6, delta * 0.8));
}
export function cloneKeeper(k: KeeperState): KeeperState { return { ...k, glove: { ...k.glove } }; }

export function updateKeeper(k: KeeperState, ball: BallState, difficulty: Difficulty, dt: number): void {
  const p = KEEPER_PROFILES[difficulty];
  // A knuckle ball adds a little hesitation; the keeper also under-reads the curve on a knuckle.
  const confusion = ball.knuckle ? 0.06 : 0;
  if (ball.time < p.reaction + confusion || ball.velocity.z >= -0.1) return;
  k.reacted = true;
  const remaining = clamp((KEEPER_Z - ball.position.z) / ball.velocity.z, 0, 2.5);
  // Reads current flight after its reaction delay, rather than knowing the future path.
  const predictedX = ball.position.x + ball.velocity.x * remaining + 0.5 * SIDE_MAGNUS * ball.sideSpin * -ball.velocity.z * remaining ** 2 * p.anticipation * (ball.knuckle ? 0.85 : 1);
  const predictedY = ball.position.y + ball.velocity.y * remaining - 4.905 * remaining ** 2;
  k.targetX = clamp(predictedX, -3.45, 3.45);
  k.targetY = clamp(predictedY, 0.3, p.maxHeight);
  if (k.dive === 0) k.direction = k.targetX >= k.x ? 1 : -1;
  const travel = k.targetX - k.x;
  if (remaining < 0.52 && (Math.abs(travel) > 0.45 || k.targetY > 1.8 || k.targetY < 0.7)) {
    k.dive = Math.min(1, k.dive + dt * 2.6);
  }
  const idealBodyX = k.targetX - k.direction * p.reach * k.dive;
  k.x += clamp(idealBodyX - k.x, -p.speed * dt, p.speed * dt);
  k.x = clamp(k.x, -3.5, 3.5);
  k.glove.x = k.x + k.direction * p.reach * Math.sin(k.dive * Math.PI / 2);
  k.glove.y += clamp(k.targetY - k.glove.y, -4.2 * dt, 4.2 * dt);
  k.glove.y = clamp(k.glove.y, 0.25, p.maxHeight - 0.12);
}

export function keeperSaves(point: Vec3, k: KeeperState): boolean {
  const bodyY = k.dive > 0 ? 0.9 + (k.glove.y - 1.1) * 0.35 : 1;
  const bodyWidth = 0.35 + k.dive * 0.14 + BALL_RADIUS;
  const bodyHeight = 0.78 - k.dive * 0.2 + BALL_RADIUS;
  const body = ((point.x - k.x) / bodyWidth) ** 2 + ((point.y - bodyY) / bodyHeight) ** 2 <= 1;
  const hands = Math.hypot(point.x - k.glove.x, point.y - k.glove.y) < 0.27 + BALL_RADIUS;
  // A swept reach between torso and hands; no random difficulty-based save percentage.
  const ax = k.x;
  const ay = bodyY + 0.25;
  const bx = k.glove.x;
  const by = k.glove.y;
  const denom = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = denom > 0 ? clamp(((point.x - ax) * (bx - ax) + (point.y - ay) * (by - ay)) / denom, 0, 1) : 0;
  const arms = Math.hypot(point.x - (ax + t * (bx - ax)), point.y - (ay + t * (by - ay))) < 0.16 + BALL_RADIUS;
  return body || hands || arms;
}
