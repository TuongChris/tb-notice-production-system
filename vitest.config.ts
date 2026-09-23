import { defineConfig } from 'vitest/config';

// `yarn test`: all non-database automated tests for normal development (no Docker/MySQL needed):
// contracts, tooling and API units (tests/api).
// Database structural and P1 HTTP/CLI integration tests: vitest.db.config.ts (`yarn test:db`).
// Transition-only historical check: vitest.transition.config.ts (`yarn test:transition-baseline`).
export default defineConfig({
  test: {
    include: [
      'tests/contracts/**/*.test.ts',
      'tests/tooling/**/*.test.ts',
      'tests/api/**/*.test.ts',
    ],
    exclude: ['tests/db/**', 'tests/transition/**', '**/node_modules/**'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
