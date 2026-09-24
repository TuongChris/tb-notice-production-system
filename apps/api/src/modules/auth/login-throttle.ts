// In-process login throttling (API_CONTRACT_v1 §3 "rate-limit"). Local-first single API process:
// state lives in memory and resets on restart; no Redis or other service.
//
// Two budgets over sliding windows, both counted BEFORE any password verification:
//   - per account key (normalized email, stored only as a SHA-256 digest), and
//   - global (all login failures), which bounds password spraying across many emails.
// Attempts in flight count against both budgets, so parallel requests cannot overshoot them.
// Unknown and existing accounts are throttled identically: a 429 reveals nothing about an account.
import { createHash } from 'node:crypto';
import type { Clock } from '../../infrastructure/time/clock.js';

export interface LoginThrottleSettings {
  readonly maxFailuresPerAccount: number;
  readonly accountWindowMs: number;
  readonly maxFailuresGlobal: number;
  readonly globalWindowMs: number;
  /** Upper bound on tracked account keys (memory bound). */
  readonly maxTrackedAccounts: number;
}

export const DEFAULT_LOGIN_THROTTLE: LoginThrottleSettings = Object.freeze({
  maxFailuresPerAccount: 5,
  accountWindowMs: 15 * 60 * 1000,
  maxFailuresGlobal: 100,
  globalWindowMs: 15 * 60 * 1000,
  maxTrackedAccounts: 10_000,
});

export type ThrottleDecision =
  | { readonly allowed: true; readonly ticket: AttemptTicket }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface AttemptTicket {
  readonly key: string;
}

interface AccountState {
  failures: number[];
  inFlight: number;
}

export class LoginThrottle {
  private readonly accounts = new Map<string, AccountState>();
  private globalFailures: number[] = [];
  private globalInFlight = 0;
  private readonly open = new WeakSet<AttemptTicket>();

  constructor(
    private readonly settings: LoginThrottleSettings,
    private readonly clock: Clock,
  ) {}

  /** Reserves an attempt for `accountKey` or reports how long to wait. */
  begin(accountKey: string): ThrottleDecision {
    const now = this.clock.now().getTime();
    const key = createHash('sha256').update(accountKey, 'utf8').digest('hex');
    this.globalFailures = recent(this.globalFailures, now, this.settings.globalWindowMs);
    const account = this.accounts.get(key);
    if (account) account.failures = recent(account.failures, now, this.settings.accountWindowMs);

    const globalWait = waitSeconds(
      this.globalFailures,
      this.globalInFlight,
      this.settings.maxFailuresGlobal,
      this.settings.globalWindowMs,
      now,
    );
    const accountWait = account
      ? waitSeconds(
          account.failures,
          account.inFlight,
          this.settings.maxFailuresPerAccount,
          this.settings.accountWindowMs,
          now,
        )
      : 0;
    const wait = Math.max(globalWait, accountWait);
    if (wait > 0) return { allowed: false, retryAfterSeconds: wait };

    const state = account ?? this.track(key, now);
    if (!state) return { allowed: false, retryAfterSeconds: 1 };
    state.inFlight += 1;
    this.globalInFlight += 1;
    const ticket: AttemptTicket = Object.freeze({ key });
    this.open.add(ticket);
    return { allowed: true, ticket };
  }

  /** Records a failed credential check (wrong password, unknown or disabled account). */
  fail(ticket: AttemptTicket): void {
    const state = this.close(ticket);
    if (!state) return;
    const now = this.clock.now().getTime();
    state.failures.push(now);
    this.globalFailures.push(now);
  }

  /** Records a successful login: the account's failure history is cleared. */
  succeed(ticket: AttemptTicket): void {
    const state = this.close(ticket);
    if (state) state.failures = [];
  }

  /** Releases an attempt that ended without a credential decision (for example a server error). */
  release(ticket: AttemptTicket): void {
    this.close(ticket);
  }

  private close(ticket: AttemptTicket): AccountState | undefined {
    if (!this.open.delete(ticket)) return undefined;
    this.globalInFlight = Math.max(0, this.globalInFlight - 1);
    const state = this.accounts.get(ticket.key);
    if (state) state.inFlight = Math.max(0, state.inFlight - 1);
    return state;
  }

  private track(key: string, now: number): AccountState | undefined {
    if (this.accounts.size >= this.settings.maxTrackedAccounts) this.prune(now);
    if (this.accounts.size >= this.settings.maxTrackedAccounts) {
      // Evict the oldest idle entry; the global budget still bounds total failures.
      for (const [candidate, state] of this.accounts) {
        if (state.inFlight === 0) {
          this.accounts.delete(candidate);
          break;
        }
      }
      if (this.accounts.size >= this.settings.maxTrackedAccounts) return undefined;
    }
    const state: AccountState = { failures: [], inFlight: 0 };
    this.accounts.set(key, state);
    return state;
  }

  private prune(now: number): void {
    for (const [key, state] of this.accounts) {
      state.failures = recent(state.failures, now, this.settings.accountWindowMs);
      if (state.failures.length === 0 && state.inFlight === 0) this.accounts.delete(key);
    }
  }
}

function recent(timestamps: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((at) => at > cutoff);
}

/** Seconds until one more attempt fits the budget, or 0 when it fits now. */
function waitSeconds(
  failures: readonly number[],
  inFlight: number,
  max: number,
  windowMs: number,
  now: number,
): number {
  const excess = failures.length + inFlight - max;
  if (excess < 0) return 0;
  // failures[0..excess] (ascending) must leave the window before one more attempt fits.
  const expiring = failures[excess];
  if (expiring === undefined) return 1; // saturated by attempts still in flight
  return Math.max(1, Math.ceil((expiring + windowMs - now) / 1000));
}
