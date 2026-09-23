// Credential rules shared by login and the admin CLI.
import { describe, expect, it } from 'vitest';
import {
  isWellFormedText,
  newPasswordProblems,
  normalizeEmail,
  validateAccountEmail,
  validateDisplayName,
} from '../../apps/api/src/modules/auth/credentials.js';

describe('account email', () => {
  it('uses the contract email rule and lowercases (binary collation in users.email)', () => {
    expect(validateAccountEmail('P1.Admin@Example.Invalid')).toEqual({
      email: 'p1.admin@example.invalid',
    });
    expect(normalizeEmail('A@B.CO')).toBe('a@b.co');
    for (const bad of [
      '',
      'no-at-sign',
      'a@',
      ' a@b.co',
      'a@b.co ',
      'ä@b.co',
      `${'a'.repeat(250)}@b.co`,
    ]) {
      expect('problem' in validateAccountEmail(bad), JSON.stringify(bad)).toBe(true);
    }
  });
});

describe('display name', () => {
  it('trims and enforces the contract maximum of 160 code points without control characters', () => {
    expect(validateDisplayName('  Synthetic Operator  ')).toEqual({
      displayName: 'Synthetic Operator',
    });
    expect(validateDisplayName('Người vận hành tổng hợp')).toEqual({
      displayName: 'Người vận hành tổng hợp',
    });
    expect('problem' in validateDisplayName('   ')).toBe(true);
    expect('problem' in validateDisplayName('tab\there')).toBe(true);
    expect('problem' in validateDisplayName('x'.repeat(161))).toBe(true);
    expect('displayName' in validateDisplayName('😀'.repeat(160))).toBe(true);
  });
});

describe('new password policy', () => {
  const email = 'p1-admin@example.invalid';

  it('accepts a 15+ character passphrase and never echoes the password in problems', () => {
    expect(newPasswordProblems('synthetic passphrase 0001', email)).toEqual([]);
    const secret = 'short-secret';
    const problems = newPasswordProblems(secret, email);
    expect(problems).toEqual(['password must be at least 15 characters']);
    expect(problems.join(' ')).not.toContain(secret);
  });

  it('rejects control characters, unpaired surrogates, over-long input and the email itself', () => {
    expect(newPasswordProblems('synthetic\u0000passphrase-01', email)).toContain(
      'password must not contain control characters',
    );
    expect(newPasswordProblems('synthetic-passphrase-\ud800', email)).toEqual([
      'password contains invalid Unicode (an unpaired surrogate)',
    ]);
    expect(newPasswordProblems('x'.repeat(257), email)).toContain(
      'password must be at most 256 characters',
    );
    expect(newPasswordProblems('P1-Admin@Example.Invalid', email)).toContain(
      'password must not equal the email address',
    );
  });

  it('detects well-formed text', () => {
    expect(isWellFormedText('ok 😀')).toBe(true);
    expect(isWellFormedText('bad \udc00')).toBe(false);
  });
});
