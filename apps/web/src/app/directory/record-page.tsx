// State shared by record detail and form pages: the loaded record with its ETag, a one-time status
// message carried across navigation (for example "Agency created as a draft."), and the version
// conflict flag raised by a 412.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api/client.js';
import type { Versioned, WriteAuth } from '../api/directory.js';
import { useIntentKey, useLoad, useWrite, type Load } from './hooks.js';

export interface FlashState {
  readonly flash?: string;
}

/**
 * A status message handed over by the previous page (navigation state), shown once: it is cleared
 * from history so reloading the page does not repeat it.
 */
export function useFlashMessage(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const initial = (location.state as FlashState | null)?.flash ?? null;
  const [message] = useState<string | null>(initial);
  const target = `${location.pathname}${location.search}`;
  useEffect(() => {
    if (initial !== null) void navigate(target, { replace: true, state: null });
  }, [initial, target, navigate]);
  return message;
}

export function useRecordPage<T>(key: string, load: () => Promise<Versioned<T>>) {
  const [state, reload, replace] = useLoad(key, load);
  const flash = useFlashMessage();
  const [message, setMessage] = useState<string | null>(flash);
  const [conflict, setConflict] = useState(false);

  return {
    state: state as Load<Versioned<T>>,
    message,
    conflict,
    reload: () => {
      setConflict(false);
      setMessage(null);
      reload();
    },
    update: (next: Versioned<T>, text: string) => {
      replace(next);
      setConflict(false);
      setMessage(text);
    },
    raiseConflict: () => {
      setMessage(null);
      setConflict(true);
    },
  };
}

export type Outcome<R> =
  { readonly ok: true; readonly value: R } | { readonly ok: false; readonly error: unknown };

/** Submits one form intent with its Idempotency-Key; a 412 is reported as a conflict. */
export function useSubmission() {
  const write = useWrite();
  const intent = useIntentKey();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState(false);

  async function submit<R>(
    intentValue: unknown,
    perform: (auth: WriteAuth) => Promise<R>,
  ): Promise<Outcome<R>> {
    setPending(true);
    setError(null);
    setConflict(false);
    try {
      const value = await write(intent.keyFor(intentValue), perform);
      intent.done();
      return { ok: true, value };
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 412) setConflict(true);
      else setError(failure);
      return { ok: false, error: failure };
    } finally {
      setPending(false);
    }
  }

  return {
    pending,
    error,
    conflict,
    submit,
    fail: (failure: unknown) => setError(failure),
    reset: () => {
      setError(null);
      setConflict(false);
    },
  };
}
