import {
  BALL_RADIUS, FIXED_DT, classifyGoalCrossing, crossingAtZ, hitsWall,
  frameContact, integrateBall, reboundFromFrame, type BallState, type Outcome, type Vec3, type WallPlayer,
} from './physics';
import { KEEPER_Z, keeperSaves, updateKeeper, type Difficulty, type KeeperState } from './keeper';

/** Frame contact is feedback, not a terminal result. A goal can follow in the SAME tick. */
export interface ShotEvent { outcome: Outcome; point: Vec3; continues?: boolean; frameImpact?: Vec3 }
export interface ShotScratch { previous: Vec3; end: Vec3 }
export const createShotScratch = (): ShotScratch => ({ previous: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 0 } });

/** The exact same fixed-step rules run in the renderer and in headless tests.
 * Semi-implicit forces run once at 120 Hz; swept contacts consume the remaining linear motion.
 */
export function advanceShot(ball: BallState, keeper: KeeperState, wall: WallPlayer[], difficulty: Difficulty, scratch = createShotScratch(), penalty = false): ShotEvent | null {
  const previous = scratch.previous, end = scratch.end;
  previous.x = ball.position.x; previous.y = ball.position.y; previous.z = ball.position.z;
  integrateBall(ball);
  updateKeeper(keeper, ball, difficulty, FIXED_DT, penalty);
  let remaining = FIXED_DT;
  let frameImpact: Vec3 | undefined;
  // A corner can contact both members in one tick. Bound the solver, not the rebound velocity.
  for (let contactCount = 0; contactCount < 4; contactCount++) {
    end.x = ball.position.x; end.y = ball.position.y; end.z = ball.position.z;
    if (hitsWall(previous, end, wall, ball.time)) {
      ball.velocity.z = Math.abs(ball.velocity.z) * 0.24;
      ball.velocity.x *= 0.35;
      ball.velocity.y = 1.2;
      return { outcome: 'wall', point: { ...end }, frameImpact };
    }
    const atKeeper = crossingAtZ(previous, end, KEEPER_Z) ?? (ball.frameHits ? crossingAtZ(end, previous, KEEPER_Z) : null);
    if (atKeeper && keeperSaves(atKeeper, keeper, penalty)) {
      ball.velocity.z = Math.abs(ball.velocity.z) * 0.22;
      ball.velocity.x = keeper.direction * 2.4;
      ball.velocity.y = 1.3;
      return { outcome: 'saved', point: atKeeper, frameImpact };
    }
    const frame = frameContact(previous, end);
    const atGoal = crossingAtZ(previous, end, -BALL_RADIUS);
    const goalFraction = atGoal ? (-BALL_RADIUS - previous.z) / (end.z - previous.z) : Infinity;
    if (atGoal && (!frame || goalFraction < frame.fraction)) {
      let outcome = classifyGoalCrossing(atGoal);
      if (outcome === 'goal') {
        ball.velocity.x *= 0.25;
        ball.velocity.y *= 0.3;
        ball.velocity.z *= 0.32;
      } else if (ball.frameHits) outcome = 'post';
      return { outcome, point: atGoal, frameImpact };
    }
    if (!frame) break;
    frameImpact = frame.point;
    reboundFromFrame(ball, frame);
    remaining *= 1 - frame.fraction;
    previous.x = ball.position.x; previous.y = ball.position.y; previous.z = ball.position.z;
    if (contactCount === 3) break; // Leave at a separated contact rather than tunnel through a join.
    ball.position.x += ball.velocity.x * remaining;
    ball.position.y = Math.max(BALL_RADIUS, ball.position.y + ball.velocity.y * remaining);
    ball.position.z += ball.velocity.z * remaining;
  }
  // Rebounds stay live near the line (including bar -> ground -> goal). Only resolve an
  // outward rebound once it is clearly back on the pitch, or when the ball settles/times out.
  const horizontalSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
  const settled = ball.frameHits
    ? horizontalSpeed < 0.12 && Math.abs(ball.velocity.y) < 0.15 && ball.position.y <= BALL_RADIUS + 0.001
    : horizontalSpeed < 1.5;
  if ((ball.frameHits > 0 && ball.position.z > 2 && ball.velocity.z > 0) ||
      ball.time > (ball.frameHits ? 8 : 5) || (ball.time > 2 && settled)) {
    return { outcome: ball.frameHits ? 'post' : 'short', point: { ...ball.position }, frameImpact };
  }
  return frameImpact ? { outcome: 'post', point: frameImpact, frameImpact, continues: true } : null;
}
