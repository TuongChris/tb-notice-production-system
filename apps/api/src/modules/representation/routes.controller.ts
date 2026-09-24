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
  CreateRoute,
  LinkStateRequest,
  PatchRoute,
} from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { entityReply, pageReply, requesterOf, writeReply } from '../directory/directory-http.js';
import { RoutesService } from './routes.service.js';

const op = {
  list: contractOperation('listRoutes'),
  create: contractOperation('createRoute'),
  get: contractOperation('getRoute'),
  patch: contractOperation('patchRoute'),
  delete: contractOperation('deleteUnusedRoute'),
  archive: contractOperation('archiveRoute'),
  restore: contractOperation('restoreRoute'),
  bind: contractOperation('bindCanonicalRoute'),
  linkState: contractOperation('setRouteLinkState'),
};

/**
 * Route operations of TB-SCHEMA-API-v1: the operational path Agency + OwnerSubject + Platform.
 * A route is a relationship record; it grants no authority, mandate, coverage or eligibility.
 */
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  async list(@Query() query: unknown, @Req() request: HttpRequest) {
    return pageReply(request, await this.routes.list(parseQuery(op.list, query)));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.routes.create(
      requesterOf(request),
      parseBody<CreateRoute>(op.create, body),
    );
    return writeReply(response, reply);
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.routes.get(parsePathParam(op.get, 'id', id));
    return entityReply(request, response, 'Route', data);
  }

  @Patch(':id')
  @HttpCode(200)
  async patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.routes.patch(
      requesterOf(request),
      parsePathParam(op.patch, 'id', id),
      parseBody<PatchRoute>(op.patch, body),
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
    const routeId = parsePathParam(op.delete, 'id', id);
    parseBody(op.delete, body);
    return writeReply(response, await this.routes.delete(requesterOf(request), routeId));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.routes.archive(
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
    const reply = await this.routes.restore(
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
    const reply = await this.routes.bindCanonical(
      requesterOf(request),
      parsePathParam(op.bind, 'id', id),
      parseBody<CanonicalBindingRequest>(op.bind, body),
    );
    return writeReply(response, reply);
  }

  @Post(':id/link-state')
  @HttpCode(200)
  async setLinkState(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.routes.setLinkState(
      requesterOf(request),
      parsePathParam(op.linkState, 'id', id),
      parseBody<LinkStateRequest>(op.linkState, body),
    );
    return writeReply(response, reply);
  }
}
