import type {
  GetHealthResponse,
  GetSessionResponse,
  HealthStatus,
  LoginRequest,
  LoginResponse,
  OperationError,
  SessionView,
} from '@tb/contracts';

/** Same-origin paths; the Vite dev/preview server proxies /api to the loopback API. */
export const API_PATHS = {
  health: '/api/v1/health',
  login: '/api/v1/auth/login',
  session: '/api/v1/auth/session',
  logout: '/api/v1/auth/logout',
} as const;

/** A failed API call: HTTP status (0 when the API was unreachable) and the contract error code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  getSession(): Promise<SessionView>;
  login(credentials: LoginRequest): Promise<SessionView>;
  logout(csrfToken: string): Promise<void>;
  getHealth(): Promise<HealthStatus>;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Minimal fetch wrapper. Every request sends `X-Requested-With: TB-APP` (required for login),
 * unsafe requests send the session-bound `X-CSRF-Token`, bodies are JSON. The session cookie is
 * HttpOnly and never visible here; the CSRF token lives only in memory (never localStorage).
 */
export function createApiClient(fetchImpl: Fetch = (input, init) => fetch(input, init)): ApiClient {
  async function send(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; csrfToken?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Requested-With': 'TB-APP',
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.csrfToken !== undefined) headers['X-CSRF-Token'] = options.csrfToken;
    let response: Response;
    try {
      response = await fetchImpl(path, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'The API could not be reached.');
    }
    if (!response.ok) throw await errorFrom(response);
    return response;
  }

  return {
    async getSession() {
      const body = (await (await send('GET', API_PATHS.session)).json()) as GetSessionResponse;
      return body.data;
    },
    async login(credentials) {
      const response = await send('POST', API_PATHS.login, { body: credentials });
      return ((await response.json()) as LoginResponse).data;
    },
    async logout(csrfToken) {
      await send('POST', API_PATHS.logout, { csrfToken });
    },
    async getHealth() {
      const body = (await (await send('GET', API_PATHS.health)).json()) as GetHealthResponse;
      return body.data.status;
    },
  };
}

async function errorFrom(response: Response): Promise<ApiError> {
  const retryAfter = Number(response.headers.get('Retry-After'));
  const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
  try {
    const body = (await response.json()) as Partial<OperationError>;
    if (body.error && typeof body.error.code === 'string') {
      return new ApiError(response.status, body.error.code, body.error.message, retryAfterSeconds);
    }
  } catch {
    // Not a contract error body (for example a proxy error page).
  }
  return new ApiError(
    response.status,
    `HTTP_${response.status}`,
    'Unexpected API response.',
    retryAfterSeconds,
  );
}
