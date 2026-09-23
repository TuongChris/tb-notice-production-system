// Credential rules shared by the login endpoint and the local admin-bootstrap CLI, so an account
// the CLI creates can always sign in and vice versa.
import { codePointLength, LoginRequestSchema, UserSchema } from '@tb/contracts';

/** Contract rule for login emails (LoginRequest.email: 3–254 code points, JSON Schema `email`). */
const EmailSchema = LoginRequestSchema.shape.email;
/** Contract rule for User.displayName (at most 160 code points). */
const DisplayNameSchema = UserSchema.shape.displayName;

/** Minimum length of a new password in Unicode code points (NIST SP 800-63B-4, single factor). */
export const NEW_PASSWORD_MIN_CODE_POINTS = 15;
/** Maximum accepted by LoginRequest.password; a longer password could never be submitted. */
export const PASSWORD_MAX_CODE_POINTS = 256;

// C0 controls, DEL and C1 controls: allowed in neither passwords nor display names.
// eslint-disable-next-line no-control-regex -- matching control characters is the purpose here
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
// In `u` mode a valid surrogate pair is one code point; only an unpaired surrogate matches.
const UNPAIRED_SURROGATE = /\p{Surrogate}/u;

/** True when the string is well-formed UTF-16 (no unpaired surrogates). */
export function isWellFormedText(value: string): boolean {
  return !UNPAIRED_SURROGATE.test(value);
}

/**
 * Canonical account identifier. `users.email` uses a binary collation, so the application
 * lowercases once here; contract-valid emails are ASCII, so lowercasing is locale-independent.
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase();
}

/** Returns the normalized email or a problem description. */
export function validateAccountEmail(input: string): { email: string } | { problem: string } {
  if (!EmailSchema.safeParse(input).success) {
    return {
      problem: 'email must be a valid address of 3–254 characters (contract LoginRequest.email)',
    };
  }
  return { email: normalizeEmail(input) };
}

export function validateDisplayName(input: string): { displayName: string } | { problem: string } {
  const displayName = input.trim();
  if (displayName === '' || CONTROL_CHARACTER.test(displayName) || !isWellFormedText(displayName)) {
    return { problem: 'display name must be non-empty text without control characters' };
  }
  if (!DisplayNameSchema.safeParse(displayName).success) {
    return { problem: 'display name must be at most 160 characters (contract User.displayName)' };
  }
  return { displayName };
}

/**
 * Passwords are compared after Unicode NFKC normalization (NIST SP 800-63B), so the same password
 * typed with composed or decomposed characters (for example Vietnamese diacritics from different
 * input methods) verifies identically in the terminal and in the browser.
 */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

/** Problems with a proposed new password; empty when acceptable. Never echoes the password. */
export function newPasswordProblems(password: string, email: string): string[] {
  if (!isWellFormedText(password)) {
    return ['password contains invalid Unicode (an unpaired surrogate)'];
  }
  const problems: string[] = [];
  if (CONTROL_CHARACTER.test(password)) {
    problems.push('password must not contain control characters');
  }
  if (codePointLength(password) > PASSWORD_MAX_CODE_POINTS) {
    problems.push(`password must be at most ${PASSWORD_MAX_CODE_POINTS} characters`);
  }
  const normalized = normalizePassword(password);
  if (codePointLength(normalized) < NEW_PASSWORD_MIN_CODE_POINTS) {
    problems.push(`password must be at least ${NEW_PASSWORD_MIN_CODE_POINTS} characters`);
  }
  if (normalized.toLowerCase() === email.toLowerCase()) {
    problems.push('password must not equal the email address');
  }
  return problems;
}
