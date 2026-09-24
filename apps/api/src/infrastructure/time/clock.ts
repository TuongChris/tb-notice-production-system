/**
 * Injectable time source. Session expiry, idle timeout and login throttling read time only through
 * this token so tests can move time deterministically instead of waiting.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };
