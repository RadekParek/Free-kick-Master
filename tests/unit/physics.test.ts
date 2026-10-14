import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS, FIXED_DT, GOAL_HEIGHT, GOAL_WIDTH, classifyGoalCrossing, cloneBall,
  constrainPosition, crossingAtZ, distanceBounds, distanceToGoal, getWall, hitsWall, integrateBall,
  intersectsFrame, launchBall, previewShot, recommendedPower, shotSpeed, strikeName,
  wallJump, type ShotSetup,
} from '../../src/game/physics';
import { createKeeper, DIFFICULTIES, KEEPER_PROFILES, keeperSaves, updateKeeper, type Difficulty } from '../../src/game/keeper';
import { advanceShot } from '../../src/game/simulation';

const base: ShotSetup = { position: { x: -6, z: 24 }, aim: { x: 1.9, y: 1.9 }, contact: { x: -0.43, y: 0.02 }, foot: 'right', power: 0.628 };
function simulate(setup: ShotSetup, difficulty: Difficulty = 'rookie', count = 0) {
  const ball = launchBall(setup);
  const keeper = createKeeper(setup.position.x);
  const wall = getWall(setup.position, count);
  for (let i = 0; i < 800; i++) {
    const event = advanceShot(ball, keeper, wall, difficulty);
    if (event) return { ...event, ball, keeper };
  }
  throw new Error('Shot did not resolve within the simulation time limit');
}

function landing(setup: ShotSetup) {
  const points = previewShot(setup, 5);
  return points[points.length - 1];
}

describe('aim, contact, and power', () => {
  it('never teleports the ball to the aim target', () => {
    const low = landing({ ...base, power: 0.35 });
    const high = landing({ ...base, power: 0.85 });
    expect(Math.abs(low.y - high.y)).toBeGreaterThan(0.8);
  });
  it('opposite contact points create opposite lateral curve', () => {
    const straight: ShotSetup = { ...base, position: { x: 0, z: 24 }, aim: { x: 0, y: 1.5 }, contact: { x: 0, y: 0 }, power: 0.62 };
    const right = landing({ ...straight, contact: { x: -0.7, y: 0 } });
    const left = landing({ ...straight, contact: { x: 0.7, y: 0 } });
    expect(right.x).toBeGreaterThan(1);
    expect(left.x).toBeLessThan(-1);
    expect(right.x).toBeCloseTo(-left.x, 5);
  });
  it('low contact adds height and high contact drives the ball down', () => {
    const lob = landing({ ...base, contact: { x: 0, y: -0.6 } });
    const driven = landing({ ...base, contact: { x: 0, y: 0.6 } });
    expect(lob.y).toBeGreaterThan(driven.y + 1);
  });
  it('only activates the unsteady knuckle wake on a central, hard strike', () => {
    expect(launchBall({ ...base, contact: { x: 0, y: 0 }, power: 0.8 }).knuckle).toBe(true);
    expect(launchBall({ ...base, contact: { x: 0, y: 0 }, power: 0.5 }).knuckle).toBe(false);
    expect(launchBall({ ...base, contact: { x: 0.4, y: 0 }, power: 0.8 }).knuckle).toBe(false);
  });
  it('launch speed increases monotonically and remains bounded', () => {
    expect(shotSpeed(-1)).toBe(16);
    expect(shotSpeed(2)).toBe(37);
    expect(shotSpeed(0.7)).toBeGreaterThan(shotSpeed(0.5));
  });
  it('uses the same integration for the guide and live shots', () => {
    const predicted = landing(base);
    const live = launchBall(base);
    for (let i = 0; i < 600; i++) {
      const previous = { ...live.position };
      integrateBall(live);
      const crossing = crossingAtZ(previous, live.position, -BALL_RADIUS);
      if (crossing) {
        expect(crossing.x).toBeCloseTo(predicted.x, 7);
        expect(crossing.y).toBeCloseTo(predicted.y, 7);
        return;
      }
    }
    throw new Error('No goal-line crossing');
  });
  it('repeats exactly, including a knuckleball', () => {
    const setup: ShotSetup = { ...base, contact: { x: 0, y: 0 }, power: 0.83 };
    const a = simulate(setup);
    const b = simulate(setup);
    expect(a).toEqual(b);
  });
  it('maps curl naming to the chosen foot without reversing physical contact', () => {
    expect(strikeName({ x: -0.6, y: 0 }, 'right')).toBe('Outside-foot curl');
    expect(strikeName({ x: -0.6, y: 0 }, 'left')).toBe('Inside-foot curl');
    expect(strikeName({ x: 0, y: 0.8 }, 'right')).toBe('Low driven');
  });
});

describe('pitch and physical dimensions', () => {
  it('uses a regulation goal and wall distance', () => {
    expect(GOAL_WIDTH).toBe(7.32);
    expect(GOAL_HEIGHT).toBe(2.44);
    const p = { x: 0, z: 25 };
    const wall = getWall(p, 3);
    expect(Math.hypot(wall[1].x - p.x, wall[1].z - p.z)).toBeCloseTo(10.5, 8);
    expect(getWall(p, 0)).toEqual([]);
    expect(getWall(p, 5)).toHaveLength(5);
  });
  it('keeps direct kicks outside the penalty area and within the training half', () => {
    expect(constrainPosition({ x: 0, z: 3 })).toEqual({ x: 0, z: 11 });
    expect(constrainPosition({ x: 25, z: 3 })).toEqual({ x: 25, z: 10 });
    expect(constrainPosition({ x: 100, z: 100 })).toEqual({ x: 30, z: 46 });
    expect(constrainPosition({ x: NaN, z: Infinity })).toEqual({ x: 0, z: 24 });
  });
  it('measures diagonal distance rather than only distance up the pitch', () => {
    expect(distanceToGoal({ x: 18, z: 24 })).toBe(30);
  });
  it('distance controls cover the legal range without changing the chosen bearing', () => {
    for (const position of [{ x: 0, z: 24 }, { x: -10, z: 24 }, { x: 30, z: 10 }, { x: -30, z: 46 }]) {
      const bounds = distanceBounds(position);
      const length = distanceToGoal(position);
      expect(bounds.min).toBeLessThanOrEqual(length + 1e-8);
      expect(bounds.max).toBeGreaterThanOrEqual(length - 1e-8);
      for (const distance of [bounds.min, (bounds.min + bounds.max) / 2, bounds.max]) {
        const p = { x: position.x / length * distance, z: position.z / length * distance };
        const constrained = constrainPosition(p);
        expect(constrained.x).toBeCloseTo(p.x, 7);
        expect(constrained.z).toBeCloseTo(p.z, 7);
      }
    }
  });
  it('offers a bounded reference power for every training position', () => {
    expect(recommendedPower({ x: 0, z: 18 })).toBeGreaterThan(0.5);
    expect(recommendedPower({ x: 30, z: 46 })).toBeLessThanOrEqual(0.79);
  });
});

describe('swept collisions and goal detection', () => {
  it('detects the crossing between frames, not only the endpoint', () => {
    expect(crossingAtZ({ x: 1, y: 1, z: 0.2 }, { x: 3, y: 2, z: -0.2 }, 0)).toEqual({ x: 2, y: 1.5, z: 0 });
    expect(crossingAtZ({ x: 1, y: 1, z: -0.2 }, { x: 3, y: 2, z: 0.2 }, 0)).toBeNull();
  });
  it('only awards a goal when the whole ball fits between the posts and below the bar', () => {
    expect(classifyGoalCrossing({ x: 3.4, y: 2.2, z: -BALL_RADIUS })).toBe('goal');
    expect(classifyGoalCrossing({ x: 3.6, y: 1, z: -BALL_RADIUS })).toBe('wide');
    expect(classifyGoalCrossing({ x: 0, y: 2.4, z: -BALL_RADIUS })).toBe('over');
  });
  it('detects a fast shot crossing a post or the crossbar', () => {
    expect(intersectsFrame({ x: 3.66, y: 1, z: 1 }, { x: 3.66, y: 1, z: -1 })).toBe('post');
    expect(intersectsFrame({ x: 0, y: 2.44, z: 1 }, { x: 0, y: 2.44, z: -1 })).toBe('bar');
    expect(intersectsFrame({ x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: -1 })).toBeNull();
  });
  it('does not tunnel through a wall at high speed', () => {
    const wall = [{ x: 0, z: 10 }];
    expect(hitsWall({ x: 0, y: 1, z: 12 }, { x: 0, y: 1, z: 8 }, wall, 0)).toBe(true);
    expect(hitsWall({ x: 0, y: 3, z: 12 }, { x: 0, y: 3, z: 8 }, wall, 0)).toBe(false);
    expect(hitsWall({ x: 1, y: 1, z: 12 }, { x: 1, y: 1, z: 8 }, wall, 0)).toBe(false);
  });
  it('allows a low shot under an airborne wall', () => {
    expect(wallJump(0.49)).toBeCloseTo(0.36);
    expect(hitsWall({ x: 0, y: 0.11, z: 12 }, { x: 0, y: 0.11, z: 8 }, [{ x: 0, z: 10 }], 0.49)).toBe(false);
  });
  it('bounces and slows down instead of falling through the grass', () => {
    const ball = launchBall(base);
    ball.position.y = 0.12;
    ball.velocity.y = -10;
    const before = Math.abs(ball.velocity.z);
    integrateBall(ball, FIXED_DT);
    expect(ball.position.y).toBe(BALL_RADIUS);
    expect(ball.velocity.y).toBeGreaterThan(0);
    expect(Math.abs(ball.velocity.z)).toBeLessThan(before);
    expect(ball.bounces).toBe(1);
  });
  it('clones replay states without mutable vector aliases', () => {
    const a = launchBall(base);
    const b = cloneBall(a);
    b.position.x = 100;
    b.velocity.z = 0;
    expect(a.position.x).toBe(-6);
    expect(a.velocity.z).not.toBe(0);
  });
});

describe('a goalkeeper that reacts, not a random success roll', () => {
  it('does not react before the difficulty-specific delay', () => {
    const k = createKeeper(0);
    const b = launchBall(base);
    b.time = 0.1;
    updateKeeper(k, b, 'rookie', FIXED_DT);
    expect(k.reacted).toBe(false);
    expect(k.x).toBe(0.72);
    b.time = 0.5;
    updateKeeper(k, b, 'rookie', FIXED_DT);
    expect(k.reacted).toBe(true);
  });
  it('improves reaction time, speed, reach, and height through all five levels', () => {
    for (let i = 1; i < DIFFICULTIES.length; i++) {
      const previous = KEEPER_PROFILES[DIFFICULTIES[i - 1]];
      const next = KEEPER_PROFILES[DIFFICULTIES[i]];
      expect(next.reaction).toBeLessThan(previous.reaction);
      expect(next.speed).toBeGreaterThan(previous.speed);
      expect(next.reach).toBeGreaterThan(previous.reach);
      expect(next.maxHeight).toBeGreaterThan(previous.maxHeight);
    }
  });
  it('only saves within physical body or glove reach', () => {
    const keeper = createKeeper(0);
    expect(keeperSaves({ x: keeper.x, y: 1, z: 0.7 }, keeper)).toBe(true);
    expect(keeperSaves({ x: -3.3, y: 2.1, z: 0.7 }, keeper)).toBe(false);
  });
  it('produces both scoreable shots and saves with the real simulation', () => {
    const outcomes = new Set<string>();
    for (const x of [-3.2, -2.5, -1, 0, 1, 2.5, 3.2]) {
      for (const y of [0.8, 1.6, 2.1]) {
        outcomes.add(simulate({ ...base, aim: { x, y }, contact: { x: 0, y: 0 }, power: recommendedPower(base.position) }, 'rookie').outcome);
      }
    }
    expect(outcomes.has('goal')).toBe(true);
    expect(outcomes.has('saved')).toBe(true);
  });
  it('makes the same set of shots harder on Legend than Rookie', () => {
    const scores = { rookie: 0, legend: 0 };
    for (const difficulty of ['rookie', 'legend'] as const) {
      for (const x of [-3.2, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.2]) {
        for (const y of [0.7, 1.2, 1.8, 2.15]) {
          const result = simulate({ ...base, aim: { x, y }, contact: { x: 0, y: 0 }, power: recommendedPower(base.position) }, difficulty);
          if (result.outcome === 'goal') scores[difficulty]++;
        }
      }
    }
    expect(scores.rookie).toBeGreaterThan(scores.legend);
  });
  it('resolves every representative angle, contact, and power without NaN or hanging', () => {
    for (const position of [{ x: -30, z: 10 }, { x: 0, z: 17.5 }, { x: 30, z: 46 }, { x: 0, z: 46 }]) {
      for (const power of [0.06, 0.4, 0.7, 1]) {
        for (const contact of [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }]) {
          const result = simulate({ ...base, position, power, contact }, 'pro', 4);
          expect(Number.isFinite(result.point.x)).toBe(true);
          expect(Number.isFinite(result.point.y)).toBe(true);
          expect(result.ball.position.y).toBeGreaterThanOrEqual(BALL_RADIUS);
        }
      }
    }
  });
});
