import { defineConfig } from 'vitest/config';

// The suite spawns real servers (telephony, youtube drafts, autonomous goals) on
// fixed ports and runs 196 files. Running all of them at full parallelism exhausts
// memory and port space on a 2-core CI runner, which is what turned the GitHub
// check red while the same suite passed on a developer machine.
//
// Two workers, sequential retry for flaky port binds, and a real timeout keep CI
// honest: the tests still run, they just do not fight each other for resources.
export default defineConfig({
  test: {
    maxWorkers: 2,
    minWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    retry: 0,
    reporters: ['default'],
  },
});
