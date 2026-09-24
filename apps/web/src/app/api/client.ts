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
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  readonly body?: unknown;
  readonly csrfToken?: string;
  /** Exact ETag of the operation's precondition target. */
  readonly ifMatch?: string;
  /** One key per user intent; a retry of the same intent reuses it. */
  readonly idempotencyKey?: string;
}

/** A successful call: the response `data` (undefined for 204) and the ETag header, if any. */
export interface ApiResult<T> {
  readonly status: number;
  readonly data: T;
  readonly etag: string | null;
}

export interface ApiClient {
  getSession(): Promise<SessionView>;
  login(credentials: LoginRequest): Promise<SessionView>;
  logout(csrfToken: string): Promise<void>;
  getHealth(): Promise<HealthStatus>;
  /** Any contracted operation under /api/v1; used by the directory pages. */
  request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<ApiResult<T>>;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Minimal fetch wrapper. Every request sends `X-Requested-With: TB-APP` (required for login),
 * unsafe requests send the session-bound `X-CSRF-Token`, bodies are JSON. The session cookie is
 * HttpOnly and never visible here; the CSRF token lives only in memory (never localStorage).
 */
export function createApiClient(fetchImpl: Fetch = (input, init) => fetch(input, init)): ApiClient {
  async function send(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Requested-With': 'TB-APP',
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.csrfToken !== undefined) headers['X-CSRF-Token'] = options.csrfToken;
    if (options.ifMatch !== undefined) headers['If-Match'] = options.ifMatch;
    if (options.idempotencyKey !== undefined) headers['Idempotency-Key'] = options.idempotencyKey;
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
    async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}) {
      const response = await send(method, path, options);
      const etag = response.headers.get('ETag');
      if (response.status === 204) return { status: 204, data: undefined as T, etag };
      const body = (await response.json()) as { data: T };
      return { status: response.status, data: body.data, etag };
    },
  };
}

async function errorFrom(response: Response): Promise<ApiError> {
  const retryAfter = Number(response.headers.get('Retry-After'));
  const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
  try {
    const body = (await response.json()) as Partial<OperationError>;
    if (body.error && typeof body.error.code === 'string') {
      return new ApiError(
        response.status,
        body.error.code,
        body.error.message,
        retryAfterSeconds,
        body.error.details ?? {},
      );
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
