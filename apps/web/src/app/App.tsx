import { useEffect, useState } from 'react';
import type { GetHealthResponse, HealthStatus } from '@tb/contracts';

type ViewState = { kind: 'loading' } | { kind: 'loaded'; status: HealthStatus } | { kind: 'error' };

// P0 shell only: shows API/database health through the dev proxy. No feature pages.
export function App() {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/health', { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as GetHealthResponse;
        setState({ kind: 'loaded', status: body.data.status });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error('Health request failed', error);
          setState({ kind: 'error' });
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>TB Notice Production System</h1>
      <p>Local development shell (P0). No case, notice or signing functions exist here.</p>
      <p>
        API health:{' '}
        <strong data-testid="health-status">
          {state.kind === 'loading'
            ? 'checking…'
            : state.kind === 'error'
              ? 'unreachable'
              : state.status}
        </strong>
      </p>
    </main>
  );
}
