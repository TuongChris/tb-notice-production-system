import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { BindCorrespondence, CreateCorrespondence } from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { pageReply, requesterOf, resourceReply, writeReply } from '../directory/directory-http.js';
import { CorrespondenceBindingsService } from './correspondence-bindings.service.js';
import { CorrespondenceService } from './correspondence.service.js';

const op = {
  list: contractOperation('listCorrespondence'),
  capture: contractOperation('captureCorrespondence'),
  get: contractOperation('getCorrespondence'),
  bind: contractOperation('bindCaseCorrespondence'),
  listBindings: contractOperation('listCaseCorrespondenceBindings'),
};

/**
 * Correspondence of TB-SCHEMA-API-v1 (P4C): captured communications recorded exactly as supplied.
 * Capture is not a send: no operation here sends, acknowledges, marks read, fetches, contacts
 * anyone or takes any external action, and none computes G1–G7 or readiness.
 */
@Controller('correspondence')
export class CorrespondenceController {
  constructor(private readonly correspondence: CorrespondenceService) {}

  @Get()
  async list(@Query() query: unknown, @Req() request: HttpRequest) {
    return pageReply(request, await this.correspondence.list(parseQuery(op.list, query)));
  }

  @Post()
  @HttpCode(201)
  async capture(
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.correspondence.capture(
      requesterOf(request),
      parseBody<CreateCorrespondence>(op.capture, body),
    );
    return writeReply(response, reply);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: HttpRequest) {
    return resourceReply(request, await this.correspondence.get(parsePathParam(op.get, 'id', id)));
  }
}

/**
 * Case bindings of captured correspondence (P4C): the explicit, append-only interpretation of one
 * message for one case. Event types name captured past events, never commands; an outcome is
 * recorded for one reported item; a correction supersedes without editing anything.
 */
@Controller('cases')
export class CaseCorrespondenceController {
  constructor(private readonly bindings: CorrespondenceBindingsService) {}

  @Get(':caseId/correspondence-bindings')
  async list(
    @Param('caseId') caseId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.listBindings, 'caseId', caseId);
    return pageReply(request, await this.bindings.list(id, parseQuery(op.listBindings, query)));
  }

  @Post(':caseId/correspondence-bindings')
  @HttpCode(201)
  async bind(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.bindings.bind(
      requesterOf(request),
      parsePathParam(op.bind, 'caseId', caseId),
      parseBody<BindCorrespondence>(op.bind, body),
    );
    return writeReply(response, reply);
  }
}
