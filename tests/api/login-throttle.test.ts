// Login throttling: per-account and global budgets over sliding windows, in-flight reservations,
// identical treatment of unknown and existing accounts, bounded memory.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOGIN_THROTTLE,
  LoginThrottle,
  type LoginThrottleSettings,
} from '../../apps/api/src/modules/auth/login-throttle.js';

class FakeClock {
  constructor(public ms = Date.UTC(2026, 8, 23, 12, 0, 0)) {}
  now(): Date {
    return new Date(this.ms);
  }
  advance(ms: number): void {
    this.ms += ms;
  }
}

const settings = (overrides: Partial<LoginThrottleSettings> = {}): LoginThrottleSettings => ({
  ...DEFAULT_LOGIN_THROTTLE,
  ...overrides,
});

function failTimes(throttle: LoginThrottle, key: string, times: number): void {
  for (let attempt = 0; attempt < times; attempt += 1) {
    const decision = throttle.begin(key);
    if (!decision.allowed) throw new Error(`attempt ${attempt} unexpectedly throttled`);
    throttle.fail(decision.ticket);
  }
}

describe('LoginThrottle', () => {
  it('defaults to 5 failures per account and 100 overall per 15 minutes', () => {
    expect(DEFAULT_LOGIN_THROTTLE).toMatchObject({
      maxFailuresPerAccount: 5,
      accountWindowMs: 900_000,
      maxFailuresGlobal: 100,
      globalWindowMs: 900_000,
    });
  });

  it('blocks an account after 5 failures until the oldest failure leaves the window', () => {
    const clock = new FakeClock();
    const throttle = new LoginThrottle(settings(), clock);
    failTimes(throttle, 'user@example.invalid', 5);
    const blocked = throttle.begin('user@example.invalid');
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 900 });
    clock.advance(600_000);
    expect(throttle.begin('user@example.invalid')).toEqual({
      allowed: false,
      retryAfterSeconds: 300,
    });
    clock.advance(300_000);
    expect(throttle.begin('user@example.invalid').allowed).toBe(true);
    // Other accounts were never affected.
    expect(throttle.begin('other@example.invalid').allowed).toBe(true);
  });

  it('treats any account key identically (existence is never consulted)', () => {
    const throttle = new LoginThrottle(settings(), new FakeClock());
    failTimes(throttle, 'unknown@example.invalid', 5);
    failTimes(throttle, 'existing@example.invalid', 5);
    expect(throttle.begin('unknown@example.invalid')).toEqual(
      throttle.begin('existing@example.invalid'),
    );
  });

  it('clears the account history on success', () => {
    const throttle = new LoginThrottle(settings(), new FakeClock());
    failTimes(throttle, 'user@example.invalid', 4);
    const decision = throttle.begin('user@example.invalid');
    if (!decision.allowed) throw new Error('unexpected throttle');
    throttle.succeed(decision.ticket);
    failTimes(throttle, 'user@example.invalid', 5);
    expect(throttle.begin('user@example.invalid').allowed).toBe(false);
  });

  it('counts attempts in flight so parallel requests cannot exceed the budget', () => {
    const throttle = new LoginThrottle(settings(), new FakeClock());
    const tickets = Array.from({ length: 5 }, () => throttle.begin('user@example.invalid'));
    expect(tickets.every((decision) => decision.allowed)).toBe(true);
    expect(throttle.begin('user@example.invalid')).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    for (const decision of tickets) if (decision.allowed) throttle.release(decision.ticket);
    expect(throttle.begin('user@example.invalid').allowed).toBe(true);
  });

  it('applies a global failure budget across accounts (password spraying)', () => {
    const clock = new FakeClock();
    const throttle = new LoginThrottle(settings({ maxFailuresGlobal: 10 }), clock);
    for (let index = 0; index < 10; index += 1)
      failTimes(throttle, `spray-${index}@example.invalid`, 1);
    const blocked = throttle.begin('fresh@example.invalid');
    expect(blocked.allowed).toBe(false);
    clock.advance(DEFAULT_LOGIN_THROTTLE.globalWindowMs);
    expect(throttle.begin('fresh@example.invalid').allowed).toBe(true);
  });

  it('ignores double completion of a ticket', () => {
    const throttle = new LoginThrottle(settings(), new FakeClock());
    const decision = throttle.begin('user@example.invalid');
    if (!decision.allowed) throw new Error('unexpected throttle');
    throttle.fail(decision.ticket);
    throttle.fail(decision.ticket);
    failTimes(throttle, 'user@example.invalid', 4);
    expect(throttle.begin('user@example.invalid').allowed).toBe(false);
  });

  it('bounds the number of tracked accounts', () => {
    const throttle = new LoginThrottle(
      settings({ maxTrackedAccounts: 3, maxFailuresGlobal: 1000 }),
      new FakeClock(),
    );
    for (let index = 0; index < 10; index += 1)
      failTimes(throttle, `bounded-${index}@example.invalid`, 1);
    expect(
      (throttle as unknown as { accounts: Map<string, unknown> }).accounts.size,
    ).toBeLessThanOrEqual(3);
  });
});
