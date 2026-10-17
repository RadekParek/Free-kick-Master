import { estimateConversion } from './chance';
import type { ShotSetup, WallPlayer } from './physics';
import type { Difficulty, KeeperState } from './keeper';
self.onmessage = (
  event: MessageEvent<{
    job: number;
    setup: ShotSetup;
    wall: WallPlayer[];
    difficulty: Difficulty;
    keeper?: Pick<KeeperState, 'yaw' | 'metrics'>;
  }>,
) => {
  const { job, setup, wall, difficulty, keeper } = event.data;
  self.postMessage({
    job,
    percent: estimateConversion(setup, wall, difficulty, keeper),
  });
};
