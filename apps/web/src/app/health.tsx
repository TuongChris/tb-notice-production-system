import { useEffect, useState } from 'react';
import type { HealthStatus } from '@tb/contracts';
import type { ApiClient } from './api/client.js';

type HealthState = HealthStatus | 'checking' | 'unreachable';

/** API/database health line (public GET /api/v1/health), kept from the P0 shell. */
export function HealthIndicator({ api }: { api: ApiClient }) {
  const [health, setHealth] = useState<HealthState>('checking');
  useEffect(() => {
    let active = true;
    api.getHealth().then(
      (status) => {
        if (active) setHealth(status);
      },
      () => {
        if (active) setHealth('unreachable');
      },
    );
    return () => {
      active = false;
    };
  }, [api]);
  return (
    <p className="health">
      API health:{' '}
      <strong data-testid="health-status">{health === 'checking' ? 'checking…' : health}</strong>
    </p>
  );
}
