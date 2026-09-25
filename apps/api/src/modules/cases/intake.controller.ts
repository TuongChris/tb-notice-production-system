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
import type {
  ArchiveRequest,
  CreateCaseWork,
  CreateFact,
  CreateReportedItem,
  CreateUseMapping,
  PatchCaseWork,
  PatchReportedItem,
  PatchUseMapping,
  ReviseFact,
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
import { CaseFactsService } from './case-facts.service.js';
import { CaseWorksService } from './case-works.service.js';
import { ReportedItemsService } from './reported-items.service.js';
import { UseMappingsService } from './use-mappings.service.js';

const op = {
  listItems: contractOperation('listCaseReportedItems'),
  createItem: contractOperation('createReportedItem'),
  getItem: contractOperation('getReportedItem'),
  patchItem: contractOperation('patchReportedItem'),
  archiveItem: contractOperation('archiveReportedItem'),
  restoreItem: contractOperation('restoreReportedItem'),
  listWorks: contractOperation('listCaseCaseWorks'),
  createWork: contractOperation('createCaseWork'),
  getWork: contractOperation('getCaseWork'),
  patchWork: contractOperation('patchCaseWork'),
  archiveWork: contractOperation('archiveCaseWork'),
  restoreWork: contractOperation('restoreCaseWork'),
  listMappings: contractOperation('listCaseUseMappings'),
  createMapping: contractOperation('createUseMapping'),
  getMapping: contractOperation('getUseMapping'),
  patchMapping: contractOperation('patchUseMapping'),
  archiveMapping: contractOperation('archiveUseMapping'),
  restoreMapping: contractOperation('restoreUseMapping'),
  listFacts: contractOperation('listCaseFacts'),
  createFact: contractOperation('createCaseFact'),
  getFact: contractOperation('getCaseFact'),
  reviseFact: contractOperation('reviseCaseFact'),
};

type Operation = (typeof op)[keyof typeof op];

/** The path's case and child ids, each validated with its contract schema (404 otherwise). */
function childPath(operation: Operation, caseId: string, id: string): [string, string] {
  return [parsePathParam(operation, 'caseId', caseId), parsePathParam(operation, 'id', id)];
}

/**
 * Case intake material of TB-SCHEMA-API-v1 (P4B): reported items, works, use mappings and case
 * facts under /cases/{caseId}. Every record is specific to the case of its path; none of these
 * operations is an infringement, ownership, permission or exception finding, a G1–G7 decision,
 * readiness, a notice, a signature or an external action.
 */
@Controller('cases')
export class CaseIntakeController {
  constructor(
    private readonly items: ReportedItemsService,
    private readonly works: CaseWorksService,
    private readonly mappings: UseMappingsService,
    private readonly facts: CaseFactsService,
  ) {}

  // ReportedItem ------------------------------------------------------------------------------

  @Get(':caseId/reported-items')
  async listItems(
    @Param('caseId') caseId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.listItems, 'caseId', caseId);
    return pageReply(request, await this.items.list(id, parseQuery(op.listItems, query)));
  }

  @Post(':caseId/reported-items')
  @HttpCode(201)
  async createItem(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.items.create(
      requesterOf(request),
      parsePathParam(op.createItem, 'caseId', caseId),
      parseBody<CreateReportedItem>(op.createItem, body),
    );
    return writeReply(response, reply);
  }

  @Get(':caseId/reported-items/:id')
  async getItem(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.items.get(...childPath(op.getItem, caseId, id));
    return entityReply(request, response, 'ReportedItem', data);
  }

  @Patch(':caseId/reported-items/:id')
  @HttpCode(200)
  async patchItem(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.items.patch(
      requesterOf(request),
      ...childPath(op.patchItem, caseId, id),
      parseBody<PatchReportedItem>(op.patchItem, body),
    );
    return writeReply(response, reply);
  }

  @Post(':caseId/reported-items/:id/archive')
  @HttpCode(200)
  async archiveItem(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.items.archive(
      requesterOf(request),
      ...childPath(op.archiveItem, caseId, id),
      parseBody<ArchiveRequest>(op.archiveItem, body),
    );
    return writeReply(response, reply);
  }

  @Post(':caseId/reported-items/:id/restore')
  @HttpCode(200)
  async restoreItem(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.items.restore(
      requesterOf(request),
      ...childPath(op.restoreItem, caseId, id),
      parseBody<ArchiveRequest>(op.restoreItem, body),
    );
    return writeReply(response, reply);
  }

  // CaseWork ----------------------------------------------------------------------------------

  @Get(':caseId/works')
  async listWorks(
    @Param('caseId') caseId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.listWorks, 'caseId', caseId);
    return pageReply(request, await this.works.list(id, parseQuery(op.listWorks, query)));
  }

  @Post(':caseId/works')
  @HttpCode(201)
  async createWork(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.works.create(
      requesterOf(request),
      parsePathParam(op.createWork, 'caseId', caseId),
      parseBody<CreateCaseWork>(op.createWork, body),
    );
    return writeReply(response, reply);
  }

  @Get(':caseId/works/:id')
  async getWork(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.works.get(...childPath(op.getWork, caseId, id));
    return entityReply(request, response, 'CaseWork', data);
  }

  @Patch(':caseId/works/:id')
  @HttpCode(200)
  async patchWork(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.works.patch(
      requesterOf(request),
      ...childPath(op.patchWork, caseId, id),
      parseBody<PatchCaseWork>(op.patchWork, body),
    );
    return writeReply(response, reply);
  }

  @Post(':caseId/works/:id/archive')
  @HttpCode(200)
  async archiveWork(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.works.archive(
      requesterOf(request),
      ...childPath(op.archiveWork, caseId, id),
      parseBody<ArchiveRequest>(op.archiveWork, body),
    );
    return writeReply(response, reply);
  }

  @Post(':caseId/works/:id/restore')
  @HttpCode(200)
  async restoreWork(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.works.restore(
      requesterOf(request),
      ...childPath(op.restoreWork, caseId, id),
      parseBody<ArchiveRequest>(op.restoreWork, body),
    );
    return writeReply(response, reply);
  }

  // UseMapping --------------------------------------------------------------------------------

  @Get(':caseId/mappings')
  async listMappings(
    @Param('caseId') caseId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.listMappings, 'caseId', caseId);
    return pageReply(request, await this.mappings.list(id, parseQuery(op.listMappings, query)));
  }

  @Post(':caseId/mappings')
  @HttpCode(201)
  async createMapping(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.mappings.create(
      requesterOf(request),
      parsePathParam(op.createMapping, 'caseId', caseId),
      parseBody<CreateUseMapping>(op.createMapping, body),
    );
    return writeReply(response, reply);
  }

  @Get(':caseId/mappings/:id')
  async getMapping(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.mappings.get(...childPath(op.getMapping, caseId, id));
    return entityReply(request, response, 'UseMapping', data);
  }

  @Patch(':caseId/mappings/:id')
  @HttpCode(200)
  async patchMapping(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.mappings.patch(
      requesterOf(request),
      ...childPath(op.patchMapping, caseId, id),
      parseBody<PatchUseMapping>(op.patchMapping, body),
    );
    return writeReply(response, reply);
  }

  @Post(':caseId/mappings/:id/archive')
  @HttpCode(200)
  async archiveMapping(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.mappings.archive(
      requesterOf(request),
      ...childPath(op.archiveMapping, caseId, id),
      parseBody<ArchiveRequest>(op.archiveMapping, body),
    );
    return writeReply(response, reply);
  }

  @Post(':caseId/mappings/:id/restore')
  @HttpCode(200)
  async restoreMapping(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.mappings.restore(
      requesterOf(request),
      ...childPath(op.restoreMapping, caseId, id),
      parseBody<ArchiveRequest>(op.restoreMapping, body),
    );
    return writeReply(response, reply);
  }

  // CaseFact ----------------------------------------------------------------------------------

  @Get(':caseId/facts')
  async listFacts(
    @Param('caseId') caseId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.listFacts, 'caseId', caseId);
    return pageReply(request, await this.facts.list(id, parseQuery(op.listFacts, query)));
  }

  @Post(':caseId/facts')
  @HttpCode(201)
  async createFact(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.facts.create(
      requesterOf(request),
      parsePathParam(op.createFact, 'caseId', caseId),
      parseBody<CreateFact>(op.createFact, body),
    );
    return writeReply(response, reply);
  }

  /** Any revision of one fact of this case (append-only: no ETag). */
  @Get(':caseId/facts/:id')
  async getFact(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Req() request: HttpRequest,
  ) {
    return resourceReply(request, await this.facts.get(...childPath(op.getFact, caseId, id)));
  }

  @Post(':caseId/facts/:id/revisions')
  @HttpCode(201)
  async reviseFact(
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.facts.revise(
      requesterOf(request),
      ...childPath(op.reviseFact, caseId, id),
      parseBody<ReviseFact>(op.reviseFact, body),
    );
    return writeReply(response, reply);
  }
}
