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
  CreateOwner,
  PatchOwner,
  RecordStateRequest,
} from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { entityReply, pageReply, requesterOf, writeReply } from './directory-http.js';
import { OwnersService } from './owners.service.js';

const op = {
  list: contractOperation('listOwners'),
  create: contractOperation('createOwner'),
  get: contractOperation('getOwner'),
  patch: contractOperation('patchOwner'),
  delete: contractOperation('deleteUnusedOwner'),
  archive: contractOperation('archiveOwner'),
  restore: contractOperation('restoreOwner'),
  state: contractOperation('setOwnerState'),
  bind: contractOperation('bindCanonicalOwner'),
};

/**
 * Owner operations of TB-SCHEMA-API-v1, including `bindCanonicalOwner` (P3A): it records the SourceReference
 * that holds the owner namespace's canonical code and establishes no rights, authority or eligibility.
 */
@Controller('owners')
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @Get()
  async list(@Query() query: unknown, @Req() request: HttpRequest) {
    return pageReply(request, await this.owners.list(parseQuery(op.list, query)));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.owners.create(
      requesterOf(request),
      parseBody<CreateOwner>(op.create, body),
    );
    return writeReply(response, reply);
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.owners.get(parsePathParam(op.get, 'id', id));
    return entityReply(request, response, 'Owner', data);
  }

  @Patch(':id')
  @HttpCode(200)
  async patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.owners.patch(
      requesterOf(request),
      parsePathParam(op.patch, 'id', id),
      parseBody<PatchOwner>(op.patch, body),
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
    const ownerId = parsePathParam(op.delete, 'id', id);
    parseBody(op.delete, body);
    return writeReply(response, await this.owners.delete(requesterOf(request), ownerId));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.owners.archive(
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
    const reply = await this.owners.restore(
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
    const reply = await this.owners.setState(
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
    const reply = await this.owners.bindCanonical(
      requesterOf(request),
      parsePathParam(op.bind, 'id', id),
      parseBody<CanonicalBindingRequest>(op.bind, body),
    );
    return writeReply(response, reply);
  }
}
