// The runtime database boundary shared by the API and the compiled admin CLI (fails closed).
import { describe, expect, it } from 'vitest';
import { runtimePoolConfig } from '../../apps/api/src/infrastructure/database/runtime-database-url.js';

const PASSWORD = 'syntheticNotARealPassword0000000000';
const url = (user: string, host: string, schema: string) =>
  `mysql://${user}:${PASSWORD}@${host}:3307/${schema}`;

describe('runtimePoolConfig', () => {
  it('accepts the runtime account on the loopback development schema', () => {
    expect(runtimePoolConfig(url('tb_dev', '127.0.0.1', 'tb_notice_dev'))).toMatchObject({
      host: '127.0.0.1',
      port: 3307,
      user: 'tb_dev',
      database: 'tb_notice_dev',
      timezone: '+00:00',
    });
  });

  it.each([
    ['unset', undefined],
    ['root', url('root', '127.0.0.1', 'tb_notice_dev')],
    ['tooling account', url('tb_migrate', '127.0.0.1', 'tb_notice_dev')],
    ['test schema', url('tb_dev', '127.0.0.1', 'tb_notice_test')],
    ['remote host', url('tb_dev', 'db.example.com', 'tb_notice_dev')],
    ['other protocol', `postgres://tb_dev:${PASSWORD}@127.0.0.1:3307/tb_notice_dev`],
  ])('refuses %s without revealing the password', (_label, value) => {
    let message = '';
    try {
      runtimePoolConfig(value);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^DATABASE_URL/);
    expect(message).not.toContain(PASSWORD);
  });
});
