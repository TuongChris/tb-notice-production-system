import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { CaptureAssessment } from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { pageReply, requesterOf, resourceReply, writeReply } from '../directory/directory-http.js';
import { AssessmentsService } from './assessments.service.js';

const op = {
  capture: contractOperation('captureCandidateAssessment'),
  list: contractOperation('listCandidateAssessments'),
  sources: contractOperation('getCandidateAssessmentSources'),
};

/**
 * Candidate assessments (P4H): POST records one attributable G1–G6 review of exactly this
 * candidate's artifact at the current evaluation epoch (Idempotency-Key; no If-Match — the expected
 * artifact SHA-256 and dependency digest in the body are the precondition); GET lists the
 * candidate's assessments exactly as stored; GET …/{id}/sources reads back the exact support rows
 * recorded for one of them (getCandidateAssessmentSources, TB-SCHEMA-API-v1.4.0, ADR-0009). An
 * assessment is a recorded review only: no readiness, READY_FOR_SIGNER, G7, signature or sending.
 */
@Controller('candidates')
export class CandidateAssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Post(':candidateId/assessments')
  @HttpCode(201)
  async capture(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.assessments.capture(
      requesterOf(request),
      parsePathParam(op.capture, 'candidateId', candidateId),
      parseBody<CaptureAssessment>(op.capture, body),
    );
    return writeReply(response, reply);
  }

  @Get(':candidateId/assessments')
  async list(
    @Param('candidateId') candidateId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.list, 'candidateId', candidateId);
    return pageReply(request, await this.assessments.list(id, parseQuery(op.list, query)));
  }

  @Get(':candidateId/assessments/:id/sources')
  async sources(
    @Param('candidateId') candidateId: string,
    @Param('id') id: string,
    @Req() request: HttpRequest,
  ) {
    return resourceReply(
      request,
      await this.assessments.sources(
        parsePathParam(op.sources, 'candidateId', candidateId),
        parsePathParam(op.sources, 'id', id),
      ),
    );
  }
}
