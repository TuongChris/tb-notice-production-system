// Anti-enumeration: every login attempt performs a real Argon2id verification, including attempts
// for unknown accounts (no stored hash) and non-credential markers. Spies on the argon2 module itself,
// so a regression such as `if (!usable) return false` fails here even though results stay false.
import { describe, expect, it, vi } from 'vitest';
import { verify } from 'argon2';
import { PasswordHasher } from '../../apps/api/src/modules/auth/password-hasher.js';
import { DISABLED_ACTOR_MARKER } from '../../scripts/db/seed-data.mjs';

vi.mock('argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('argon2')>();
  return { ...actual, verify: vi.fn(actual.verify) };
});

const SYNTHETIC_PASSWORD = 'synthetic-P1-work-password-0001';
const PHC_ARGON2ID_64MIB = /^\$argon2id\$v=19\$m=65536,/;

describe('PasswordHasher verification work', () => {
  it('runs one Argon2id verification with production parameters when there is no usable hash', async () => {
    const hasher = new PasswordHasher();
    await hasher.warmUp();
    const spy = vi.mocked(verify);
    spy.mockClear();
    expect(await hasher.verify(null, SYNTHETIC_PASSWORD)).toBe(false);
    expect(await hasher.verify(DISABLED_ACTOR_MARKER, SYNTHETIC_PASSWORD)).toBe(false);
    expect(await hasher.verify('plaintext-not-a-hash', SYNTHETIC_PASSWORD)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(3);
    for (const [target] of spy.mock.calls) {
      expect(target).toMatch(PHC_ARGON2ID_64MIB);
      expect(target).not.toBe(DISABLED_ACTOR_MARKER);
    }
    // The same dummy hash is used every time (computed once, ahead of the first login).
    expect(new Set(spy.mock.calls.map(([target]) => target)).size).toBe(1);
  });

  it('verifies against the stored hash when it is usable', async () => {
    const hasher = new PasswordHasher();
    const stored = await hasher.hash(SYNTHETIC_PASSWORD);
    const spy = vi.mocked(verify);
    spy.mockClear();
    expect(await hasher.verify(stored, SYNTHETIC_PASSWORD)).toBe(true);
    expect(await hasher.verify(stored, 'synthetic-wrong-password')).toBe(false);
    expect(spy.mock.calls.map(([target]) => target)).toEqual([stored, stored]);
  });
});
