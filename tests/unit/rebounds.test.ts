import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, GOAL_HEIGHT, GOAL_WIDTH, frameContact, launchBall, reboundFromFrame, type BallState, type Vec3 } from '../../src/game/physics';
import { createKeeper } from '../../src/game/keeper';
import { advanceShot, createShotScratch, type ShotEvent } from '../../src/game/simulation';

function ballAt(position: Vec3, velocity: Vec3): BallState {
  const ball = launchBall({ position: { x: 0, z: 24 }, aim: { x: 0, y: 1 }, contact: { x: 0, y: 0 }, foot: 'right', power: 0.5 });
  Object.assign(ball, { position: { ...position }, velocity: { ...velocity }, sideSpin: 0, topSpin: 0, knuckle: false });
  return ball;
}
function play(ball: BallState) {
  const keeper = createKeeper(0), scratch = createShotScratch();
  const events: ShotEvent[] = [];
  for (let i = 0; i < 1200; i++) {
    const event = advanceShot(ball, keeper, [], 'rookie', scratch);
    if (event) {
      events.push(event);
      if (!event.continues) return { outcome: event.outcome, events, ball };
    }
  }
  throw new Error('Unresolved rebound');
}
const half = GOAL_WIDTH / 2;

describe('round woodwork and live rebounds', () => {
  it.each([-1, 1])('glances off the inside of post %s and scores only after crossing the line', side => {
    const result = play(ballAt({ x: side * (half - 0.15), y: 1, z: 0.4 }, { x: 0, y: 0, z: -25 }));
    expect(result.outcome).toBe('goal');
    expect(result.ball.frameHits).toBe(1);
    expect(result.events.some(e => e.frameImpact)).toBe(true);
    expect(result.events.at(-1)?.point.z).toBe(-BALL_RADIUS);
    expect(result.events.filter(e => !e.continues)).toHaveLength(1);
  });

  it.each([-1, 1])('outside of post %s deflects away rather than being steered into goal', side => {
    const result = play(ballAt({ x: side * (half + 0.15), y: 1, z: 0.4 }, { x: 0, y: 0, z: -25 }));
    expect(result.outcome).toBe('post');
    expect(result.ball.frameHits).toBe(1);
    expect(side * result.ball.velocity.x).toBeGreaterThan(0);
  });

  it('even a soft glancing hit can roll in, with no arbitrary speed threshold', () => {
    const result = play(ballAt({ x: half - 0.15, y: 0.25, z: 0.3 }, { x: 0, y: 0, z: -3 }));
    expect(result.outcome).toBe('goal');
    expect(result.ball.frameHits).toBe(1);
  });

  it('keeps a late, slow rebound live while it can still roll across the line', () => {
    const ball = ballAt({ x: half - 0.15, y: BALL_RADIUS, z: 0.18 }, { x: 0, y: 0, z: -1.2 });
    ball.time = 2.2;
    // Already live after a previous frame hit: the rebound must not inherit the old 1.5 m/s stop rule.
    ball.frameHits = 1;
    const result = play(ball);
    expect(result.outcome).toBe('goal');
  });

  it('can contact both posts while staying on the line, without inventing a goal', () => {
    const result = play(ballAt({ x: half - 0.4, y: 1, z: 0 }, { x: 30, y: 0, z: 0 }));
    expect(result.ball.frameHits).toBeGreaterThanOrEqual(2);
    expect(result.outcome).toBe('post');
    expect(result.ball.position.z).toBe(0);
  });

  it('a square-on post hit bounces out and is not an instant terminal result', () => {
    const result = play(ballAt({ x: half, y: 1, z: 0.4 }, { x: 0, y: 0, z: -30 }));
    expect(result.outcome).toBe('post');
    expect(result.events[0].continues).toBe(true);
    expect(result.ball.velocity.z).toBeGreaterThan(0);
    expect(result.ball.position.z).toBeGreaterThan(2);
  });

  it('the underside of the crossbar can deflect down and in', () => {
    const result = play(ballAt({ x: 0, y: GOAL_HEIGHT - 0.15, z: 0.4 }, { x: 0, y: 0, z: -25 }));
    expect(result.ball.frameHits).toBe(1);
    expect(result.outcome).toBe('goal');
    expect(result.ball.velocity.y).toBeLessThan(0);
  });

  it('bar -> ground -> goal remains live, rather than declaring woodwork at first contact', () => {
    const result = play(ballAt({ x: 0, y: 2, z: 0 }, { x: 0, y: 20, z: -0.03 }));
    expect(result.ball.frameHits).toBeGreaterThanOrEqual(1);
    expect(result.ball.bounces).toBeGreaterThanOrEqual(1);
    expect(result.outcome).toBe('goal');
  });

  it('does not tunnel on a fast shot and can report impact + goal in the same tick', () => {
    const ball = ballAt({ x: half - 0.15, y: 1, z: 0.25 }, { x: 0, y: 0, z: -100 });
    const event = advanceShot(ball, createKeeper(0), [], 'rookie');
    expect(event?.frameImpact).toBeDefined();
    expect(event?.outcome).toBe('goal');
    expect(event?.continues).not.toBe(true);
    expect(ball.frameHits).toBe(1);
  });

  it('uses the actual contact normal and loses, never adds, kinetic energy', () => {
    const a = { x: half - 0.15, y: 1, z: 0.5 }, b = { ...a, z: -0.5 };
    const contact = frameContact(a, b)!;
    expect(Math.hypot(contact.normal.x, contact.normal.y, contact.normal.z)).toBeCloseTo(1, 10);
    const ball = ballAt(a, { x: 0, y: 0, z: -25 });
    const energy = Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z) ** 2;
    reboundFromFrame(ball, contact);
    expect(Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z) ** 2).toBeLessThan(energy);
    const dot = ball.velocity.x * contact.normal.x + ball.velocity.y * contact.normal.y + ball.velocity.z * contact.normal.z;
    expect(dot).toBeGreaterThan(0);
    const separated = { ...ball.position };
    const next = { x: separated.x + ball.velocity.x / 120, y: separated.y + ball.velocity.y / 120, z: separated.z + ball.velocity.z / 120 };
    expect(frameContact(separated, next)).toBeNull();
  });

  it('ignores near misses, has finite-height posts, and detects reverse travel', () => {
    expect(frameContact({ x: half - 0.18, y: 1, z: 0.5 }, { x: half - 0.18, y: 1, z: -0.5 })).toBeNull();
    expect(frameContact({ x: half, y: GOAL_HEIGHT + 0.3, z: 0.5 }, { x: half, y: GOAL_HEIGHT + 0.3, z: -0.5 })).toBeNull();
    expect(frameContact({ x: half, y: 1, z: -0.5 }, { x: half, y: 1, z: 0.5 })?.normal.z).toBeLessThan(0);
  });

  it('handles the top corner deterministically without loops or NaNs', () => {
    const position = { x: half - 0.06, y: GOAL_HEIGHT - 0.06, z: 0.4 };
    const velocity = { x: 2, y: 1, z: -35 };
    const a = play(ballAt(position, velocity)), b = play(ballAt(position, velocity));
    expect(a).toEqual(b);
    expect(Number.isFinite(a.ball.position.x + a.ball.position.y + a.ball.position.z)).toBe(true);
    expect(a.ball.frameHits).toBeGreaterThan(0);
    expect(a.ball.frameHits).toBeLessThan(5);
  });
});
