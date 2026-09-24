// yarn admin:<command> must refuse every database target except loopback:3307/tb_notice_dev with a
// non-root, non-tb_migrate account — BEFORE building or connecting — for every command, and refuse
// unknown commands. No database is needed. Also checks that the command lists, the package.json
// scripts and the protected P0 actor constants agree across the codebase.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_COMMANDS as CLI_COMMANDS } from '../../apps/api/src/cli/admin-args.js';
import { P0_SYNTHETIC_ACTOR } from '../../apps/api/src/cli/admin-common.js';
import { ADMIN_COMMANDS as WRAPPER_COMMANDS } from '../../scripts/admin/commands.mjs';
import { SYNTHETIC_ACTOR } from '../../scripts/db/seed-data.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const PASSWORD = 'syntheticNotARealPassword0000000000';
const url = (user: string, host: string, port: number, schema: string) =>
  `mysql://${user}:${PASSWORD}@${host}:${port}/${schema}`;

function admin(args: string[], databaseUrl: string) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts/admin/admin.ts'), ...args], {
    cwd: repoRoot,
    // DATABASE_URL is set explicitly, so the root .env (if any) cannot override it.
    env: { PATH: process.env['PATH'], DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    input: '',
    timeout: 20_000,
  });
}

describe('admin:* target guard (wrapper)', () => {
  const refusals: Array<[string, string, RegExp]> = [
    ['unset', '', /DATABASE_URL is not set/],
    [
      'root credentials',
      url('root', '127.0.0.1', 3307, 'tb_notice_dev'),
      /root credentials are never permitted/,
    ],
    [
      'tooling account',
      url('tb_migrate', '127.0.0.1', 3307, 'tb_notice_dev'),
      /user tb_migrate is not permitted/,
    ],
    [
      'test schema',
      url('tb_dev', '127.0.0.1', 3307, 'tb_notice_test'),
      /not the required "tb_notice_dev"/,
    ],
    ['non-allowlisted schema', url('tb_dev', '127.0.0.1', 3307, 'mysql'), /not allowlisted/],
    ['non-loopback host', url('tb_dev', '10.0.0.5', 3307, 'tb_notice_dev'), /not loopback/],
    ['wrong port', url('tb_dev', '127.0.0.1', 3306, 'tb_notice_dev'), /is not 3307/],
  ];

  it.each(CLI_COMMANDS)(
    '%s: every forbidden target is refused before build or connection',
    (command) => {
      for (const [label, databaseUrl, message] of refusals) {
        const result = admin([command, '--email', 'p1-guard@example.invalid'], databaseUrl);
        expect(result.status, label).toBe(1);
        expect(result.stderr, label).toMatch(message);
        expect(result.stderr, label).toContain(`[admin:${command}] refused:`);
        expect(result.stdout, label).not.toContain('guard:');
        expect(`${result.stdout}${result.stderr}`, label).not.toContain(PASSWORD);
      }
    },
  );

  it('refuses a missing or unknown command before the guard, without echoing it', () => {
    for (const args of [[], ['signup'], ['synthetic-secret-value']]) {
      const result = admin(args, url('tb_dev', '127.0.0.1', 3307, 'tb_notice_dev'));
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/\[admin\] refused: missing or unknown admin command/);
      expect(result.stderr).not.toContain('synthetic-secret-value');
      expect(result.stdout).not.toContain('guard:');
    }
  });
});

describe('admin command parity', () => {
  it('wrapper, compiled CLI and package.json scripts expose exactly the same commands', () => {
    expect([...WRAPPER_COMMANDS]).toEqual([...CLI_COMMANDS]);
    const scripts = (
      JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    const adminScripts = Object.entries(scripts).filter(([name]) => name.startsWith('admin:'));
    expect(Object.fromEntries(adminScripts)).toEqual(
      Object.fromEntries(
        CLI_COMMANDS.map((command) => [
          `admin:${command}`,
          `node scripts/admin/admin.ts ${command}`,
        ]),
      ),
    );
  });

  it('the protected P0 actor constants match the P0 seed data', () => {
    expect(P0_SYNTHETIC_ACTOR).toEqual({ id: SYNTHETIC_ACTOR.id, email: SYNTHETIC_ACTOR.email });
    expect(SYNTHETIC_ACTOR.passwordHash.startsWith('!')).toBe(true);
  });
});
