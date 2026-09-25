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
  BindCaseRoute,
  CanonicalBindingRequest,
  CaseWorkflowRequest,
  CreateCase,
  LinkCaseSource,
  LinkStateRequest,
  PatchCase,
  SelectAuthority,
} from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import {
  entityReply,
  pageReply,
  requesterOf,
  resourceReply,
  writeReply,
} from '../directory/directory-http.js';
import { CaseAuthorityService } from './case-authority.service.js';
import { CaseSourcesService } from './case-sources.service.js';
import { CasesService } from './cases.service.js';

const op = {
  list: contractOperation('listCases'),
  create: contractOperation('createCase'),
  get: contractOperation('getCase'),
  patch: contractOperation('patchCase'),
  delete: contractOperation('deleteUnusedCase'),
  archive: contractOperation('ArchiveCase'),
  restore: contractOperation('RestoreCase'),
  workflow: contractOperation('WorkflowCase'),
  routeBinding: contractOperation('RouteBindingCase'),
  canonicalBinding: contractOperation('CanonicalBindingCase'),
  listSources: contractOperation('listCaseSources'),
  linkSource: contractOperation('linkCaseSource'),
  getSource: contractOperation('getCaseSource'),
  setSourceLinkState: contractOperation('setCaseSourceLinkState'),
  select: contractOperation('selectCaseAuthority'),
  listSelections: contractOperation('listCaseAuthoritySelections'),
  getSelection: contractOperation('getCaseAuthoritySelection'),
};

/**
 * Case operations of TB-SCHEMA-API-v1 (P4A): the case record, its source links and its authority
 * selections, plus the read-back of one selection with the coverages it pinned
 * (getCaseAuthoritySelection, TB-SCHEMA-API-v1.1.0, ADR-0004). A case is the boundary of every
 * case-specific record; none of these operations is a legal finding, a G1–G7 decision, readiness, a
 * signature or an external action.
 */
@Controller('cases')
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly sources: CaseSourcesService,
    private readonly authority: CaseAuthorityService,
  ) {}

  @Get()
  async list(@Query() query: unknown, @Req() request: HttpRequest) {
    return pageReply(request, await this.cases.list(parseQuery(op.list, query)));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.cases.create(
      requesterOf(request),
      parseBody<CreateCase>(op.create, body),
    );
    return writeReply(response, reply);
  }

  @Get(':caseId')
  async get(
    @Param('caseId') caseId: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.cases.get(parsePathParam(op.get, 'caseId', caseId));
    return entityReply(request, response, 'CaseRecord', data);
  }

  @Patch(':caseId')
  @HttpCode(200)
  async patch(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.cases.patch(
      requesterOf(request),
      parsePathParam(op.patch, 'caseId', caseId),
      parseBody<PatchCase>(op.patch, body),
    );
    return writeReply(response, reply);
  }

  @Delete(':caseId')
  @HttpCode(204)
  async delete(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const id = parsePathParam(op.delete, 'caseId', caseId);
    parseBody(op.delete, body);
    return writeReply(response, await this.cases.delete(requesterOf(request), id));
  }

  @Post(':caseId/archive')
  @HttpCode(200)
  async archive(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.cases.archive(
      requesterOf(request),
      parsePathParam(op.archive, 'caseId', caseId),
      parseBody<ArchiveRequest>(op.archive, body),
    );
    return writeReply(response, reply);
  }

  @Post(':caseId/restore')
  @HttpCode(200)
  async restore(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.cases.restore(
      requesterOf(request),
      parsePathParam(op.restore, 'caseId', caseId),
      parseBody<ArchiveRequest>(op.restore, body),
    );
    return writeReply(response, reply);
  }

  @Post(':caseId/workflow')
  @HttpCode(200)
  async workflow(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.cases.setWorkflow(
      requesterOf(request),
      parsePathParam(op.workflow, 'caseId', caseId),
      parseBody<CaseWorkflowRequest>(op.workflow, body),
    );
    return writeReply(response, reply);
  }

  @Post(':caseId/route-binding')
  @HttpCode(200)
  async routeBinding(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.cases.bindRoute(
      requesterOf(request),
      parsePathParam(op.routeBinding, 'caseId', caseId),
      parseBody<BindCaseRoute>(op.routeBinding, body),
    );
    return writeReply(response, reply);
  }

  @Post(':caseId/canonical-binding')
  @HttpCode(200)
  async canonicalBinding(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.cases.bindCanonical(
      requesterOf(request),
      parsePathParam(op.canonicalBinding, 'caseId', caseId),
      parseBody<CanonicalBindingRequest>(op.canonicalBinding, body),
    );
    return writeReply(response, reply);
  }

  @Get(':caseId/sources')
  async listSources(
    @Param('caseId') caseId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.listSources, 'caseId', caseId);
    return pageReply(request, await this.sources.list(id, parseQuery(op.listSources, query)));
  }

  @Post(':caseId/sources')
  @HttpCode(201)
  async linkSource(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.sources.link(
      requesterOf(request),
      parsePathParam(op.linkSource, 'caseId', caseId),
      parseBody<LinkCaseSource>(op.linkSource, body),
    );
    return writeReply(response, reply);
  }

  @Get(':caseId/authority-selections')
  async listSelections(
    @Param('caseId') caseId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.listSelections, 'caseId', caseId);
    return pageReply(request, await this.authority.list(id, parseQuery(op.listSelections, query)));
  }

  /** One selection of this case with its pinned coverage rows, as stored (no ETag: append-only). */
  @Get(':caseId/authority-selections/:id')
  async getSelection(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Req() request: HttpRequest,
  ) {
    const data = await this.authority.get(
      parsePathParam(op.getSelection, 'caseId', caseId),
      parsePathParam(op.getSelection, 'id', id),
    );
    return resourceReply(request, data);
  }

  @Post(':caseId/authority-selections')
  @HttpCode(201)
  async select(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.authority.select(
      requesterOf(request),
      parsePathParam(op.select, 'caseId', caseId),
      parseBody<SelectAuthority>(op.select, body),
    );
    return writeReply(response, reply);
  }
}

/** A case's source links by their own id (GET and the link-state command). */
@Controller('case-sources')
export class CaseSourcesController {
  constructor(private readonly sources: CaseSourcesService) {}

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.sources.get(parsePathParam(op.getSource, 'id', id));
    return entityReply(request, response, 'CaseSource', data);
  }

  @Post(':id/link-state')
  @HttpCode(200)
  async setLinkState(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.sources.setLinkState(
      requesterOf(request),
      parsePathParam(op.setSourceLinkState, 'id', id),
      parseBody<LinkStateRequest>(op.setSourceLinkState, body),
    );
    return writeReply(response, reply);
  }
}
