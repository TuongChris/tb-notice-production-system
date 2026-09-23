// OpenAPI document-level metadata of TB-SCHEMA-API-v1 (info, servers, security, shared parameters and responses).
//
// Initial content generated ONCE by scripts/migrations/port-frozen-contract-v1.ts from the frozen
// TB-SCHEMA-API-v1.0.0 reference (docs/reference/database-api-v1/…):
//   contracts/api-schemas.json sha256 bdb3213ba0070d13173fd5ba5f9177b769f54c90af6a46f5473667b0f1b4f7b4
//   contracts/openapi.json sha256 c47e2ea160eaa747f64218746c2997a99dec4206fbec6294ebe1335f2a7a8ba2
//   contracts/endpoint-catalog.json sha256 3f6263e82252695bdc621cdb636fd2f75ffb00b8ff0ba2617b2998c1d2cf1e61
// After the Zod-first transition is accepted (ADR-0002) this file is editable active source; the
// port is provenance only and must not be re-run over it. Build wire schemas with the `tb`
// builders only — the JSON Schema/OpenAPI lowering rejects anything else.

import { tb } from '../primitives/wire.js';
import type { OpenApiDocumentSource } from './operation-types.js';
import { OperationErrorSchema } from './schemas/index.js';

export const openApiDocument = {
  openapi: '3.1.1',
  info: {
    title: 'TB Notice Production System — API Contract v1',
    version: '1.0.0',
    description:
      'LOCAL-FIRST contract, not a deployed API. Terminal product: unsigned candidate. Technical validation does not certify rights/G1-G6. No send, signature, G7 or raw evidence export route.',
  },
  servers: [
    {
      url: 'http://localhost:3000/api/v1',
      description: 'Loopback development only; production requires HTTPS.',
    },
  ],
  tags: [
    'Agency',
    'Assessment',
    'Audit',
    'Auth',
    'Case',
    'Correspondence',
    'Fact',
    'LegalSubject',
    'Mandate',
    'Owner',
    'Production',
    'Route',
    'Signer',
    'Source',
    'System',
    'Validation',
  ],
  securitySchemes: {
    SessionCookie: {
      type: 'apiKey',
      in: 'cookie',
      name: 'tb_session_dev',
      description:
        'LOCAL cookie. Production uses __Host-tb_session with Secure, HttpOnly, Path=/ and no Domain. See API_CONTRACT_v1.md.',
    },
  },
  security: [{ SessionCookie: [] }],
  sharedParameters: {
    IfMatch: {
      name: 'If-Match',
      in: 'header',
      required: true,
      schema: tb.string({ maxLength: 200, minLength: 1 }),
      description:
        'Exact strong ETag of x-precondition-target. Missing=428; stale=412. Not substituted by a guessed version.',
    },
    IdempotencyKey: {
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: tb.string({ maxLength: 100, minLength: 16, pattern: '^[A-Za-z0-9_-]+$' }),
      description:
        'Scope: authenticated actor + operationId. Request digest also includes target path. Replay horizon 7 days.',
    },
    Csrf: {
      name: 'X-CSRF-Token',
      in: 'header',
      required: true,
      schema: tb.string({ maxLength: 200, minLength: 20 }),
      description: 'Session-bound CSRF token plus exact Origin and JSON checks; no tokens in URLs.',
    },
  },
  errorResponse: {
    name: 'Error',
    description:
      'Structured error; see error code registry. Not all errors apply to every operation.',
    schema: OperationErrorSchema,
  },
  successResponse: {
    description: 'Success; source-based truth and human gates remain separate.',
    headers: {
      ETag: {
        schema: tb.string(),
        description: 'Strong entity row-version ETag when the resource is mutable.',
      },
      'Cache-Control': { schema: tb.string(), example: 'no-store' },
    },
  },
  noContentResponse: { description: 'No content. No external transmission occurred.' },
} as const satisfies OpenApiDocumentSource;
