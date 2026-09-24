import { defineConfig } from 'vitest/config';

// Opt-in, transition-only historical check (ADR-0002 §6). Not part of `yarn test` or CI; expected
// to fail after the first approved edit of packages/contracts/src.
export default defineConfig({
  test: {
    include: ['tests/transition/**/*.test.ts'],
    testTimeout: 180_000,
  },
});
