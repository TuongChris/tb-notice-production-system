import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { ArchiveRequest, CreateCoverage, PatchMandateVersion } from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { entityReply, pageReply, requesterOf, writeReply } from '../directory/directory-http.js';
import { CoveragesService } from './coverages.service.js';
import { MandateVersionsService } from './mandate-versions.service.js';

const op = {
  get: contractOperation('getMandateVersion'),
  patch: contractOperation('patchDraftMandateVersion'),
  freeze: contractOperation('freezeMandateVersion'),
  listCoverages: contractOperation('listVersionCoverages'),
  createCoverage: contractOperation('createCoverage'),
};

/**
 * MandateVersion operations and the coverages nested under a version. Freezing makes the record
 * immutable; it is not a signature, legal approval, G1 decision or notice adoption.
 */
@Controller('mandate-versions')
export class MandateVersionsController {
  constructor(
    private readonly versions: MandateVersionsService,
    private readonly coverages: CoveragesService,
  ) {}

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.versions.get(parsePathParam(op.get, 'id', id));
    return entityReply(request, response, 'MandateVersion', data);
  }

  @Patch(':id')
  @HttpCode(200)
  async patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.versions.patch(
      requesterOf(request),
      parsePathParam(op.patch, 'id', id),
      parseBody<PatchMandateVersion>(op.patch, body),
    );
    return writeReply(response, reply);
  }

  @Post(':id/freeze')
  @HttpCode(200)
  async freeze(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.versions.freeze(
      requesterOf(request),
      parsePathParam(op.freeze, 'id', id),
      parseBody<ArchiveRequest>(op.freeze, body),
    );
    return writeReply(response, reply);
  }

  @Get(':versionId/coverages')
  async listCoverages(
    @Param('versionId') versionId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.listCoverages, 'versionId', versionId);
    return pageReply(request, await this.coverages.list(id, parseQuery(op.listCoverages, query)));
  }

  @Post(':versionId/coverages')
  @HttpCode(201)
  async createCoverage(
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.coverages.create(
      requesterOf(request),
      parsePathParam(op.createCoverage, 'versionId', versionId),
      parseBody<CreateCoverage>(op.createCoverage, body),
    );
    return writeReply(response, reply);
  }
}
