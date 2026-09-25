import { Suspense, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import type { ApiClient } from '../api/client.js';
import { useSession } from '../auth/session.js';
import { LoadingNotice } from '../directory/ui.js';
import { HealthIndicator } from '../health.js';

/** Future modules, listed for orientation only. None is implemented or reachable yet. */
export const UNAVAILABLE_MODULES = ['Production'] as const;

/**
 * Protected application shell. Shows only safe application identity (display name and email of
 * the application User) and navigation state. The User is not a Signer.
 */
export function AppShell({ api }: { api: ApiClient }) {
  const { state, logout } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (state.status !== 'authenticated') return null;
  const { user } = state.session;

  async function onSignOut() {
    setPending(true);
    setError(null);
    const outcome = await logout();
    if (!outcome.ok) {
      setError(`Sign-out failed (${outcome.code}); the session may still be active. Try again.`);
      setPending(false);
    }
  }

  return (
    <div className="shell" data-testid="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell-header">
        <strong>TB Notice Production System</strong>
        <span className="identity" data-testid="identity">
          Signed in as {user.displayName} ({user.email})
        </span>
        <button type="button" onClick={onSignOut} disabled={pending}>
          {pending ? 'Signing out…' : 'Sign out'}
        </button>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="shell-body">
        <nav aria-label="Modules" className="shell-nav">
          <ul>
            <li>
              <NavLink to="/" end>
                Overview
              </NavLink>
            </li>
            <li>
              <NavLink to="/directory">Directory</NavLink>
            </li>
            <li>
              <NavLink to="/sources">Sources</NavLink>
            </li>
            <li>
              <NavLink to="/representation">Representation</NavLink>
            </li>
            <li>
              <NavLink to="/cases">Cases</NavLink>
            </li>
            <li>
              <NavLink to="/correspondence">Correspondence</NavLink>
            </li>
            {UNAVAILABLE_MODULES.map((name) => (
              <li
                key={name}
                aria-disabled="true"
                className="unavailable"
                data-testid="unavailable-module"
              >
                {name} <span className="badge">Not implemented</span>
              </li>
            ))}
          </ul>
        </nav>
        <main className="shell-main" id="main" tabIndex={-1}>
          <Suspense fallback={<LoadingNotice label="Loading page…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <footer className="shell-footer">
        <p role="note" data-testid="boundary-note">
          Application login only. Signing in does not make you a Signer, confers no legal authority,
          satisfies no G1–G7 gate, and signs, adopts or sends nothing. This application never signs
          or sends notices.
        </p>
        <HealthIndicator api={api} />
      </footer>
    </div>
  );
}
