// yarn db:seed — idempotent synthetic seed of the local development database (P0-C6).
//
// Target: tb_notice_dev ONLY, resolved through the local allowlist with the tb_migrate tooling
// account (MIGRATION_DATABASE_URL). Test/replay/shadow/unknown schemas, non-loopback hosts, other
// ports, root and the tb_dev runtime account are refused before any connection is made.
// Content: only the disabled synthetic actor (seed-data.mjs). No Agency/Owner/Mandate/Case data.
// Idempotent: inserts the actor if absent, restores the canonical values if they drifted, refuses
// to touch a different row that already uses the synthetic email. Prints a state digest; running
// twice yields the same digest and exactly one row.
import { createHash } from 'node:crypto';
import { createConnection } from 'mariadb';
import { SYNTHETIC_ACTOR } from './seed-data.mjs';
import { driverConfig, loadRootEnv, resolveTarget } from './lib/targets.mjs';

const MIGRATION_NAME = '20260923103912_initial_schema';

function parseTarget(args) {
  const index = args.indexOf('--target');
  if (index < 0) return 'dev';
  const value = args[index + 1];
  if (!value) throw new Error('--target requires a value');
  return value;
}

const canonical = () => ({
  id: SYNTHETIC_ACTOR.id,
  email: SYNTHETIC_ACTOR.email,
  display_name: SYNTHETIC_ACTOR.displayName,
  password_hash: SYNTHETIC_ACTOR.passwordHash,
  enabled: 0,
  session_epoch: SYNTHETIC_ACTOR.sessionEpoch,
  password_changed_at: null,
  disabled_at: SYNTHETIC_ACTOR.disabledAt,
});

const SELECT_ACTOR =
  'SELECT id, email, display_name, password_hash, CAST(enabled AS UNSIGNED) AS enabled, session_epoch, ' +
  "password_changed_at, DATE_FORMAT(disabled_at, '%Y-%m-%d %H:%i:%s.%f') AS disabled_at, " +
  "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS created_at FROM users WHERE id = ?";

function normalize(row) {
  return {
    ...row,
    enabled: Number(row.enabled),
    session_epoch: Number(row.session_epoch),
    disabled_at: row.disabled_at ? row.disabled_at.slice(0, 23) : null,
    created_at: row.created_at ? row.created_at.slice(0, 23) : null,
  };
}

async function main() {
  loadRootEnv();
  const targetName = parseTarget(process.argv.slice(2));
  const resolved = resolveTarget(targetName, ['dev']);
  console.log(`[db:seed] target ${resolved.label}`);
  const conn = await createConnection(driverConfig(resolved));
  try {
    const [session] = await conn.query('SELECT DATABASE() AS db');
    if (session.db !== 'tb_notice_dev')
      throw new Error(`connected to ${session.db}, not tb_notice_dev`);
    const applied = await conn.query(
      'SELECT COUNT(*) AS n FROM _prisma_migrations WHERE migration_name = ? AND finished_at IS NOT NULL AND rolled_back_at IS NULL',
      [MIGRATION_NAME],
    );
    if (Number(applied[0].n) !== 1)
      throw new Error(
        'reviewed initial migration is not applied to tb_notice_dev; run yarn db:migrate:deploy dev',
      );

    const expected = canonical();
    await conn.beginTransaction();
    try {
      const byEmail = await conn.query('SELECT id FROM users WHERE email = ? FOR UPDATE', [
        expected.email,
      ]);
      if (byEmail.length > 0 && byEmail[0].id !== expected.id) {
        throw new Error(
          `refusing: ${expected.email} belongs to another user row (${byEmail[0].id})`,
        );
      }
      const existing = await conn.query(`${SELECT_ACTOR} FOR UPDATE`, [expected.id]);
      let action;
      if (existing.length === 0) {
        await conn.query(
          'INSERT INTO users (id, email, display_name, password_hash, enabled, session_epoch, password_changed_at, disabled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            expected.id,
            expected.email,
            expected.display_name,
            expected.password_hash,
            expected.enabled,
            expected.session_epoch,
            expected.password_changed_at,
            expected.disabled_at,
          ],
        );
        action = 'inserted';
      } else {
        const current = normalize(existing[0]);
        const drift = Object.keys(expected).filter(
          (key) => String(current[key]) !== String(expected[key]),
        );
        if (drift.length > 0) {
          await conn.query(
            'UPDATE users SET email = ?, display_name = ?, password_hash = ?, enabled = ?, session_epoch = ?, password_changed_at = ?, disabled_at = ? WHERE id = ?',
            [
              expected.email,
              expected.display_name,
              expected.password_hash,
              expected.enabled,
              expected.session_epoch,
              expected.password_changed_at,
              expected.disabled_at,
              expected.id,
            ],
          );
          action = `restored canonical values (${drift.join(', ')})`;
        } else {
          action = 'unchanged (already canonical)';
        }
      }
      await conn.commit();
      const [row] = await conn.query(SELECT_ACTOR, [expected.id]);
      const state = normalize(row);
      for (const key of Object.keys(expected)) {
        if (String(state[key]) !== String(expected[key]))
          throw new Error(`post-seed verification failed for ${key}`);
      }
      const [count] = await conn.query(
        'SELECT COUNT(*) AS n FROM users WHERE id = ? OR email = ?',
        [expected.id, expected.email],
      );
      const canonicalState = Object.fromEntries(
        Object.keys(expected).map((key) => [key, state[key]]),
      );
      const digest = createHash('sha256').update(JSON.stringify(canonicalState)).digest('hex');
      console.log(`[db:seed] synthetic actor ${expected.id}: ${action}`);
      console.log(
        `[db:seed] rows=${Number(count.n)} enabled=${state.enabled} password_hash=${state.password_hash}`,
      );
      console.log(`[db:seed] canonical digest ${digest} (identical on every PC)`);
      console.log(
        `[db:seed] created_at ${state.created_at} (local insert time; unchanged by re-runs)`,
      );
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(
    `[db:seed] refused/failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
