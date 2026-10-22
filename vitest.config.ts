import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Keep test output readable: the logger is silenced via LOG_LEVEL.
    env: { LOG_LEVEL: 'silent', NODE_ENV: 'test' },
  },
});
