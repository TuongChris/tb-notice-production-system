// Synthetic P0 seed data (P0-C6, AR-013). Obviously synthetic constants, identical on every PC.
// The actor exists only so relational fixtures can satisfy created_by/updated_by foreign keys.
// It is disabled, its password_hash is a non-credential marker (not an Argon2 hash, so no password
// can ever verify against it), and it is not a person, administrator or signer.

/** Marker stored instead of a password hash. Starts with "!" so it can never parse as a hash. */
export const DISABLED_ACTOR_MARKER = '!P0-SYNTHETIC-DISABLED-ACTOR-NO-CREDENTIAL';

export const SYNTHETIC_ACTOR = Object.freeze({
  id: '00000000-0000-4000-8000-00000000a0c7',
  email: 'p0-synthetic-actor@example.invalid',
  displayName: 'P0 SYNTHETIC ACTOR (disabled; not a person, administrator or signer)',
  passwordHash: DISABLED_ACTOR_MARKER,
  enabled: false,
  sessionEpoch: 1,
  passwordChangedAt: null,
  /** Fixed synthetic instant (UTC) so the seeded state is identical on every PC. */
  disabledAt: '2026-09-23 00:00:00.000',
});
