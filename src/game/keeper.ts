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
  /** Lateral metres/second for footwork animation; captured in replays. */
  velocityX: number;
  dive: number;
  direction: number;
  glove: Vec3;
  reacted: boolean;
}
export const KEEPER_Z = 0.7;
export function createKeeper(ballX: number): KeeperState {
  const x = ballX <= 0 ? 0.72 : -0.72;
  return { x, targetX: x, targetY: 1.2, velocityX: 0, dive: 0, direction: 1, glove: { x, y: 1.2, z: KEEPER_Z }, reacted: false };
}
/** Body yaw for the keeper: he turns part of the way toward the shot's angle, so the stance follows the spot. */
export function keeperYaw(spot: { x: number; z: number }): number {
  // Yaw that faces the spot from the keeper: the model's forward is (-sin yaw, -cos yaw).
  const full = Math.atan2(-spot.x, -(spot.z - KEEPER_Z));
  let delta = full - Math.PI;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  return Math.PI + Math.max(-0.6, Math.min(0.6, delta * 0.8));
}
export function cloneKeeper(k: KeeperState): KeeperState { return { ...k, glove: { ...k.glove } }; }

export function updateKeeper(k: KeeperState, ball: BallState, difficulty: Difficulty, dt: number, penalty = false): void {
  const p = KEEPER_PROFILES[difficulty];
  // Penalties are a deliberately tougher mode: an earlier read, a more accurate curve
  // estimate, quicker feet, and a longer set of visible glove/body reaches.
  const reaction = penalty ? Math.min(p.reaction * 0.22, 0.075) : p.reaction;
  const speed = p.speed * (penalty ? 2 : 1);
  const reach = p.reach * (penalty ? 1.5 : 1);
  const maxHeight = p.maxHeight + (penalty ? 0.4 : 0);
  const anticipation = penalty ? 1 : p.anticipation;
  // A knuckle ball adds hesitation; the penalty keeper is less fooled, but still has to read it.
  const confusion = ball.knuckle ? (penalty ? 0.025 : 0.06) : 0;
  if (ball.time < reaction + confusion || ball.velocity.z >= -0.1) { k.velocityX = 0; return; }
  k.reacted = true;
  const remaining = clamp((KEEPER_Z - ball.position.z) / ball.velocity.z, 0, 2.5);
  // Reads the projected goal-line crossing; penalty anticipation accounts for the full curve.
  const predictedX = ball.position.x + ball.velocity.x * remaining + 0.5 * SIDE_MAGNUS * ball.sideSpin * -ball.velocity.z * remaining ** 2 * anticipation * (ball.knuckle ? 0.85 : 1);
  const predictedY = ball.position.y + ball.velocity.y * remaining - 4.905 * remaining ** 2;
  k.targetX = clamp(predictedX, -3.45, 3.45);
  k.targetY = clamp(predictedY, 0.3, maxHeight);
  if (k.dive === 0) k.direction = k.targetX >= k.x ? 1 : -1;
  const travel = k.targetX - k.x;
  const diveWindow = penalty ? 0.72 : 0.52;
  const diveThreshold = penalty ? 0.24 : 0.45;
  const diveRate = penalty ? 4.2 : 2.6;
  if (remaining < diveWindow && (Math.abs(travel) > diveThreshold || k.targetY > 1.8 || k.targetY < 0.7)) {
    k.dive = Math.min(1, k.dive + dt * diveRate);
  }
  const previousX = k.x;
  const idealBodyX = k.targetX - k.direction * reach * k.dive;
  k.x += clamp(idealBodyX - k.x, -speed * dt, speed * dt);
  k.x = clamp(k.x, -3.5, 3.5);
  k.velocityX = dt > 0 ? (k.x - previousX) / dt : 0;
  k.glove.x = k.x + k.direction * reach * Math.sin(k.dive * Math.PI / 2);
  k.glove.y += clamp(k.targetY - k.glove.y, -4.2 * dt * (penalty ? 1.5 : 1), 4.2 * dt * (penalty ? 1.5 : 1));
  k.glove.y = clamp(k.glove.y, 0.25, maxHeight - 0.12);
}

export function keeperSaves(point: Vec3, k: KeeperState, penalty = false): boolean {
  const bodyY = k.dive > 0 ? 0.9 + (k.glove.y - 1.1) * 0.35 : 1;
  const penaltyReach = penalty ? 0.12 : 0;
  const bodyWidth = 0.35 + k.dive * 0.14 + BALL_RADIUS + penaltyReach;
  const bodyHeight = 0.78 - k.dive * 0.2 + BALL_RADIUS + penaltyReach;
  const body = ((point.x - k.x) / bodyWidth) ** 2 + ((point.y - bodyY) / bodyHeight) ** 2 <= 1;
  if (body) return true;
  const handRadius = 0.27 + BALL_RADIUS + (penalty ? 0.08 : 0);
  if ((point.x - k.glove.x) ** 2 + (point.y - k.glove.y) ** 2 < handRadius ** 2) return true;
  // A swept reach between torso and hands; no random difficulty-based save percentage.
  const ax = k.x;
  const ay = bodyY + 0.25;
  const bx = k.glove.x;
  const by = k.glove.y;
  const denom = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = denom > 0 ? clamp(((point.x - ax) * (bx - ax) + (point.y - ay) * (by - ay)) / denom, 0, 1) : 0;
  const armRadius = 0.16 + BALL_RADIUS + (penalty ? 0.06 : 0);
  return (point.x - (ax + t * (bx - ax))) ** 2 + (point.y - (ay + t * (by - ay))) ** 2 < armRadius ** 2;
}
