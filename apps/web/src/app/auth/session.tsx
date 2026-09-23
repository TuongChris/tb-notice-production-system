import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { SessionView } from '@tb/contracts';
import { ApiError, type ApiClient } from '../api/client.js';

export type SessionNotice = 'signed-out' | 'session-ended' | 'api-unavailable';

export type SessionState =
  | { readonly status: 'checking' }
  | { readonly status: 'authenticated'; readonly session: SessionView }
  | { readonly status: 'unauthenticated'; readonly notice: SessionNotice | null };

export type LoginOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        'invalid-credentials' | 'rate-limited' | 'invalid-input' | 'rejected' | 'unavailable';
      readonly code: string;
      readonly retryAfterSeconds?: number;
    };

export type LogoutOutcome = { readonly ok: true } | { readonly ok: false; readonly code: string };

interface SessionContextValue {
  readonly state: SessionState;
  login(email: string, password: string): Promise<LoginOutcome>;
  logout(): Promise<LogoutOutcome>;
  /** Re-checks the server session; a 401 ends the local session (expired/revoked elsewhere). */
  revalidate(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Minimum spacing of focus-triggered session re-checks. */
const REVALIDATE_SPACING_MS = 15_000;
/** Longest delay setTimeout accepts. */
const MAX_TIMER_MS = 2_147_483_647;

const isUnauthenticated = (error: unknown) => error instanceof ApiError && error.status === 401;

/**
 * Client session state. The browser never sees the session token (HttpOnly cookie); it holds the
 * session view and CSRF token in memory only. Any 401 from the API returns to the Login screen.
 */
export function SessionProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'checking' });
  const stateRef = useRef(state);
  const lastCheck = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let active = true;
    api.getSession().then(
      (session) => {
        if (active) setState({ status: 'authenticated', session });
      },
      (error: unknown) => {
        if (!active) return;
        setState({
          status: 'unauthenticated',
          notice: isUnauthenticated(error) ? null : 'api-unavailable',
        });
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  const revalidate = useCallback(async () => {
    if (stateRef.current.status !== 'authenticated') return;
    lastCheck.current = Date.now();
    try {
      const session = await api.getSession();
      setState((current) =>
        current.status === 'authenticated' ? { status: 'authenticated', session } : current,
      );
    } catch (error) {
      // A transient network error keeps the session; only the server's 401 ends it.
      if (isUnauthenticated(error))
        setState({ status: 'unauthenticated', notice: 'session-ended' });
    }
  }, [api]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      try {
        const session = await api.login({ email, password });
        setState({ status: 'authenticated', session });
        return { ok: true };
      } catch (error) {
        if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) {
          return {
            ok: false,
            reason: 'unavailable',
            code: error instanceof ApiError ? error.code : 'ERROR',
          };
        }
        if (error.code === 'INVALID_CREDENTIALS')
          return { ok: false, reason: 'invalid-credentials', code: error.code };
        if (error.status === 429) {
          return {
            ok: false,
            reason: 'rate-limited',
            code: error.code,
            ...(error.retryAfterSeconds === undefined
              ? {}
              : { retryAfterSeconds: error.retryAfterSeconds }),
          };
        }
        if (error.status === 400) return { ok: false, reason: 'invalid-input', code: error.code };
        return { ok: false, reason: 'rejected', code: error.code };
      }
    },
    [api],
  );

  const logout = useCallback(async (): Promise<LogoutOutcome> => {
    const current = stateRef.current;
    if (current.status !== 'authenticated') return { ok: true };
    const ended = () => setState({ status: 'unauthenticated', notice: 'signed-out' });
    try {
      await api.logout(current.session.csrfToken);
      ended();
      return { ok: true };
    } catch (error) {
      if (isUnauthenticated(error)) {
        setState({ status: 'unauthenticated', notice: 'session-ended' });
        return { ok: true };
      }
      if (error instanceof ApiError && error.code === 'CSRF_TOKEN_INVALID') {
        // The token is stale (for example a newer login in another tab): refresh once and retry.
        try {
          const fresh = await api.getSession();
          await api.logout(fresh.csrfToken);
          ended();
          return { ok: true };
        } catch (retryError) {
          if (isUnauthenticated(retryError)) {
            setState({ status: 'unauthenticated', notice: 'session-ended' });
            return { ok: true };
          }
          return { ok: false, code: retryError instanceof ApiError ? retryError.code : 'ERROR' };
        }
      }
      // The server session may still be active: stay signed in and report the failure.
      return { ok: false, code: error instanceof ApiError ? error.code : 'ERROR' };
    }
  }, [api]);

  // Detect sessions that ended elsewhere (logout in another tab, revocation, idle expiry) when the
  // window regains focus, and re-check right after the absolute expiry time.
  const expiresAt = state.status === 'authenticated' ? state.session.expiresAt : null;
  useEffect(() => {
    if (expiresAt === null) return;
    const onActive = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheck.current < REVALIDATE_SPACING_MS) return;
      void revalidate();
    };
    window.addEventListener('focus', onActive);
    document.addEventListener('visibilitychange', onActive);
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, Date.parse(expiresAt) - Date.now() + 1000));
    const timer = window.setTimeout(() => void revalidate(), delay);
    return () => {
      window.removeEventListener('focus', onActive);
      document.removeEventListener('visibilitychange', onActive);
      window.clearTimeout(timer);
    };
  }, [expiresAt, revalidate]);

  const value = useMemo(
    () => ({ state, login, logout, revalidate }),
    [state, login, logout, revalidate],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
