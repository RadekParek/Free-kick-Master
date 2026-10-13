import {
  BALL_RADIUS, FIXED_DT, classifyGoalCrossing, crossingAtZ, hitsWall,
  integrateBall, intersectsFrame, type BallState, type Outcome, type Vec3, type WallPlayer,
} from './physics';
import { KEEPER_Z, keeperSaves, updateKeeper, type Difficulty, type KeeperState } from './keeper';

export interface ShotEvent { outcome: Outcome; point: Vec3 }

/** The exact same fixed-step rules run in the renderer and in the headless tests. */
export function advanceShot(ball: BallState, keeper: KeeperState, wall: WallPlayer[], difficulty: Difficulty): ShotEvent | null {
  const previous = { ...ball.position };
  integrateBall(ball);
  updateKeeper(keeper, ball, difficulty, FIXED_DT);
  if (hitsWall(previous, ball.position, wall, ball.time)) {
    ball.velocity.z = Math.abs(ball.velocity.z) * 0.24;
    ball.velocity.x *= 0.35;
    ball.velocity.y = 1.2;
    return { outcome: 'wall', point: { ...ball.position } };
  }
  const atKeeper = crossingAtZ(previous, ball.position, KEEPER_Z);
  if (atKeeper && keeperSaves(atKeeper, keeper)) {
    ball.velocity.z = Math.abs(ball.velocity.z) * 0.22;
    ball.velocity.x = keeper.direction * 2.4;
    ball.velocity.y = 1.3;
    return { outcome: 'saved', point: atKeeper };
  }
  const frame = intersectsFrame(previous, ball.position);
  if (frame) {
    ball.velocity.z = Math.abs(ball.velocity.z) * 0.58;
    ball.velocity.x *= frame === 'post' ? -0.4 : 0.7;
    ball.velocity.y *= frame === 'bar' ? -0.5 : 0.7;
    return { outcome: 'post', point: { ...ball.position } };
  }
  const atGoal = crossingAtZ(previous, ball.position, -BALL_RADIUS);
  if (atGoal) {
    const outcome = classifyGoalCrossing(atGoal);
    if (outcome === 'goal') {
      ball.velocity.x *= 0.25;
      ball.velocity.y *= 0.3;
      ball.velocity.z *= 0.32;
    }
    return { outcome, point: atGoal };
  }
  if (ball.time > 5 || (ball.time > 2 && Math.hypot(ball.velocity.x, ball.velocity.z) < 1.5)) {
    return { outcome: 'short', point: { ...ball.position } };
  }
  return null;
}
