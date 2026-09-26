import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { ValidateCandidate } from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { pageReply, requesterOf, writeReply } from '../directory/directory-http.js';
import { ValidationService } from './validation.service.js';

const op = {
  validate: contractOperation('validateCandidate'),
  runs: contractOperation('listValidationRuns'),
  issues: contractOperation('listValidationIssues'),
};

/**
 * Technical validation runs of one candidate (P4G): POST records one run of the technical ruleset
 * over exactly this candidate's artifact against the current context of its prompt's scope
 * (Idempotency-Key; no If-Match — the expected artifact SHA-256 and dependency digest in the body
 * are the precondition); GET lists the candidate's runs as summaries. A run is a technical result
 * only: no G1–G6 review, approval, readiness, signature or sending.
 */
@Controller('candidates')
export class CandidateValidationController {
  constructor(private readonly validation: ValidationService) {}

  @Post(':candidateId/validation-runs')
  @HttpCode(201)
  async validate(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.validation.validate(
      requesterOf(request),
      parsePathParam(op.validate, 'candidateId', candidateId),
      parseBody<ValidateCandidate>(op.validate, body),
    );
    return writeReply(response, reply);
  }

  @Get(':candidateId/validation-runs')
  async list(
    @Param('candidateId') candidateId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.runs, 'candidateId', candidateId);
    return pageReply(request, await this.validation.listRuns(id, parseQuery(op.runs, query)));
  }
}

/** The issues of one validation run, in the order the ruleset reported them (read-only). */
@Controller('validation-runs')
export class ValidationRunsController {
  constructor(private readonly validation: ValidationService) {}

  @Get(':id/issues')
  async issues(@Param('id') id: string, @Query() query: unknown, @Req() request: HttpRequest) {
    const runId = parsePathParam(op.issues, 'id', id);
    return pageReply(
      request,
      await this.validation.listIssues(runId, parseQuery(op.issues, query)),
    );
  }
}
