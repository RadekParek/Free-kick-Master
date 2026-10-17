import {
  clamp,
  inPenaltyBox,
  launchBall,
  type ShotSetup,
  type WallPlayer,
} from './physics';
import { createKeeper, resetKeeper, type Difficulty, type KeeperState } from './keeper';
import { advanceShot, createShotScratch } from './simulation';

export const CHANCE_SAMPLES = 64;
/** Repeatable Monte Carlo of THIS game, not calibrated to football outcomes or official xG.
 * Uniform independent execution errors: aim ±0.32 m / ±0.16 m, power ±3%, contact ±0.035.
 * Same wall decisions, difficulty and penalty rules. Different knuckle wakes per trial.
 */
export function estimateConversion(
  setup: ShotSetup,
  wall: WallPlayer[],
  difficulty: Difficulty,
  configuration?: Pick<KeeperState, 'yaw' | 'metrics'>,
): number {
  let seed = ((setup.seed ?? 1701) ^ 0x4f1bbcdc) >>> 0 || 1;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const scratch = createShotScratch(),
    penalty = inPenaltyBox(setup.position);
  // One independent workspace per request, reused only between its sequential trials.
  const trial: ShotSetup = { ...setup, aim: { ...setup.aim }, contact: { ...setup.contact } };
  const keeper = Object.assign(createKeeper(setup.position.x), configuration);
  let ball: ReturnType<typeof launchBall> | undefined;
  let goals = 0;
  for (let i = 0; i < CHANCE_SAMPLES; i++) {
    trial.aim.x = setup.aim.x + (random() - 0.5) * 0.64;
    trial.aim.y = setup.aim.y + (random() - 0.5) * 0.32;
    trial.power = clamp(setup.power + (random() - 0.5) * 0.06, 0.06, 1);
    trial.contact.x = clamp(setup.contact.x + (random() - 0.5) * 0.07, -1, 1);
    trial.contact.y = clamp(setup.contact.y + (random() - 0.5) * 0.07, -1, 1);
    trial.seed = Math.floor(random() * 4294967296);
    ball = launchBall(trial, ball);
    resetKeeper(keeper, setup.position.x);
    for (let tick = 0; tick < 1000; tick++) {
      const event = advanceShot(
        ball,
        keeper,
        wall,
        difficulty,
        scratch,
        penalty,
      );
      if (event && !event.continues) {
        if (event.outcome === 'goal') goals++;
        break;
      }
    }
  }
  return Math.round((goals / CHANCE_SAMPLES) * 100);
}
