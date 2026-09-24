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
  CreateLegalSubject,
  PatchLegalSubject,
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
import { LegalSubjectsService } from './legal-subjects.service.js';

const op = {
  list: contractOperation('listLegalSubjects'),
  create: contractOperation('createLegalSubject'),
  get: contractOperation('getLegalSubject'),
  patch: contractOperation('patchLegalSubject'),
  delete: contractOperation('deleteUnusedLegalSubject'),
  archive: contractOperation('archiveLegalSubject'),
  restore: contractOperation('restoreLegalSubject'),
  state: contractOperation('setLegalSubjectState'),
};

/**
 * LegalSubject operations of TB-SCHEMA-API-v1 except `bindCanonicalLegalSubject` (needs a SourceReference that
 * cannot be authored before the Source phase — decision D2 — so it is not routed).
 */
@Controller('legal-subjects')
export class LegalSubjectsController {
  constructor(private readonly legalSubjects: LegalSubjectsService) {}

  @Get()
  async list(@Query() query: unknown, @Req() request: HttpRequest) {
    return pageReply(request, await this.legalSubjects.list(parseQuery(op.list, query)));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.legalSubjects.create(
      requesterOf(request),
      parseBody<CreateLegalSubject>(op.create, body),
    );
    return writeReply(response, reply);
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.legalSubjects.get(parsePathParam(op.get, 'id', id));
    return entityReply(request, response, 'LegalSubject', data);
  }

  @Patch(':id')
  @HttpCode(200)
  async patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.legalSubjects.patch(
      requesterOf(request),
      parsePathParam(op.patch, 'id', id),
      parseBody<PatchLegalSubject>(op.patch, body),
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
    const subjectId = parsePathParam(op.delete, 'id', id);
    parseBody(op.delete, body);
    return writeReply(response, await this.legalSubjects.delete(requesterOf(request), subjectId));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.legalSubjects.archive(
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
    const reply = await this.legalSubjects.restore(
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
    const reply = await this.legalSubjects.setState(
      requesterOf(request),
      parsePathParam(op.state, 'id', id),
      parseBody<RecordStateRequest>(op.state, body),
    );
    return writeReply(response, reply);
  }
}
