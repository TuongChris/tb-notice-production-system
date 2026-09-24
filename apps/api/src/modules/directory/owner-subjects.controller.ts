import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { LinkOwnerSubject, LinkStateRequest } from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { entityReply, pageReply, requesterOf, writeReply } from './directory-http.js';
import { OwnerSubjectsService } from './owner-subjects.service.js';

const op = {
  list: contractOperation('listOwnerSubjects'),
  link: contractOperation('linkOwnerSubject'),
  get: contractOperation('getOwnerSubject'),
  linkState: contractOperation('setOwnerSubjectLinkState'),
};

/** The four OwnerSubject operations of TB-SCHEMA-API-v1 (decision D1). */
@Controller()
export class OwnerSubjectsController {
  constructor(private readonly ownerSubjects: OwnerSubjectsService) {}

  @Get('owners/:ownerId/subjects')
  async list(
    @Param('ownerId') ownerId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const owner = parsePathParam(op.list, 'ownerId', ownerId);
    return pageReply(request, await this.ownerSubjects.list(owner, parseQuery(op.list, query)));
  }

  @Post('owners/:ownerId/subjects')
  @HttpCode(201)
  async link(
    @Param('ownerId') ownerId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.ownerSubjects.link(
      requesterOf(request),
      parsePathParam(op.link, 'ownerId', ownerId),
      parseBody<LinkOwnerSubject>(op.link, body),
    );
    return writeReply(response, reply);
  }

  @Get('owner-subjects/:id')
  async get(
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.ownerSubjects.get(parsePathParam(op.get, 'id', id));
    return entityReply(request, response, 'OwnerSubject', data);
  }

  @Post('owner-subjects/:id/link-state')
  @HttpCode(200)
  async setLinkState(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.ownerSubjects.setLinkState(
      requesterOf(request),
      parsePathParam(op.linkState, 'id', id),
      parseBody<LinkStateRequest>(op.linkState, body),
    );
    return writeReply(response, reply);
  }
}
