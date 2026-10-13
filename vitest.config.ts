import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: { include: ['src/game/physics.ts', 'src/game/keeper.ts', 'src/game/simulation.ts', 'src/state.ts'] },
  },
});
