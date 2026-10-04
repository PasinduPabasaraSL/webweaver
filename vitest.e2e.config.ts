import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e',
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
