import { Controller, Get, Query, Req } from '@nestjs/common';
import type { HttpRequest } from '../../infrastructure/http/http-types.js';
import { contractOperation, parseQuery } from '../../infrastructure/write/request-parsing.js';
import { pageReply } from '../directory/directory-http.js';
import { AuditEventsService } from './audit-events.service.js';

const op = { list: contractOperation('listAuditEvents') };

/**
 * The application audit history (listAuditEvents, R14-AUD-018): GET only — the stored events
 * exactly as recorded, newest first. No other audit route exists: no read by id, create, update or
 * delete, and reading writes nothing.
 */
@Controller('audit-events')
export class AuditEventsController {
  constructor(private readonly events: AuditEventsService) {}

  @Get()
  async list(@Query() query: unknown, @Req() request: HttpRequest) {
    return pageReply(request, await this.events.list(parseQuery(op.list, query)));
  }
}
