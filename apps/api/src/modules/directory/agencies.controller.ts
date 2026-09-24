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
  CreateAgency,
  PatchAgency,
  RecordStateRequest,
} from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { AgenciesService } from './agencies.service.js';
import { entityReply, pageReply, requesterOf, writeReply } from './directory-http.js';

const op = {
  list: contractOperation('listAgencies'),
  create: contractOperation('createAgency'),
  get: contractOperation('getAgency'),
  patch: contractOperation('patchAgency'),
  delete: contractOperation('deleteUnusedAgency'),
  archive: contractOperation('archiveAgency'),
  restore: contractOperation('restoreAgency'),
  state: contractOperation('setAgencyState'),
  bind: contractOperation('bindCanonicalAgency'),
};

/**
 * Agency operations of TB-SCHEMA-API-v1, including `bindCanonicalAgency` (P3A): it records the SourceReference
 * that holds the agency's canonical code and establishes no rights, authority or eligibility.
 */
@Controller('agencies')
export class AgenciesController {
  constructor(private readonly agencies: AgenciesService) {}

  @Get()
  async list(@Query() query: unknown, @Req() request: HttpRequest) {
    return pageReply(request, await this.agencies.list(parseQuery(op.list, query)));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.agencies.create(
      requesterOf(request),
      parseBody<CreateAgency>(op.create, body),
    );
    return writeReply(response, reply);
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.agencies.get(parsePathParam(op.get, 'id', id));
    return entityReply(request, response, 'Agency', data);
  }

  @Patch(':id')
  @HttpCode(200)
  async patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.agencies.patch(
      requesterOf(request),
      parsePathParam(op.patch, 'id', id),
      parseBody<PatchAgency>(op.patch, body),
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
    const agencyId = parsePathParam(op.delete, 'id', id);
    parseBody(op.delete, body);
    return writeReply(response, await this.agencies.delete(requesterOf(request), agencyId));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.agencies.archive(
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
    const reply = await this.agencies.restore(
      requesterOf(request),
      parsePathParam(op.restore, 'id', id),
      parseBody<ArchiveRequest>(op.restore, body),
    );
    return writeReply(response, reply);
  }

  @Post(':id/state')
  @HttpCode(200)
  async setState(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.agencies.setState(
      requesterOf(request),
      parsePathParam(op.state, 'id', id),
      parseBody<RecordStateRequest>(op.state, body),
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
    const reply = await this.agencies.bindCanonical(
      requesterOf(request),
      parsePathParam(op.bind, 'id', id),
      parseBody<CanonicalBindingRequest>(op.bind, body),
    );
    return writeReply(response, reply);
  }
}
