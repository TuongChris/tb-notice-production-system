# P1.1 — Authentication operational recovery (first PC)

Mission TB_P1_1_AUTH_OPERATIONAL_RECOVERY_TO_R4_1 on `feature/p1-auth-shell`, after review gate R4 (PASS_WITH_NOTES, 2026-09-23). Recorded 2026-09-23 (UTC) on the first PC. Adds local-only, guarded recovery commands for application Users. No HTTP API, UI, signup, schema change or migration was added, and P2 was not started. The branch CI run is reported with review gate R4.1 (a commit cannot record its own run).

## Status by scope (not collapsed)

| Scope | Status | Basis |
|---|---|---|
| **P1_1_FIRST_PC** | **PASS** | All automated checks below executed on the first PC and passed |
| **P1_1_CI** | **PASS** | GitHub Actions run `35894704102` on commit `8fe96ae` — both jobs success, including the recovery flow on a synthetic account in the disposable CI database (verified with `gh run view`, 2026-09-24) |
| **R4.1 review** | **ACCEPTED** | Operator, 2026-09-24 |
| **Port-bound first-PC checks** | **PASS — OPERATOR_REPORTED** | At R4.1 acceptance the operator reported that "the remaining first-PC verification checks have passed". The report names no command, commit or output; §5 lists `smoke:local` and `dev:verify-shutdown` as the checks NOT RUN locally |
| **P1_WINDOWS_BROWSER** | **NOT_RUN** (not reported) | Recorded only when the operator reports it; not inferred from tests or database traces |
| **P0_SECOND_PC** / **P0_OVERALL** | **NOT_RUN** / **NOT_COMPLETE** (unchanged) | — |

An application User is not a Signer. These commands change application login state only: no Signer, authority, Agency or business record is read or changed, and nothing confers legal authority.

## 1. Commands

| Command | Effect |
|---|---|
| `yarn admin:password --email <e> [--password-stdin] [--reason <t>]` | Replaces the password; increments the session epoch; revokes active sessions |
| `yarn admin:disable --email <e> [--reason <t>]` | `enabled=false`, `disabled_at=now`; epoch +1; revokes active sessions; never deletes; already disabled → reported, unchanged |
| `yarn admin:enable --email <e> [--reason <t>]` | `enabled=true`, `disabled_at=null`; epoch +1 (earlier sessions stay unusable); already enabled → reported, unchanged |
| `yarn admin:revoke-sessions --email <e> [--reason <t>]` | Epoch +1; revokes every active session (zero is fine); other users untouched |
| `yarn admin:create …` | Unchanged behaviour (now dispatched through the same runner) |

Structure (one coherent surface):
- **Wrapper** `scripts/admin/admin.ts <command>` accepts only the five known commands (anything else is refused and not echoed). It validates `DATABASE_URL` with the shared `scripts/db/allowlist.mjs` before building or connecting: loopback host, port 3307, `tb_notice_dev`, never root, never `tb_migrate`. It then builds the API and runs the compiled `apps/api/dist/src/cli/admin.js <command>`.
- **Compiled entry** runs `runAdminCli` with production dependencies. Its target resolver is `resolveCliTarget`, which applies the allowlist again and the API runtime boundary. It connects as `tb_dev` and requires the reviewed migration, so running the compiled entry directly is equally guarded. The CLI replaced the earlier create-only entry points (`scripts/admin/create-admin.ts`, `admin-create.js`); `yarn admin:create` is unchanged for operators and CI.
- **Identification**: the user is identified by normalized (lowercased) email. A missing user is refused with `no application user matches that email; nothing was changed` and is never created.
- **Passwords**: taken from the hidden prompt (entered twice) or `--password-stdin` from a pipe or file. `--password-stdin` is refused at a terminal, because it would echo. Passwords are never taken from an argument or environment variable. Validation, NFKC normalization and the Argon2id hasher are exactly those of `admin:create` and login (minimum 15 and maximum 256 code points; t=3, 64 MiB, p=4).
- **`--reason`** is optional context for the audit event: 1–500 characters, no control characters.
- **Output**: user id, email, epoch before → after, and the number of revoked sessions, plus the boundary note. Output never contains passwords, password hashes, tokens, CSRF tokens or digests.

## 2. Behaviour

| Aspect | password | disable | enable | revoke-sessions |
|---|---|---|---|---|
| Columns written | `password_hash`, `password_changed_at`, `session_epoch` | `enabled`, `disabled_at`, `session_epoch` | `enabled`, `disabled_at`, `session_epoch` | `session_epoch` |
| Sessions | active rows revoked | active rows revoked | active rows revoked | active rows revoked |
| Already in target state | — (always changes) | reported, no write, no audit | reported, no write, no audit | — (always changes) |
| Enabled/disabled state | unchanged (a disabled account stays disabled) | → disabled | → enabled | unchanged |
| Audit action | `USER_PASSWORD_RESET_LOCAL_CLI` | `USER_DISABLED_LOCAL_CLI` | `USER_ENABLED_LOCAL_CLI` | `USER_SESSIONS_REVOKED_LOCAL_CLI` |

- **Sessions**: "active" means `revoked_at IS NULL` and `expires_at > now`, for that user only. Expired and already revoked rows are historical and are left exactly as they are; no row is deleted.
- **Epoch**: every command that changes state increments `users.session_epoch` atomically (`increment: 1`). Because each session's CSRF binding includes the epoch, every earlier session is unusable even if a row escaped revocation, for example after an out-of-band disable.
- **Idempotency**: disable and enable use conditional updates inside the transaction, so a concurrent or repeated call becomes a reported no-op rather than a second change. A partly disabled row (for example `enabled=false` with no `disabled_at`) is completed by `admin:disable`.

### Protected fixtures
The P0 synthetic actor is hard-blocked by its id `00000000-0000-4000-8000-00000000a0c7` and its email `p0-synthetic-actor@example.invalid` (constants parity-tested against `scripts/db/seed-data.mjs`). Any other row whose `password_hash` is a non-credential marker (starts with `!`) is also protected. The rules for these rows:
- `admin:disable` only reports that it is already disabled and writes nothing. If the actor were ever found enabled, the command refuses and points to `yarn db:seed`.
- `admin:enable`, `admin:password` and `admin:revoke-sessions` refuse, whichever case of the email is given.
- `yarn db:seed` still reports the actor `unchanged (already canonical)` afterwards (checked locally and in CI).

### Transactions and audit
Each change, its session revocations and its audit event commit in one Prisma interactive transaction. Audit rows record:
- `actorUserId = null` (no app user acted), `entityType = User`, `entityId = <user id>`;
- `beforeRedacted`: the previous epoch, plus `enabled`/`disabledAt` for disable and enable;
- `afterRedacted`: `email`, the new epoch, `revokedSessions`, the new `enabled`/`disabledAt` or `credentialChangedAt`;
- `reason`: "Local administrator recovery via yarn admin:<command>. Application login state only; not a Signer; confers no legal authority.", followed by the operator's `--reason` when one is given.

The audit helper now also guards `before` keys, and no payload key may match `password|token|secret|csrf|hash|cookie`. Tests search the recovery audit rows, the CLI output and the API logs for every password, password hash, raw token, CSRF token, token or CSRF digest and the test HMAC secret: none is present.

## 3. Tests

| Suite | Tests | Covers |
|---|---|---|
| `tests/db/admin-recovery.test.ts` (tb_notice_test, real CLI runner + real HTTP pipeline) | 14 | Password reset (new Argon2id hash, old password 403, new password 200, epoch 1→2, both sessions revoked and 401, only the three columns changed, disabled account stays disabled, refusals without change); disable (sessions 401, generic 403 login, row kept, repeat no-op, partial row completed, P0 actor only reported, tampered actor refused); enable (out-of-band-disabled session stays 401, unchanged password works, disable→enable cycle, repeat no-op, actor and marker fixtures refused); revoke (3 active revoked, logged-out and expired rows unchanged, other user unaffected, zero-session case, refusals); audit content; production wiring refuses a wrong port before connecting for every command |
| `tests/api/admin-cli-runner.test.ts` | 14 | Every command stops at a guard refusal before any connection; the production resolver refuses a wrong port, root, `tb_migrate`, the test schema, a remote host and an unset URL; `--password-stdin` refused at a terminal; a pipe without it refused; `--email`/`--reason` validation; help; unknown command not echoed |
| `tests/api/admin-cli.test.ts` | 12 | Per-command flags, no password argument, no echo of values, usage text states the boundary, hidden prompt incl. SS3 keys, stdin reading, race refusal |
| `tests/tooling/admin-guard.test.ts` | 8 | The wrapper refuses 7 forbidden targets for each of the 5 commands before building; unknown commands; parity of the command lists, the `package.json` scripts and the protected-actor constants |

P1.1 adds 32 tests: 18 in `yarn test` (964 → 982, 22 files) and 14 in `yarn test:db` (64 → 78, 4 files). The recovery and runner suites passed three consecutive runs with identical results.

## 4. Negative controls

Nine recovery protections were each disabled temporarily (backup, mutate, run the responsible suite, restore, compare SHA-256). Every run failed as expected — see `evidence/p1-1-negative-controls.txt`:
- reset without epoch increment;
- reset without revocation;
- enable without epoch increment;
- marker fixtures not protected;
- revocation not scoped to the user;
- missing disable audit;
- disable keeping sessions;
- `--password-stdin` allowed at a terminal;
- the target guard skipped.

## 5. First-PC verification

- **Compiled CLI on non-mutating paths against the local `tb_notice_dev`**:
  - `admin:disable` on the P0 actor: exit 0, reported as already disabled and protected, nothing written;
  - `admin:enable` and `admin:password` on the actor (any email case): exit 1, protected;
  - `admin:revoke-sessions` on an unknown email: exit 1;
  - the direct compiled entry with port 3306, or with `tb_migrate`: exit 1 before connecting;
  - `yarn db:seed` afterwards: `unchanged (already canonical)`, digest `0ee26dc3…b775`.
- No state-changing recovery command was run against the operator's database; those paths run only in `tb_notice_test` and in CI's disposable database.
- **Observation, not inference**: `tb_notice_dev` now also holds one enabled account created with `yarn admin:create` on 2026-09-23 at 16:52:39Z (after R4), with one sign-in at 16:53:18Z. This was seen through counts and audit action names only; no email, hash or token was read. It was not created by the engineer and was not touched. This is not recorded as a browser-check result (see status).
- **Regression sweep**: see `evidence/p1-1-first-pc-sweep.txt` (2026-09-23T17:11Z; source tree identical to commit `ff5032f`). 18 of 20 commands exit 0, including `install --immutable`, typecheck, lint, format, `test` 982, `test:db` 78, `db:verify` test (empty) and dev, seed unchanged, empty drift diffs, `build`, and a check that `docs/reference`, the contracts and `apps/api/prisma` are unchanged. `smoke:local` and `dev:verify-shutdown` were **NOT RUN** locally: the operator's own `yarn dev`, running in a separate terminal since 16:52:55Z, holds ports 3000/5173, so both refuse to start by design. The engineer did not stop the operator's processes; both checks run in branch CI.

## 6. Database changes

**None.** No schema change and no migration; `20260923103912_initial_schema` is still the only migration, and `db:verify` passes on test and dev.

## 7. Notes and limitations

- `admin:password` does not compare the new password with the old one; the password policy is unchanged, as accepted at R4.
- Disable and revoke take effect without an interactive confirmation; an explicit `--email` is always required.
- Recovery takes effect on the running API immediately, because every request re-validates the session against the database; no restart is needed.
- Session-row retention or purge remains DEFERRED; revoked and expired rows accumulate by design.
