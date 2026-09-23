# P1 — Authentication + application shell (first PC)

Mission TB_P1_AUTHENTICATION_AND_APP_SHELL_TO_R4 on `feature/p1-auth-shell` (branched from the P0 reproduction baseline `b9eea3755a87490636cbb0f2e7aec1a59e15d64c`). Recorded 2026-09-23 on the first PC. This report covers automated first-PC evidence; the branch CI run of the implementation is reported with review gate R4 (a commit cannot record its own run). No P2 work was started.

## Status by scope (not collapsed)

| Scope | Status | Basis |
|---|---|---|
| **P1_FIRST_PC** | **PASS** | All automated checks below executed on the first PC and passed |
| **P1_CI** | reported at R4 | Branch CI of the pushed P1 commits (both jobs, including the compiled login round trip) |
| **P1 manual browser check** | **NOT_RUN** | No person has signed in through a Windows browser yet; no real administrator account exists (the operator creates it with `yarn admin:create`) |
| **P0_SECOND_PC** | **NOT_RUN** (unchanged) | The second PC reproduces the P0 baseline, not P1 |
| **P0_OVERALL** | **NOT_COMPLETE** (unchanged) | — |

`EXTERNAL_LEGAL_ACTIONS=0` · `REAL_CASE_MUTATIONS=0` · `G7_CREATED=0` · `DEPLOYMENTS=0` · `REAL_TB_DATA_IN_GIT=0` · `REAL_ACCOUNTS_CREATED=0` · `SCHEMA_CHANGES=0`.

## 1. Scope

Delivered: local application-User authentication; local admin-bootstrap CLI (`yarn admin:create`); opaque DB-backed sessions; Origin/CSRF/session protections; the three contracted endpoints `POST /api/v1/auth/login`, `GET /api/v1/auth/session`, `POST /api/v1/auth/logout`; a protected React shell; deterministic tests; CI coverage.

Not delivered (by design): signup or any user-management endpoint; Agency/Owner/LegalSubject/Signer/Route/Mandate/Case CRUD; `GET /meta`; any signing, adoption, sending, G1–G7, Drive, mail or AI function; a production cookie policy. **An application User is not a Signer**: logging in confers no legal authority and satisfies no gate. The shell states this; the UI renders no route that could sign, adopt or send.

## 2. Packages (exact pins, Yarn 24 h age gate unchanged)

Selected from registry metadata on 2026-09-23 (`npm view` read-only; installs through Yarn 4.18.0 only). `enableScripts: false` stays in force.

| Package | Version | Published (UTC) | Where | Evidence / reason |
|---|---|---|---|---|
| argon2 (node-argon2) | 0.45.1 | 2026-07-21 23:55 | `@tb/api` dependency | Current `latest` stable (not the `next` 1.0.0-alpha); wraps the reference phc-winner-argon2 C implementation; N-API 8 prebuilds for linux-x64 glibc ship in the tarball, so it loads with Yarn build scripts disabled (`YN0004` notice only); engines node ≥16.17.0; hash ≈43 ms / verify ≈42 ms at the chosen parameters on the first PC |
| @nestjs/testing | 12.0.4 | 2026-09-21 08:05 | `@tb/api` devDependency | Same release as the installed Nest core (12.1.0 is still inside the age gate); dependency tslib 2.8.1 (already locked) |
| react-router | 8.4.0 | 2026-09-15 15:23 | `@tb/web` dependency | The version pre-selected in P0 `TOOLCHAIN.md`; engines node ≥22.22.0; peers react/react-dom ≥19.2.7 (repository: 19.3.0); declarative `BrowserRouter`/`Routes`/`Navigate`/`Outlet` API confirmed in its type definitions |
| happy-dom | 20.14.5 | 2026-09-12 00:07 | root devDependency | Vitest `environment` for the React shell tests; ~9 packages instead of jsdom's ~40 |

Transitive additions (19 lock entries; lockfile 374 → 393 entries, sha256 `0b36a267…0fb` → `cd10af6b…2e9`): @phc/format 1.0.0, node-addon-api 8.9.2, node-gyp-build 4.8.4, cross-env 10.1.0 (listed by argon2 for its unused install script), @epic-web/invariant 1.0.0, cookie-es 3.1.1, @remix-run/route-pattern 0.22.1, ws 8.21.3, entities 7.0.1, whatwg-mimetype 3.0.0, buffer-image-size 0.6.4, @types/ws 8.18.1, @types/whatwg-mimetype 3.0.2, and @types/node 26.6.2 + undici-types 8.9.0 **nested under happy-dom only** (the root `@types/node` stays 24.13.6). `yarn explain peer-requirements` shows only the pre-existing Prisma Studio notices.

Considered and not selected: Node's built-in `crypto.argon2` (present in 24.21.0 but not a stable-stability API, and it has no PHC encoding); `@node-rs/argon2` 2.2.1 (viable; node-argon2 chosen for the reference implementation); jsdom 30.1.1 (larger tree); Testing Library (raw React `act` + DOM APIs suffice).

## 3. Design

### 3.1 Opaque sessions
- Token: 32 random bytes, base64url (43 characters), only ever in the `tb_session_dev` cookie. `auth_sessions.token_hash` = SHA-256 hex of the token; the raw token is never persisted or logged.
- Lifetime: absolute **12 h** from login (`expires_at`), plus an idle timeout of **30 min** tracked through `last_seen_at` (written at most once per 60 s, so the effective idle window is 29–30 min). Only application activity counts, and only after every check passed: an unsafe request that passed Origin + CSRF, or a safe request carrying `X-Requested-With: TB-APP` (which the web client always sends and a cross-site page cannot add without a failing CORS preflight). Plain same-site loads (images, scripts from another local page) and rejected requests never extend a session. All session timestamps come from one injectable clock (`created_at` is set explicitly, satisfying `ck_auth_sessions_session_time`).
- Login always rotates: cookies presented with a successful login are revoked in the same transaction as the new session insert; a presented token is never adopted (fixation). Logout sets `revoked_at` and clears the cookie. Disabled users (`enabled = false` or `disabled_at` set) can neither log in nor use an existing session.
- An unusable presented cookie (malformed, duplicated, unknown, revoked, expired, idle, disabled user, epoch/secret mismatch) yields 401 and a cookie-clearing `Set-Cookie`; a missing cookie yields 401 without one.

### 3.2 CSRF token and `sessionEpoch` (no schema change)
- `csrfToken = HMAC-SHA256(TB_SESSION_SECRET, "tb/session-csrf/v1" ‖ sessionId ‖ users.session_epoch ‖ sessionToken)`, base64url; `auth_sessions.csrf_token_hash` stores its SHA-256. It is deterministic per session, so `GET /auth/session` returns the same token after a refresh without exposing the session token, and it never equals the cookie value.
- Every authenticated request recomputes the token with the user's **current** `session_epoch` and compares its digest (constant time). Incrementing `users.session_epoch` therefore invalidates every earlier session of that user, and rotating the server secret invalidates all sessions — without an `auth_sessions.session_epoch` column. P1 has no code path that increments the epoch (no password-change/disable endpoint); the semantics are enforced and tested by incrementing it directly in `tb_notice_test`.
- Unsafe authenticated methods require `X-CSRF-Token` (20–200 characters, contract `Csrf` parameter) equal to the session token's CSRF value (403 `CSRF_TOKEN_INVALID`). A CSRF failure never revokes the session.

### 3.3 Cookie
`tb_session_dev=<token>; Max-Age=43200; Path=/; HttpOnly; SameSite=Strict` — no `Domain`, no `Secure`. The Secure=false exception is granted in exactly one place (`resolveSessionCookiePolicy`) and only when every allowed origin is a loopback HTTP origin; an HTTPS or non-loopback origin makes the API refuse to start. The production design (`__Host-tb_session`, Secure, HTTPS) is **not implemented** in P1 and is not simulated by the dev cookie.

### 3.4 Origin and request policy
Express-level middleware before the JSON parser (routing-independent, so path case or unknown routes cannot bypass it):
- any request carrying an `Origin` must carry an exactly allowlisted one (cross-origin reads are refused even though CORS is never enabled);
- every unsafe method (anything but GET/HEAD/OPTIONS) must carry an allowlisted `Origin`; missing and `null` are rejected (403 `ORIGIN_REJECTED`);
- an unsafe request with a body must be `application/json` (UTF-8) (400 `UNSUPPORTED_CONTENT_TYPE`); JSON bodies are capped at 1 MiB before parsing — reported as 413 `PAYLOAD_TOO_LARGE` for operations that declare 413 and as 400 `PAYLOAD_TOO_LARGE` for `login`/`getHealth`, which do not (derived from the contract operation metadata); compressed bodies and urlencoded parsing are disabled.
Allowlist `TB_ALLOWED_WEB_ORIGINS` (default `http://localhost:5173,http://127.0.0.1:5173`): exact serialized loopback HTTP origins only; wildcards, paths, HTTPS and other hosts are rejected at startup. CORS is never enabled on the API, and `server.cors`/`preview.cors` are now `false` on the Vite servers. `X-Powered-By` and automatic weak ETags are disabled.

### 3.5 Login, errors, throttling
- Order: Origin → content type → JSON parse → `X-Requested-With: TB-APP` (403 `REQUESTED_WITH_REQUIRED`) → strict `LoginRequest` validation with the contract Zod schema (400 `VALIDATION_FAILED`; issue paths and fixed messages only) → throttle → user lookup + Argon2id verification → session.
- Every credential rejection — unknown email, wrong password, disabled account, non-credential marker — returns the identical `403 INVALID_CREDENTIALS` body after the same Argon2id work (a dummy hash is verified when there is no usable hash) and the same throttle accounting. The failure path writes nothing to the database and logs `Login rejected (requestId=…)` without the email.
- Throttling (in-process, no Redis): 5 failures per account key per 15 min and 100 failures overall per 15 min; attempts in flight count, unknown and existing emails are treated identically, account keys are stored only as SHA-256 digests, at most 10 000 tracked keys. A throttled attempt gets `429 LOGIN_RATE_LIMITED` with `Retry-After` and is not verified. State resets on API restart.
- Errors use the contract `OperationError` envelope with fixed messages; 5xx responses never contain messages or stack frames (server logs keep only error class, driver code and frames, never the message line). Every API response carries `Cache-Control: no-store`.

### 3.6 Audit
`AUTH_LOGIN_SUCCEEDED` (actor = user, entity = AuthSession, `{userId, expiresAt, rotatedSessions}`) and `AUTH_LOGOUT` (`{revoked}`) are appended in the same transaction as the session change; `USER_CREATED_LOCAL_CLI` (actor null, `{email, displayName, enabled}`) with the user insert. A guard rejects audit payload keys matching password/token/secret/csrf/hash/cookie. Failed logins are deliberately not audited (see 3.5).

### 3.7 Admin bootstrap CLI (`yarn admin:create`)
- Wrapper `scripts/admin/create-admin.ts`: validates `DATABASE_URL` with the shared `scripts/db/allowlist.mjs` (loopback, port 3307, schema `tb_notice_dev` only, never root or `tb_migrate`) **before** building or connecting, builds the API, then runs the compiled `apps/api/dist/src/cli/admin-create.js`. The compiled entry applies the same allowlist again **and** the API runtime boundary (`runtimePoolConfig`) before connecting as `tb_dev` (so running it directly is equally restricted), then checks that the reviewed migration is applied.
- Credentials: interactive prompts (password twice, no echo, raw-mode TTY reader that ignores CSI and SS3 key sequences) or `--email/--display-name/--password-stdin` for non-interactive use; `--password-stdin` is refused when standard input is a terminal (it would echo). Passwords are never accepted as arguments or environment variables; positional values are not echoed.
- Policy: contract email rule, lowercased; display name trimmed, 1–160 characters, no control characters; new password ≥ 15 code points after NFKC (NIST SP 800-63B-4 single-factor minimum), ≤ 256 (contract maximum), no control characters or unpaired surrogates, not equal to the email.
- Never modifies an existing user: a duplicate email (checked before the password prompt and again by the unique index) is refused with exit 1. The P0 disabled synthetic actor therefore cannot be turned into an administrator.
- Output: user id, email, display name and the statement that the account is an application login only (not a Signer, no legal authority). No account was created on the first PC; the operator creates the real local administrator with a password of their choosing.

### 3.8 Password hashing
Argon2id v1.3, **t = 3, m = 64 MiB, p = 4**, 128-bit salt, 256-bit tag (RFC 9106 §4 second recommended option), stored as a PHC string. Passwords are NFKC-normalized before hashing and verification, so composed and decomposed input (for example Vietnamese diacritics from different input methods) verify identically. Stored hashes are verified only if they are Argon2id v1.3 with bounded parameters; anything else (including the P0 marker) never verifies.

### 3.9 Web shell
React Router 8 declarative routes: `/login`, a protected `/` layout (`RequireSession`) with an Overview page, and a catch-all redirect. States: session check (`Checking your session…`), Login (generic failure text, throttle hint, notices for signed-out / session-ended / API-unavailable), authenticated shell (display name and email only, four future modules listed as disabled "Not implemented" items without links, the User-is-not-a-Signer notice, API health line). The CSRF token lives in memory only (the production bundle contains no `localStorage`, `sessionStorage` or `document.cookie` access, and no Zod/Ajv/Argon2/Prisma code); any 401 returns to Login; the session is re-checked on window focus and right after the absolute expiry; a stale CSRF token on logout is refreshed once; a failed logout that is not a 401 keeps the user signed in and says so.

### 3.10 Local environment
`yarn env:init` now creates **or completes** the root `.env`: with no file it writes all keys; with an existing file it appends missing P1 keys (`TB_SESSION_SECRET` = 32 random bytes base64url, `TB_ALLOWED_WEB_ORIGINS`) and replaces an empty or placeholder P1 value on its effective (last) line — no database depends on these keys. No other line is ever rewritten, so database passwords of an initialized MySQL volume stay valid. The file is left at mode 600. Secrets are never printed. First PC: the two keys were appended on 2026-09-23; the 9 existing lines were verified byte-identical (SHA-256). `.env.example` documents the keys with a placeholder the API rejects (and `env:init` replaces).

## 4. Contract interpretation notes

| Topic | Decision | Why |
|---|---|---|
| Status for rejected credentials | **403** `INVALID_CREDENTIALS` | The frozen `login` operation declares only 400/403/429/500; 401 is not declared for login. RFC 9110 §15.5.4 allows 403 when supplied credentials are insufficient |
| Login schema failures | **400** `VALIDATION_FAILED` (not 422) | 422 is not declared for `login` |
| Body over 1 MiB | **413** `PAYLOAD_TOO_LARGE` where the operation declares 413; **400** `PAYLOAD_TOO_LARGE` for `login` and `getHealth` | API_CONTRACT §4/§5 define the 1 MiB cap and 413, but the frozen per-operation lists of the two public operations omit 413; staying inside each operation's declared statuses (independent review finding) |
| Allowed origins | Both `http://localhost:5173` and `http://127.0.0.1:5173` | AR-014 names 127.0.0.1, while the operator's Windows browser uses `http://localhost:5173` (runbook §11, operator-reported P0 check). Both are exact loopback origins of the one Vite server; the host-only cookie keeps sessions separate per hostname. The operator can narrow the list in `.env` |
| `sessionEpoch` | Bound into the CSRF HMAC (3.2) | Enforces epoch invalidation without the schema change the mission forbids |
| Idle timeout | 30 min in addition to the 12 h absolute expiry | `SessionView.expiresAt` reports the absolute expiry; the idle rule is shown in the UI |
| Failed-login audit | Not written; logged without email | Keeps the failure path free of account-dependent database writes |
| `meta.affectedResources` | `[]` on auth responses | Sessions are not UI-refreshable resources |

## 5. Test matrix

P1 adds 148 tests. `yarn test` (no database, 106): `tests/api/*` (83 unit tests in 11 files), `tests/web/app.test.tsx` (10, happy-dom), `tests/tooling/env-file.test.ts` (6), `tests/tooling/admin-create-guard.test.ts` (7). `yarn test:db` (`tb_notice_test`, 42): `tests/db/auth-http.test.ts` (37, real HTTP against the real `AppModule` pipeline), `tests/db/admin-create.test.ts` (5); the P0 structural suite (22) is unchanged. Both P1 groups passed three consecutive runs with identical results (determinism check).

| Mission item | Covered by |
|---|---|
| Argon2id verifies / wrong password rejected / plaintext never stored | `password-hasher.test.ts`; `admin-create.test.ts` (stored PHC string, plaintext absent); `password-hasher-work.test.ts` (a real Argon2id verification runs for unknown/marker accounts) |
| Valid enabled user logs in | `auth-http` LOGIN "a valid enabled user logs in…"; CI `smoke:auth` on the compiled API |
| Wrong password / nonexistent / disabled → same generic failure | `auth-http` "wrong password, unknown email and disabled accounts all get the same generic 403…" (identical status, body, headers; verification count; no DB writes) |
| Login creates/rotates an opaque session; DB holds digests | `auth-http` "…database holds digests only", "rotates on success…", "never adopts a presented token" |
| Cookie name, HttpOnly, SameSite=Strict, Path=/, no Domain, Secure exception only on loopback | `session-cookie.test.ts`, `auth-http` COOKIE, `auth-config.test.ts` (HTTPS/non-loopback refused) |
| GET session works; missing/invalid/revoked/expired rejected | `auth-http` SESSION (incl. duplicated cookies, idle and absolute expiry, activity only from the application) |
| sessionEpoch invalidation | `auth-http` "incrementing users.session_epoch…", `session-tokens.test.ts`; secret rotation test |
| Allowed / invalid / missing Origin; X-Requested-With | `auth-http` CSRF / ORIGIN, `request-middleware.test.ts` |
| Missing/wrong CSRF fails, correct succeeds, token ≠ session token | `auth-http` CSRF tests and LOGOUT |
| Logout revokes, clears cookie, old cookie cannot restore | `auth-http` LOGOUT |
| No token/password/hash in responses, logs, audit | `auth-http` SECURITY "responses, logs and audit rows never contain…", 500 test |
| Cache-Control no-store | `auth-http` SECURITY (every collected response) |
| No public signup | `auth-http` route inventory (exactly four routes; signup/register/users → 404; contract has one public write: login) |
| Contract conformance | `auth-http` "every collected response matches the contract status set and schema…" |
| Throttling | `login-throttle.test.ts`, `auth-http` THROTTLING |
| Admin CLI: guard, duplicate, no overwrite, P0 actor untouched, no plaintext | `admin-create-guard.test.ts` (wrapper), `cli-target.test.ts` (compiled entry guard), `admin-create.test.ts`, `admin-cli.test.ts` |
| UI: Login / session check / shell / logout / expired or revoked session | `tests/web/app.test.tsx` |

## 6. Negative controls

Thirteen protections were each disabled temporarily (file backed up, mutated, suite run, file restored and verified byte-identical by SHA-256); the responsible suite failed every time — see `evidence/p1-negative-controls.txt`: origin requirement, CSRF check, generic unknown-user error, token hashing, epoch binding, HttpOnly, logout revocation, throttle, idle timeout, X-Requested-With, dummy Argon2 work, activity without the application header, undeclared 413 on login.

## 6a. Independent review

A read-only security/correctness review of the uncommitted P1 diff (separate agent, 2026-09-23) reported **no critical or high findings**. Dispositions:

| # | Finding (severity) | Disposition |
|---|---|---|
| 1 | Login/getHealth could return an undeclared 413 (medium) | Fixed: 400 `PAYLOAD_TOO_LARGE` for operations without 413; test records it under `login` for the conformance check |
| 2 | Anti-enumeration work was not proven by a test (low–medium) | Fixed: `password-hasher-work.test.ts` spies on argon2 `verify`; negative control NC11 |
| 3 | Global throttle budget can delay everyone (low) | Accepted and documented (§9) |
| 4 | `--password-stdin` at a terminal would echo (low) | Fixed: refused when stdin is a TTY |
| 5 | Compiled CLI entry lacked the port-3307 guard (low) | Fixed: compiled entry applies `scripts/db/allowlist.mjs` + runtime boundary (`cli-target.test.ts`) |
| 6 | Browser `maxLength` counted UTF-16 units (low) | Fixed: removed; the server enforces 256 code points |
| 7 | Hidden prompt mishandled SS3 keys (low) | Fixed and tested |
| 8 | `env:init` left placeholder/empty P1 values and file mode (low) | Fixed: replaces them in place, sets mode 600 |
| 9 | Cookie tossing from other loopback ports (speculative) | Documented (§9): inherent to a plain-HTTP host-only dev cookie |
| 10 | Idle timeout extendable without CSRF / by same-site loads (info) | Fixed: activity recorded only after all checks and only from the application; negative control NC12 |
| 11 | Expired/revoked session rows never purged (info) | Documented (§9); retention is a later decision |

## 7. First-PC regression sweep

See `evidence/p1-first-pc-sweep.txt` (2026-09-23T15:49Z, after the review fixes; the swept source tree is identical to commit `6255039`, the last P1 code commit). All commands exit 0: `reference:check` (before and after), `reference:helper-tests` (27/27), `contracts:check`, `install --immutable` (lockfile unchanged), `typecheck`, `lint`, `format:check`, `test` (21 files, 964 tests = 858 P0 + 106 P1), `test:db` (3 files, 64 tests = 22 P0 + 42 P1), `db:status`/`db:verify` test (empty) and dev (PASS; dev holds only the seeded synthetic actor, `db:seed` unchanged with canonical digest `0ee26dc3…b775`), both Prisma drift diffs empty, `build`, `smoke:local` (14 checks), `dev:verify-shutdown` (4/4). A leak check found no database password, database URL secret or `TB_SESSION_SECRET` value in any documentation, source, test, CI or package file.

## 8. Database changes

**None.** No migration was created or applied; `20260923103912_initial_schema` (sha256 `b54c36fd…6515`) remains the only migration and `db:verify` passes on test and dev.

## 9. Limitations

- In-memory throttle state resets when the API restarts (single local process by design). Because the global failure budget is shared, a local process spraying bad logins can delay the operator's own sign-in by up to 15 minutes (accepted for a loopback-only tool; restarting the API clears it).
- Cookie tossing: a page served from the same loopback host on another port can set its own `tb_session_dev` cookie with a narrower path (cookies ignore ports). The API then sees two session cookies and answers 401 until that cookie is removed through the browser's site data. A planted but valid token would require working credentials. This is inherent to the plain-HTTP host-only development cookie; the production `__Host-` prefix prevents it.
- Expired and revoked `auth_sessions` rows are retained (the table's lifecycle is append-only/dedicated commands); a retention or purge policy is a later decision.
- Compiled end-to-end login with a created account runs in CI only (`yarn admin:create` + `yarn smoke:auth` against the disposable CI database); on the first PC the compiled API was exercised read-only (`smoke:local`), because no account may be created in the operator's development database without the operator.
- No browser automation; the UI is tested with happy-dom. A manual Windows-browser sign-in is NOT_RUN.
- Throttle keys are per email; loopback clients cannot be distinguished by IP.
