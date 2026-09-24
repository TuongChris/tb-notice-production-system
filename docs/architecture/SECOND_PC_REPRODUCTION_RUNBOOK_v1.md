# Second-PC reproduction runbook v1 (P0_SECOND_PC)

Purpose: prove that a **clean clone** on the second physical Windows PC (WSL2 Ubuntu) reproduces P0 with the same locked toolchain, the same pinned MySQL image and the **committed** migration — independently of the first PC. Acceptance rows P0-26/P0-27 of the P0 contract.

Assumptions at start: no clone, no project Docker volume, no `node_modules`, no `.env`, no uncommitted files. Nothing is copied from PC #1 (no `.env`, `node_modules`, generated client, Docker volume, USB/Drive copies).

**The second PC must NOT create or regenerate a migration** (`yarn db:migrate:create`, `prisma migrate dev`) — it applies the committed `20260923103912_initial_schema`. Never run `prisma db push`, `prisma migrate reset` or `FOREIGN_KEY_CHECKS=0`.

General stop rule: if any step's output differs from "Expect", stop, do not improvise fixes, and report the exact command and output.

## 0. Prerequisites (once per PC)

| Check | Command (WSL Ubuntu terminal unless noted) | Expect |
|---|---|---|
| WSL2 distro | PowerShell: `wsl -l -v` | Ubuntu, VERSION 2 |
| Docker Desktop with WSL integration for this distro | `docker version --format '{{.Server.Version}}'` and `docker compose version` | a server version; Compose v2 |
| Git and GitHub access to the private repository | `git --version`; `gh auth status` or a configured credential | access to `TuongChris/tb-notice-production-system` |
| nvm | `command -v nvm` (after `source ~/.nvm/nvm.sh`) | nvm available |
| Free ports | `ss -ltn | grep -E ':(3000|3307|5173) '` | no output |

## 1. Clone and branch

```bash
mkdir -p ~/projects && cd ~/projects        # Linux filesystem, NOT /mnt/c
git clone https://github.com/TuongChris/tb-notice-production-system.git
cd tb-notice-production-system
git checkout bootstrap/p0-local
git rev-parse HEAD
git status --short
```

Expect: `git rev-parse HEAD` equals the commit named in the R3 review (see `docs/CURRENT_STATE.md` → latest verified commit, or the operator's instruction); `git status --short` prints nothing. Record the commit.

## 2. Node and Yarn

```bash
nvm install 24.21.0 && nvm use 24.21.0
node --version                 # v24.21.0
corepack enable
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
yarn --version                 # 4.18.0
```

Stop if Node is not `v24.21.0` or Yarn is not `4.18.0`.

## 3. Immutable install

```bash
yarn install --immutable
git status --short
```

Expect: exit 0 (a `YN0086` note about Prisma Studio's optional React peers is known and harmless); `git status` still empty (the lockfile must not change). Stop on `YN0028` (lockfile would be modified) or any quarantine/age-gate error.

## 4. Frozen references

```bash
yarn reference:check
yarn reference:helper-tests
```

Expect: `database-api-v1: 31 manifest entries, MANIFEST.sha256 42c2a419332d666b9d3f94ebcf16310f4d1c14af137eec6d55f4780928646e9c`, `architecture-v1: 18 manifest entries, MANIFEST.sha256 62b4d1136db81d31cf91dbd38a59c4ba57af265b228b479c909e0dbce693c3de`, `pinned identity … matches`, `OK — frozen references intact`; helper tests `pass 27, fail 0` and `references after run: intact`. Stop on any FAIL.

## 5. Local secrets and MySQL

```bash
yarn env:init                   # creates .env (mode 600) with random local passwords; never print or commit it
yarn db:up                      # docker compose up -d --wait mysql
docker compose ps
ss -ltn | grep ':3307 '
```

Expect: container `tb-notice-mysql-1` `healthy`, image `mysql:8.4.11@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d`; port shown only as `127.0.0.1:3307`. Stop if bound to `0.0.0.0` or unhealthy.

## 6. Apply the COMMITTED migration (test → replay → dev)

```bash
yarn db:migrate:deploy test
yarn db:status test
yarn db:verify test --expect-empty

yarn db:migrate:deploy replay
yarn db:migrate:deploy replay   # second run
yarn db:verify replay --expect-empty

yarn db:migrate:deploy dev
yarn db:verify dev --expect-empty
```

Expect for each deploy: `Applying migration 20260923103912_initial_schema` … `All migrations have been successfully applied.`; the **second** replay deploy prints `No pending migrations to apply.`; `db:status` prints `Database schema is up to date!`; every `db:verify` prints tables 33/33 (InnoDB 33, utf8mb4_0900_bin 33), columns 541/541, unique keys 50/50, indexes 34/34, foreign keys 125/125 RESTRICT/RESTRICT (composite 27), CHECK constraints 30/30 … ENFORCED=YES, applied migration checksum `b54c36fdaada7bdd31e08558a93d70e9e40fd4c48348681c9c2a124503426515`, `PASS`.
Stop if Prisma asks to reset, a checksum differs, or any verify line FAILs.

## 7. Synthetic seed (twice)

```bash
yarn db:seed
yarn db:seed
yarn db:verify dev
```

Expect: first run `inserted`, second run `unchanged (already canonical)`; both print `rows=1 enabled=0` and `canonical digest 0ee26dc3ee5f3a1030fb78a6cadaf4dabef1f5a296b58163248584e1e0bfb775` (identical to PC #1); `db:verify dev` PASS with `domain rows total: 1`.

## 8. Contracts and static checks

```bash
yarn contracts:check
yarn typecheck
yarn lint
yarn format:check
```

Expect: `OK — 3 generated outputs match the active source.`; the other three exit 0 (`All matched files use Prettier code style!`).

## 9. Tests

```bash
yarn test
yarn test:db
```

Expect: `yarn test` — all test files passed, 0 failed (the count reported at R3 in `docs/verification/p0/P0_FINAL_REPORT.md`); `yarn test:db` — `22 passed`. Stop on any failure; report the failing test name and output.

## 10. Build, smoke and dev shutdown

```bash
yarn build
yarn smoke:local
yarn dev:verify-shutdown
```

Expect: build exit 0; smoke ends with `[smoke] PASS (9 checks)` (health valid against the active contract directly and through the web proxy, web shell served, ports released); `[verify-dev] PASS (4/4 scenarios)`.

## 11. Manual Windows browser check (P0_WINDOWS_BROWSER)

1. In the WSL terminal: `yarn dev` and wait for `[api] TB API listening on http://127.0.0.1:3000/api/v1` and the Vite `Local: http://127.0.0.1:5173/` line.
2. On Windows, open **http://localhost:5173/** in a normal browser (use `localhost` consistently; do not mix with `127.0.0.1` in the same session).
3. Expect the page title *TB Notice Production System*, the line "Local development shell (P0)…" and **API health: ok**.
4. Open **http://localhost:5173/api/v1/health** → JSON `{"data":{"status":"ok"},"meta":{"requestId":"…","affectedResources":[]}}`.
5. Press **Ctrl+C** in the WSL terminal. Expect `[dev] stopping (SIGINT)`, both children exited, prompt returns; `ss -ltn | grep -E ':(3000|5173) '` prints nothing.

Record browser name/version and a note (or screenshot kept outside Git — it contains no case data, but screenshots are not committed evidence).

## 12. Close-out

```bash
yarn reference:check
git status --short
```

Expect: references intact; `git status` empty (`.env`, `node_modules`, `dist`, `apps/api/generated` are ignored). Do not commit or push from PC #2 unless the operator explicitly authorizes it.

## Report template (send back for review)

```
P0_SECOND_PC run
date/time (UTC):
PC / Windows build / WSL distro:
commit (git rev-parse HEAD):
node / yarn / docker / compose versions:
step 3 install:             PASS/FAIL
step 4 references + 27:     PASS/FAIL
step 5 MySQL loopback:      PASS/FAIL (image digest shown: …)
step 6 migrations:          test PASS/FAIL, replay second deploy "No pending", dev PASS/FAIL
step 7 seed digest:         … (expected 0ee26dc3…b775)
step 8 contracts/static:    PASS/FAIL
step 9 yarn test / test:db: N passed / 22 passed
step 10 build/smoke/dev:    PASS/FAIL
step 11 browser:            PASS/FAIL (browser + version)
deviations / exact errors:
```
