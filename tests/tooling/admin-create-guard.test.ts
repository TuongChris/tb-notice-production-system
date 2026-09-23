// yarn admin:create must refuse every database target except loopback:3307/tb_notice_dev with a
// non-root, non-tb_migrate account — BEFORE building or connecting. No database is needed.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const PASSWORD = 'syntheticNotARealPassword0000000000';
const url = (user: string, host: string, port: number, schema: string) =>
  `mysql://${user}:${PASSWORD}@${host}:${port}/${schema}`;

function adminCreate(databaseUrl: string) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts/admin/create-admin.ts')], {
    cwd: repoRoot,
    // DATABASE_URL is set explicitly, so the root .env (if any) cannot override it.
    env: { PATH: process.env['PATH'], DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    input: '',
    timeout: 20_000,
  });
}

describe('admin:create target guard', () => {
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

  it.each(refusals)('%s → refused before build or connection', (_label, databaseUrl, message) => {
    const result = adminCreate(databaseUrl);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(message);
    expect(result.stdout).not.toContain('[admin:create] guard:');
    expect(`${result.stdout}${result.stderr}`).not.toContain(PASSWORD);
  });
});
