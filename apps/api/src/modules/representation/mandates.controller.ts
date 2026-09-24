import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type {
  ArchiveRequest,
  CanonicalBindingRequest,
  CreateAuthorityEvent,
  CreateMandate,
  CreateMandateVersion,
  PatchMandate,
} from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { entityReply, pageReply, requesterOf, writeReply } from '../directory/directory-http.js';
import { AuthorityEventsService } from './authority-events.service.js';
import { MandateVersionsService } from './mandate-versions.service.js';
import { MandatesService } from './mandates.service.js';

const op = {
  list: contractOperation('listMandates'),
  create: contractOperation('createMandate'),
  get: contractOperation('getMandate'),
  patch: contractOperation('patchMandate'),
  delete: contractOperation('deleteUnusedMandate'),
  archive: contractOperation('archiveMandate'),
  restore: contractOperation('restoreMandate'),
  bind: contractOperation('bindCanonicalMandate'),
  listVersions: contractOperation('listMandateVersions'),
  createVersion: contractOperation('createMandateVersion'),
  recordEvent: contractOperation('recordAuthorityEvent'),
  listEvents: contractOperation('listAuthorityEvents'),
};

/**
 * Mandate operations of TB-SCHEMA-API-v1 and the collections nested under a mandate (its versions
 * and its authority events). A mandate, a version and an event are records of what documents
 * support; none of them is authority, readiness or a signature.
 */
@Controller('mandates')
export class MandatesController {
  constructor(
    private readonly mandates: MandatesService,
    private readonly versions: MandateVersionsService,
    private readonly events: AuthorityEventsService,
  ) {}

  @Get()
  async list(@Query() query: unknown, @Req() request: HttpRequest) {
    return pageReply(request, await this.mandates.list(parseQuery(op.list, query)));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.mandates.create(
      requesterOf(request),
      parseBody<CreateMandate>(op.create, body),
    );
    return writeReply(response, reply);
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.mandates.get(parsePathParam(op.get, 'id', id));
    return entityReply(request, response, 'Mandate', data);
  }

  @Patch(':id')
  @HttpCode(200)
  async patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.mandates.patch(
      requesterOf(request),
      parsePathParam(op.patch, 'id', id),
      parseBody<PatchMandate>(op.patch, body),
    );
    return writeReply(response, reply);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const mandateId = parsePathParam(op.delete, 'id', id);
    parseBody(op.delete, body);
    return writeReply(response, await this.mandates.delete(requesterOf(request), mandateId));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.mandates.archive(
      requesterOf(request),
      parsePathParam(op.archive, 'id', id),
      parseBody<ArchiveRequest>(op.archive, body),
    );
    return writeReply(response, reply);
  }

  @Post(':id/restore')
  @HttpCode(200)
  async restore(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.mandates.restore(
      requesterOf(request),
      parsePathParam(op.restore, 'id', id),
      parseBody<ArchiveRequest>(op.restore, body),
    );
    return writeReply(response, reply);
  }

  @Post(':id/canonical-bindings')
  @HttpCode(200)
  async bindCanonical(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.mandates.bindCanonical(
      requesterOf(request),
      parsePathParam(op.bind, 'id', id),
      parseBody<CanonicalBindingRequest>(op.bind, body),
    );
    return writeReply(response, reply);
  }

  @Get(':mandateId/versions')
  async listVersions(
    @Param('mandateId') mandateId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.listVersions, 'mandateId', mandateId);
    return pageReply(request, await this.versions.list(id, parseQuery(op.listVersions, query)));
  }

  @Post(':mandateId/versions')
  @HttpCode(201)
  async createVersion(
    @Param('mandateId') mandateId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.versions.create(
      requesterOf(request),
      parsePathParam(op.createVersion, 'mandateId', mandateId),
      parseBody<CreateMandateVersion>(op.createVersion, body),
    );
    return writeReply(response, reply);
  }

  @Post(':mandateId/events')
  @HttpCode(201)
  async recordEvent(
    @Param('mandateId') mandateId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.events.record(
      requesterOf(request),
      parsePathParam(op.recordEvent, 'mandateId', mandateId),
      parseBody<CreateAuthorityEvent>(op.recordEvent, body),
    );
    return writeReply(response, reply);
  }

  @Get(':mandateId/events')
  async listEvents(
    @Param('mandateId') mandateId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.listEvents, 'mandateId', mandateId);
    return pageReply(request, await this.events.list(id, parseQuery(op.listEvents, query)));
  }
}
