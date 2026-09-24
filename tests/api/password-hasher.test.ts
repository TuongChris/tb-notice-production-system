// PASSWORD: Argon2id hashing and verification (synthetic passwords only).
import { describe, expect, it } from 'vitest';
import {
  ARGON2ID_PARAMETERS,
  isVerifiableStoredHash,
  PasswordHasher,
} from '../../apps/api/src/modules/auth/password-hasher.js';
import { DISABLED_ACTOR_MARKER } from '../../scripts/db/seed-data.mjs';

const SYNTHETIC_PASSWORD = 'synthetic-P1-unit-password-0001';
const hasher = new PasswordHasher();

describe('Argon2id password hasher', () => {
  it('produces an Argon2id v1.3 PHC string with the RFC 9106 second recommended parameters', async () => {
    const stored = await hasher.hash(SYNTHETIC_PASSWORD);
    expect(stored).toMatch(/^\$argon2id\$v=19\$/);
    for (const parameter of ['m=65536', 't=3', 'p=4']) expect(stored).toContain(parameter);
    expect(ARGON2ID_PARAMETERS).toMatchObject({
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 4,
      hashLength: 32,
    });
    // 128-bit salt and 256-bit tag, both unpadded base64.
    const [, , , , salt, tag] = stored.split('$');
    expect(Buffer.from(salt ?? '', 'base64')).toHaveLength(16);
    expect(Buffer.from(tag ?? '', 'base64')).toHaveLength(32);
  });

  it('verifies the correct password and rejects a wrong one', async () => {
    const stored = await hasher.hash(SYNTHETIC_PASSWORD);
    expect(await hasher.verify(stored, SYNTHETIC_PASSWORD)).toBe(true);
    expect(await hasher.verify(stored, `${SYNTHETIC_PASSWORD}x`)).toBe(false);
    expect(await hasher.verify(stored, '')).toBe(false);
  });

  it('never stores the plaintext and salts every hash', async () => {
    const first = await hasher.hash(SYNTHETIC_PASSWORD);
    const second = await hasher.hash(SYNTHETIC_PASSWORD);
    expect(first).not.toContain(SYNTHETIC_PASSWORD);
    expect(first).not.toContain(
      Buffer.from(SYNTHETIC_PASSWORD).toString('base64').replace(/=+$/, ''),
    );
    expect(first).not.toBe(second);
  });

  it('verifies NFKC-equivalent input identically (composed vs decomposed diacritics)', async () => {
    const composed = 'Mật khẩu tổng hợp số một'.normalize('NFC');
    const decomposed = composed.normalize('NFD');
    expect(composed).not.toBe(decomposed);
    const stored = await hasher.hash(composed);
    expect(await hasher.verify(stored, decomposed)).toBe(true);
  });

  it('never verifies the P0 disabled-actor marker, malformed or out-of-bounds hashes', async () => {
    const hostile = [
      DISABLED_ACTOR_MARKER,
      '',
      'plaintext-password',
      '$argon2i$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g',
      '$argon2id$v=16$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g',
      '$argon2id$v=19$m=4194304,t=3,p=4$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g',
      '$argon2id$v=19$m=65536,t=99,p=4$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g',
    ];
    for (const stored of hostile) {
      expect(isVerifiableStoredHash(stored), stored).toBe(false);
      expect(await hasher.verify(stored, SYNTHETIC_PASSWORD)).toBe(false);
    }
    expect(await hasher.verify(null, SYNTHETIC_PASSWORD)).toBe(false);
    expect(isVerifiableStoredHash(await hasher.hash(SYNTHETIC_PASSWORD))).toBe(true);
  });

  it('rejects input with an unpaired surrogate', async () => {
    const stored = await hasher.hash(SYNTHETIC_PASSWORD);
    expect(await hasher.verify(stored, `${SYNTHETIC_PASSWORD}\ud800`)).toBe(false);
  });
});
