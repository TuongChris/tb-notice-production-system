import { defineConfig } from 'vitest/config';

// Contract transition tests (P0-D): parity against the frozen TB-SCHEMA-API-v1.0.0 reference,
// determinism, drift detection and reference integrity. No database or network access.
export default defineConfig({
  test: {
    include: ['tests/contracts/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
