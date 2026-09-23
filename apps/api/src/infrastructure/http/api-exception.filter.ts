import { randomUUID } from 'node:crypto';
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { operations, type OperationError } from '@tb/contracts';
import { ApiError, apiErrors } from './api-error.js';
import type { HttpRequest, HttpResponse } from './http-types.js';

/**
 * Contract operations (METHOD + lowercase path) that do not declare a 413 response. The 1 MiB body
 * cap is enforced before routing, so for these operations an oversized body is reported as 400
 * PAYLOAD_TOO_LARGE (400 = malformed input) to stay within their declared statuses.
 */
const OPERATIONS_WITHOUT_413 = new Set(
  operations
    .filter((operation) => !(operation.errors as readonly string[]).includes('413'))
    .map((operation) => `${operation.method.toUpperCase()} /api/v1${operation.path}`.toLowerCase()),
);

/**
 * Global error renderer: every failure — including routing 404s, body-parser errors and middleware
 * rejections — becomes the contract OperationError envelope with `Cache-Control: no-store`.
 * Responses never contain stack traces or internal error messages (a JSON parse error message can
 * quote the request body, which may hold a password). Server-side logs for 5xx record only the
 * error class, a driver/Prisma code and stack frames — never the message line.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();
    const requestId = request.requestId ?? randomUUID();
    const error = toApiError(exception, request);
    if (error.status >= 500) {
      this.logger.error(`Unhandled ${describe(exception)} (requestId=${requestId})`);
    }
    if (response.headersSent) return;
    for (const [name, value] of Object.entries(error.headers)) response.setHeader(name, value);
    response.setHeader('Cache-Control', 'no-store');
    const body: OperationError = {
      error: { code: error.code, message: error.message, details: { ...error.details }, requestId },
    };
    this.adapterHost.httpAdapter.reply(response, body, error.status);
  }
}

function toApiError(exception: unknown, request: HttpRequest): ApiError {
  if (exception instanceof ApiError) return exception;
  const status = statusOf(exception);
  if (status === 404) return apiErrors.notFound();
  if (status === 413) {
    return declares413(request) ? apiErrors.payloadTooLarge() : apiErrors.payloadTooLargeAs400();
  }
  // 400 (e.g. invalid JSON, mapped by Nest from the body parser's SyntaxError) and 415 (unsupported
  // body encoding/charset; 415 is not a contract status) are both malformed input here.
  if (status !== undefined && status >= 400 && status < 500) return apiErrors.malformedRequest();
  return apiErrors.internal();
}

/** False when the request targets an operation whose contract error list lacks 413. */
function declares413(request: HttpRequest): boolean {
  // Express routing is case-insensitive and ignores a trailing slash; normalize the same way.
  const path = (request.originalUrl ?? request.url ?? '').split('?')[0] ?? '';
  const key = `${(request.method ?? '').toUpperCase()} ${path.replace(/\/+$/, '')}`.toLowerCase();
  return !OPERATIONS_WITHOUT_413.has(key);
}

function statusOf(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();
  if (typeof exception === 'object' && exception !== null) {
    // http-errors instances raised by body-parser (e.g. entity.too.large) carry `status`.
    const status = (exception as { status?: unknown }).status;
    if (typeof status === 'number' && Number.isInteger(status)) return status;
  }
  return undefined;
}

function describe(exception: unknown): string {
  if (!(exception instanceof Error)) return typeof exception;
  const code = (exception as { code?: unknown }).code;
  const frames = (exception.stack ?? '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .slice(0, 8)
    .join('\n');
  return `${exception.name}${typeof code === 'string' ? ` ${code}` : ''}\n${frames}`;
}
