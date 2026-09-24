// Data access for the directory pages: loading with explicit loading/error states, writes that
// carry the session CSRF token and one Idempotency-Key per user intent, and session handling
// (a 401 returns to Login; a rejected CSRF token is refreshed once and the same intent retried).
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
import { ApiError } from '../api/client.js';
import type { DirectoryApi, WriteAuth } from '../api/directory.js';
import { useSession } from '../auth/session.js';

const DirectoryApiContext = createContext<DirectoryApi | null>(null);

export function DirectoryApiProvider({
  api,
  children,
}: {
  api: DirectoryApi;
  children: ReactNode;
}) {
  return <DirectoryApiContext.Provider value={api}>{children}</DirectoryApiContext.Provider>;
}

export function useDirectoryApi(): DirectoryApi {
  const api = useContext(DirectoryApiContext);
  if (!api) throw new Error('useDirectoryApi must be used inside <DirectoryApiProvider>.');
  return api;
}

export type Load<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly error: unknown };

/**
 * Loads data whenever `key` changes (and on `reload()`). Responses that arrive after the key
 * changed are ignored. A 401 ends the local session.
 */
export function useLoad<T>(
  key: string,
  load: () => Promise<T>,
): [Load<T>, () => void, (value: T) => void] {
  const { sessionEnded } = useSession();
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const [generation, setGeneration] = useState(0);
  const loadRef = useRef(load);
  // Declared before the loading effect, so the effect below always calls the latest loader.
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    loadRef.current().then(
      (value) => {
        if (active) setState({ status: 'ready', value });
      },
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) sessionEnded();
        setState({ status: 'error', error });
      },
    );
    return () => {
      active = false;
    };
  }, [key, generation, sessionEnded]);

  const reload = useCallback(() => setGeneration((value) => value + 1), []);
  const replace = useCallback((value: T) => setState({ status: 'ready', value }), []);
  return [state, reload, replace];
}

/**
 * Runs a write with the current CSRF token. A 401 ends the local session; a rejected CSRF token
 * (for example after signing in again in another tab) is refreshed once and the same intent — with
 * the same Idempotency-Key — is sent again.
 */
export function useWrite(): <T>(
  key: string,
  perform: (auth: WriteAuth) => Promise<T>,
) => Promise<T> {
  const { state, freshCsrfToken, sessionEnded } = useSession();
  const csrfToken = state.status === 'authenticated' ? state.session.csrfToken : null;
  return useCallback(
    async <T,>(key: string, perform: (auth: WriteAuth) => Promise<T>): Promise<T> => {
      if (csrfToken === null) throw new ApiError(401, 'SESSION_REQUIRED', 'Sign in again.');
      try {
        return await perform({ csrfToken, idempotencyKey: key });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          sessionEnded();
          throw error;
        }
        if (error instanceof ApiError && error.code === 'CSRF_TOKEN_INVALID') {
          const fresh = await freshCsrfToken();
          if (fresh === null) throw error;
          return perform({ csrfToken: fresh, idempotencyKey: key });
        }
        throw error;
      }
    },
    [csrfToken, freshCsrfToken, sessionEnded],
  );
}

/**
 * One Idempotency-Key per user intent: the same key while the operator resubmits exactly the same
 * change (so a retry after a lost response is replayed, not repeated), a new key as soon as the
 * change differs, and a new key after `done()`.
 */
export function useIntentKey(): { keyFor(intent: unknown): string; done(): void } {
  const current = useRef<{ fingerprint: string; key: string } | null>(null);
  return useMemo(
    () => ({
      keyFor(intent: unknown): string {
        const fingerprint = JSON.stringify(intent);
        if (current.current?.fingerprint !== fingerprint) {
          current.current = { fingerprint, key: crypto.randomUUID() };
        }
        return current.current.key;
      },
      done(): void {
        current.current = null;
      },
    }),
    [],
  );
}

/** True when the server refused a change because the record's identity is established. */
export function isEstablishedRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'ESTABLISHED_IDENTITY_IMMUTABLE';
}
