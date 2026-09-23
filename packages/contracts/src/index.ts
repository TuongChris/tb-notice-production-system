// @tb/contracts — shared wire contracts. Depends on neither app nor Prisma (AR-007).
//
// P0-B shell: only the Health response used by GET /api/v1/health is declared here, transcribed
// from the frozen TB-SCHEMA-API-v1.0.0 OpenAPI (`Health`, `ResponseMeta`, `GetHealthResponse`).
// P0-D replaces this with the ported Zod source and generated JSON Schema/OpenAPI.

export const CONTRACT_BASELINE = 'TB-SCHEMA-API-v1.0.0';

export type HealthStatus = 'ok' | 'unavailable';

export interface Health {
  status: HealthStatus;
}

export interface AffectedResource {
  type: string;
  id: string;
  rowVersion: number | null;
}

export interface ResponseMeta {
  requestId: string;
  affectedResources?: AffectedResource[];
}

export interface GetHealthResponse {
  data: Health;
  meta: ResponseMeta;
}
