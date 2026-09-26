import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { ArchiveRequest, CreateCandidate, ReviseCandidate } from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { pageReply, requesterOf, resourceReply, writeReply } from '../directory/directory-http.js';
import { CandidatesService } from './candidates.service.js';

const op = {
  import: contractOperation('importCandidate'),
  list: contractOperation('listCaseCandidates'),
  get: contractOperation('getCandidate'),
  revise: contractOperation('reviseCandidate'),
  supersede: contractOperation('supersedeCandidate'),
};

/**
 * Notice candidates of one case (P4F): POST stores one unsigned draft artifact drafted outside the
 * application from one prompt snapshot of this case (Idempotency-Key; no If-Match — none is
 * contracted); GET lists the case's candidates as summaries. Storing a candidate drafts, validates,
 * approves, decides G1–G7 or readiness, signs, sends and calls nothing.
 */
@Controller('cases')
export class CaseCandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Post(':caseId/candidates')
  @HttpCode(201)
  async import(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.candidates.import(
      requesterOf(request),
      parsePathParam(op.import, 'caseId', caseId),
      parseBody<CreateCandidate>(op.import, body),
    );
    return writeReply(response, reply);
  }

  @Get(':caseId/candidates')
  async list(
    @Param('caseId') caseId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.list, 'caseId', caseId);
    return pageReply(request, await this.candidates.list(id, parseQuery(op.list, query)));
  }
}

/**
 * One candidate by id, exactly as stored (no ETag: its content never changes); a revision (a new
 * candidate, the revised one untouched) and the dedicated supersession (internal artifact lifecycle
 * only — never a retraction of anything sent).
 */
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: HttpRequest) {
    return resourceReply(request, await this.candidates.get(parsePathParam(op.get, 'id', id)));
  }

  @Post(':id/revisions')
  @HttpCode(201)
  async revise(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.candidates.revise(
      requesterOf(request),
      parsePathParam(op.revise, 'id', id),
      parseBody<ReviseCandidate>(op.revise, body),
    );
    return writeReply(response, reply);
  }

  @Post(':id/supersede')
  @HttpCode(200)
  async supersede(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.candidates.supersede(
      requesterOf(request),
      parsePathParam(op.supersede, 'id', id),
      parseBody<ArchiveRequest>(op.supersede, body),
    );
    return writeReply(response, reply);
  }
}
