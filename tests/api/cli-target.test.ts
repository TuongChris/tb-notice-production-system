// The compiled admin CLI applies the shared allowlist AND the runtime boundary itself, so running
// apps/api/dist/src/cli/admin-create.js directly is exactly as restricted as `yarn admin:create`.
import { describe, expect, it } from 'vitest';
import { resolveCliTarget } from '../../apps/api/src/cli/cli-target.js';

const PASSWORD = 'syntheticNotARealPassword0000000000';
const url = (user: string, host: string, port: number, schema: string) =>
  `mysql://${user}:${PASSWORD}@${host}:${port}/${schema}`;

describe('resolveCliTarget', () => {
  it('accepts only the runtime account on loopback:3307/tb_notice_dev and hides the password', async () => {
    const target = await resolveCliTarget(url('tb_dev', '127.0.0.1', 3307, 'tb_notice_dev'));
    expect(target.label).toBe('tb_dev@127.0.0.1:3307/tb_notice_dev');
    expect(target.label).not.toContain(PASSWORD);
  });

  it.each([
    ['unset', undefined, /DATABASE_URL is not set/],
    ['another local MySQL port', url('tb_dev', '127.0.0.1', 3306, 'tb_notice_dev'), /is not 3307/],
    ['root', url('root', '127.0.0.1', 3307, 'tb_notice_dev'), /root credentials/],
    ['tooling account', url('tb_migrate', '127.0.0.1', 3307, 'tb_notice_dev'), /tb_migrate/],
    ['test schema', url('tb_dev', '127.0.0.1', 3307, 'tb_notice_test'), /tb_notice_dev/],
    ['remote host', url('tb_dev', '10.0.0.5', 3307, 'tb_notice_dev'), /not loopback/],
  ])('refuses %s before any connection', async (_label, value, message) => {
    let error: unknown;
    try {
      await resolveCliTarget(value);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^DATABASE_URL/);
    expect((error as Error).message).toMatch(message);
    expect((error as Error).message).not.toContain(PASSWORD);
  });
});
