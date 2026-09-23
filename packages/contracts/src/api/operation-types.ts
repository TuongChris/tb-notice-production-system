// Types for the active HTTP operation metadata (ADR-0002). Zod property schemas alone do not
// define an OpenAPI operation (method, path, parameters, security, responses, extensions), so the
// operation contract has its own explicit source: ./operations.ts and ./openapi-document.ts.
import type { z } from 'zod';

export type HttpMethod = 'get' | 'post' | 'patch' | 'delete';

export type SharedParameterName = 'IfMatch' | 'IdempotencyKey' | 'Csrf';

export interface SharedParameterRef {
  readonly ref: SharedParameterName;
}

export interface InlineParameter {
  readonly name: string;
  readonly in: 'path' | 'query';
  readonly required?: true;
  readonly style?: 'form';
  readonly explode?: boolean;
  readonly schema: z.ZodType;
  /** OpenAPI documentation default for the parameter schema (not applied by validation). */
  readonly schemaDefault?: number;
}

export type ParameterSpec = SharedParameterRef | InlineParameter;

export type SuccessStatus = '200' | '201';

export type ErrorStatus =
  '400' | '401' | '403' | '404' | '409' | '412' | '413' | '422' | '428' | '429' | '500';

export type SuccessSpec =
  { readonly status: SuccessStatus; readonly schema: z.ZodType } | { readonly status: '204' };

export interface OperationSpec {
  readonly operationId: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly tags: readonly string[];
  readonly summary: string;
  readonly parameters: readonly ParameterSpec[];
  /** JSON request body schema (always required when present). */
  readonly requestBody?: z.ZodType;
  readonly success: SuccessSpec;
  readonly errors: readonly ErrorStatus[];
  /** `session` = the document's default SessionCookie requirement; `none` = public operation. */
  readonly security: 'session' | 'none';
  /** OpenAPI `x-precondition-target`: aggregate whose ETag is required, or null. */
  readonly preconditionTarget: string | null;
  /** OpenAPI `x-idempotent-write`: whether Idempotency-Key semantics apply. */
  readonly idempotentWrite: boolean;
}

export interface SharedParameterSpec {
  readonly name: string;
  readonly in: 'header';
  readonly required: true;
  readonly schema: z.ZodType;
  readonly description: string;
}

export interface OpenApiDocumentSource {
  readonly openapi: string;
  readonly info: { readonly title: string; readonly version: string; readonly description: string };
  readonly servers: readonly { readonly url: string; readonly description: string }[];
  readonly tags: readonly string[];
  readonly securitySchemes: Readonly<
    Record<
      string,
      {
        readonly type: 'apiKey';
        readonly in: 'cookie';
        readonly name: string;
        readonly description: string;
      }
    >
  >;
  /** Top-level and `session` operation security requirement. */
  readonly security: readonly Readonly<Record<string, readonly string[]>>[];
  readonly sharedParameters: Readonly<Record<SharedParameterName, SharedParameterSpec>>;
  readonly errorResponse: {
    readonly name: string;
    readonly description: string;
    readonly schema: z.ZodType;
  };
  readonly successResponse: {
    readonly description: string;
    readonly headers: Readonly<
      Record<
        string,
        {
          readonly schema: z.ZodType;
          readonly description?: string;
          readonly example?: string;
        }
      >
    >;
  };
  readonly noContentResponse: { readonly description: string };
}
