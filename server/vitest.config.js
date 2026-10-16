import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup/env.js'],
    // Run test files one at a time: each file uses its own MongoDB database, and running them
    // sequentially keeps timings stable on busy machines.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
