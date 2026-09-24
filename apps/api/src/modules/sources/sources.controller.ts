import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { CreateSource, ReviseSource } from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { pageReply, requesterOf, resourceReply, writeReply } from '../directory/directory-http.js';
import { SourcesService } from './sources.service.js';

const op = {
  list: contractOperation('listSources'),
  create: contractOperation('createSource'),
  get: contractOperation('getSource'),
  revise: contractOperation('reviseSource'),
};

/**
 * SourceReference registry of TB-SCHEMA-API-v1: pointers with capture metadata, never evidence,
 * permission, authority or proof of review. Immutable: changes are new revisions.
 */
@Controller('sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  async list(@Query() query: unknown, @Req() request: HttpRequest) {
    return pageReply(request, await this.sources.list(parseQuery(op.list, query)));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.sources.create(
      requesterOf(request),
      parseBody<CreateSource>(op.create, body),
    );
    return writeReply(response, reply);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: HttpRequest) {
    return resourceReply(request, await this.sources.get(parsePathParam(op.get, 'id', id)));
  }

  @Post(':id/revisions')
  @HttpCode(201)
  async revise(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.sources.revise(
      requesterOf(request),
      parsePathParam(op.revise, 'id', id),
      parseBody<ReviseSource>(op.revise, body),
    );
    return writeReply(response, reply);
  }
}
