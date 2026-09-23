// yarn db:seed must refuse every target except the loopback tb_notice_dev schema with the tb_migrate
// tooling account, BEFORE connecting (P0-C6). No database is needed: all cases fail in the guard.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SYNTHETIC_ACTOR, DISABLED_ACTOR_MARKER } from '../../scripts/db/seed-data.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const PASSWORD = 'syntheticNotARealPassword0000000000';
const url = (user: string, host: string, port: number, schema: string) =>
  `mysql://${user}:${PASSWORD}@${host}:${port}/${schema}`;

function seed(args: string[], migrationUrl?: string) {
  const env: NodeJS.ProcessEnv = { PATH: process.env['PATH'] };
  // A syntactically valid shadow URL keeps resolution focused on the case under test.
  env['SHADOW_DATABASE_URL'] = url('tb_migrate', '127.0.0.1', 3307, 'tb_notice_shadow');
  if (migrationUrl !== undefined) env['MIGRATION_DATABASE_URL'] = migrationUrl;
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts/db/seed.mjs'), ...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 20_000,
  });
}

describe('db:seed target guard', () => {
  const refusals: Array<[string, string[], string | undefined, RegExp]> = [
    ['--target test', ['--target', 'test'], undefined, /target must be one of: dev/],
    ['--target replay', ['--target', 'replay'], undefined, /target must be one of: dev/],
    ['--target shadow', ['--target', 'shadow'], undefined, /target must be one of: dev/],
    ['--target unknown', ['--target', 'prod'], undefined, /target must be one of: dev/],
    [
      'test schema behind the dev variable',
      [],
      url('tb_migrate', '127.0.0.1', 3307, 'tb_notice_test'),
      /not the required "tb_notice_dev"/,
    ],
    [
      'replay schema behind the dev variable',
      [],
      url('tb_migrate', '127.0.0.1', 3307, 'tb_notice_replay'),
      /not the required "tb_notice_dev"/,
    ],
    [
      'non-allowlisted schema',
      [],
      url('tb_migrate', '127.0.0.1', 3307, 'mysql'),
      /not allowlisted/,
    ],
    ['non-loopback host', [], url('tb_migrate', '10.0.0.5', 3307, 'tb_notice_dev'), /not loopback/],
    ['wrong port', [], url('tb_migrate', '127.0.0.1', 3306, 'tb_notice_dev'), /is not 3307/],
    [
      'root credentials',
      [],
      url('root', '127.0.0.1', 3307, 'tb_notice_dev'),
      /root credentials are never permitted/,
    ],
    [
      'runtime account tb_dev',
      [],
      url('tb_dev', '127.0.0.1', 3307, 'tb_notice_dev'),
      /user must be tb_migrate/,
    ],
  ];

  it.each(refusals)('%s → refused before connecting', (_label, args, migrationUrl, message) => {
    const result = seed(args, migrationUrl);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(message);
    expect(result.stdout).not.toContain('[db:seed] target');
  });
});

describe('synthetic seed data', () => {
  it('is an obviously synthetic, disabled, non-credential actor', () => {
    expect(SYNTHETIC_ACTOR.id).toBe('00000000-0000-4000-8000-00000000a0c7');
    expect(SYNTHETIC_ACTOR.email.endsWith('@example.invalid')).toBe(true);
    expect(SYNTHETIC_ACTOR.enabled).toBe(false);
    expect(SYNTHETIC_ACTOR.passwordHash).toBe(DISABLED_ACTOR_MARKER);
    expect(DISABLED_ACTOR_MARKER.startsWith('!')).toBe(true);
    expect(DISABLED_ACTOR_MARKER.startsWith('$argon2')).toBe(false);
    expect(SYNTHETIC_ACTOR.displayName).toMatch(/SYNTHETIC/);
  });
});
