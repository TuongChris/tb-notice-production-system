import { useRef, useState, type FormEvent } from 'react';
import type { ApiClient } from '../api/client.js';
import { useSession, type LoginOutcome, type SessionNotice } from '../auth/session.js';
import { HealthIndicator } from '../health.js';

const NOTICES: Record<SessionNotice, string> = {
  'signed-out': 'You have signed out.',
  'session-ended':
    'Your session has ended (expired, revoked or signed out elsewhere). Sign in again to continue.',
  'api-unavailable': 'The API could not be reached to check your session.',
};

function failureMessage(outcome: Exclude<LoginOutcome, { ok: true }>): string {
  switch (outcome.reason) {
    case 'invalid-credentials':
      // Deliberately generic: never says whether the email exists or the account is disabled.
      return 'Sign-in failed. Check the email address and password.';
    case 'rate-limited': {
      const minutes = Math.max(1, Math.ceil((outcome.retryAfterSeconds ?? 60) / 60));
      return `Too many sign-in attempts. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
    }
    case 'invalid-input':
      return 'Enter a valid email address and a password.';
    case 'rejected':
      return `The server rejected the sign-in request (${outcome.code}).`;
    case 'unavailable':
      return 'The API is unavailable. Check that the local API and database are running.';
  }
}

export function LoginPage({ api, notice }: { api: ApiClient; notice: SessionNotice | null }) {
  const { login } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setPending(true);
    setError(null);
    const outcome = await login(email, password);
    if (!outcome.ok) {
      if (passwordRef.current) passwordRef.current.value = '';
      setError(failureMessage(outcome));
      setPending(false);
    }
  }

  return (
    <main className="centered">
      <form
        className="login"
        onSubmit={onSubmit}
        aria-labelledby="login-title"
        data-testid="login-form"
      >
        <h1 id="login-title">TB Notice Production System</h1>
        <p className="muted">Sign in with your local application account.</p>
        {notice && (
          <p role="status" className="notice" data-testid="login-notice">
            {NOTICES[notice]}
          </p>
        )}
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required maxLength={254} />
        </label>
        <label>
          Password
          <input
            ref={passwordRef}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p role="alert" className="error" data-testid="login-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted small">
          An application login is not a signer identity and confers no legal authority.
        </p>
        <HealthIndicator api={api} />
      </form>
    </main>
  );
}
