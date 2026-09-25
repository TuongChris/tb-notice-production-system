import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { HttpRequest } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { resourceReply } from '../directory/directory-http.js';
import { ProductionContextService } from './production-context.service.js';

const op = contractOperation('getProductionContext');

/**
 * Production context of TB-SCHEMA-API-v1 (P4D): GET /cases/{caseId}/production-context — a read of
 * recorded case context, no ETag, no If-Match, no Idempotency-Key (the contract declares no
 * precondition target and no idempotent write). The query is validated against the contract: the
 * required task and mode, the optional selection, parent binding and prior bindings (the parameter
 * repeated once per binding, at most 100). Nothing here decides G1–G7 or readiness, prompts,
 * drafts, signs, sends or takes an external action.
 */
@Controller('cases')
export class ProductionContextController {
  constructor(private readonly contexts: ProductionContextService) {}

  @Get(':caseId/production-context')
  async get(@Param('caseId') caseId: string, @Query() query: unknown, @Req() request: HttpRequest) {
    const id = parsePathParam(op, 'caseId', caseId);
    return resourceReply(request, await this.contexts.get(id, parseQuery(op, query)));
  }
}
