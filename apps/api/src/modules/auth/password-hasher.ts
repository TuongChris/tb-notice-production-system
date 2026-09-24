// Argon2id password hashing (API_CONTRACT_v1 §3, TECHNOLOGY_ARCHITECTURE §11) using the exact-pinned
// `argon2` package (node-argon2: the reference phc-winner-argon2 C implementation, shipped N-API
// prebuilds; no install script is needed, which matters because Yarn build scripts are disabled).
//
// Stored format: PHC string `$argon2id$v=19$m=…,t=…,p=…$salt$hash` in users.password_hash.
// Plain class (no Nest decorators) so the local admin CLI uses exactly the same parameters.
import { randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';
import { normalizePassword } from './credentials.js';

/**
 * RFC 9106 §4 "second recommended option": Argon2id, t=3 passes, p=4 lanes, m=64 MiB, with a
 * 128-bit random salt (library default) and a 256-bit tag.
 */
export const ARGON2ID_PARAMETERS = Object.freeze({
  type: argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
});

const PHC_ARGON2ID =
  /^\$argon2id\$v=19\$([a-z]=\d+(?:,[a-z]=\d+)*)\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;
/** Upper bounds for parameters read back from storage, so a corrupted row cannot exhaust memory. */
const STORED_LIMITS = Object.freeze({ m: 262_144, t: 10, p: 16 });

/**
 * True only for an Argon2id v1.3 PHC string whose parameters are within safe bounds. Anything else
 * (for example the P0 disabled-actor marker) can never verify.
 */
export function isVerifiableStoredHash(stored: string): boolean {
  const match = PHC_ARGON2ID.exec(stored);
  if (!match?.[1]) return false;
  const parameters = new Map(
    match[1].split(',').map((pair) => {
      const [name = '', value = ''] = pair.split('=');
      return [name, Number(value)] as const;
    }),
  );
  if (parameters.size !== 3) return false;
  const m = parameters.get('m');
  const t = parameters.get('t');
  const p = parameters.get('p');
  return (
    m !== undefined &&
    t !== undefined &&
    p !== undefined &&
    m >= 8 * (p || 1) &&
    m <= STORED_LIMITS.m &&
    t >= 1 &&
    t <= STORED_LIMITS.t &&
    p >= 1 &&
    p <= STORED_LIMITS.p
  );
}

export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  /** Hashes a new password (after NFKC normalization) with a fresh random salt. */
  hash(password: string): Promise<string> {
    return hash(normalizePassword(password), ARGON2ID_PARAMETERS);
  }

  /**
   * Verifies `password` against a stored hash. When there is no usable hash (unknown account,
   * non-credential marker) the same Argon2id work runs against a dummy hash, so every login attempt
   * costs the same and the result is always false.
   */
  async verify(storedHash: string | null, password: string): Promise<boolean> {
    const usable = storedHash !== null && isVerifiableStoredHash(storedHash);
    const target = usable ? storedHash : await this.dummy();
    try {
      const matches = await verify(target, normalizePassword(password));
      return usable && matches;
    } catch {
      return false;
    }
  }

  /** Computes the dummy hash ahead of the first login so the first attempt is not slower. */
  async warmUp(): Promise<void> {
    await this.dummy();
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= hash(randomBytes(32).toString('base64url'), ARGON2ID_PARAMETERS);
    return this.dummyHash;
  }
}
