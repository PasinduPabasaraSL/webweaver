import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'workflow-schema',
          environment: 'node',
          include: ['packages/workflow-schema/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'core',
          environment: 'node',
          include: ['packages/core/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'examples',
          environment: 'node',
          include: ['tests/*.test.ts'],
        },
      },
      {
        test: {
          name: 'extension',
          environment: 'jsdom',
          include: ['apps/extension/test/**/*.test.ts'],
        },
      },
    ],
  },
});
