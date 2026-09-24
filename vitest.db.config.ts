import { defineConfig } from 'vitest/config';

// Database structural tests (P0-C7). Run only through `yarn test:db`, which validates that
// TEST_DATABASE_URL targets tb_notice_test before Vitest starts. Serial execution: one connection,
// every test inside a rolled-back transaction.
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
