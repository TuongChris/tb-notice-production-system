import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { ExportUnsigned } from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
} from '../../infrastructure/write/request-parsing.js';
import { requesterOf, resourceReply, writeReply } from '../directory/directory-http.js';
import { ReadinessService } from './readiness.service.js';

const op = {
  readiness: contractOperation('getCandidateReadiness'),
  export: contractOperation('exportUnsignedCandidate'),
};

/**
 * Readiness and the unsigned export (P4I; ADR-0011): GET derives the candidate's readiness from the
 * current captured records (read-only; never stored); POST prepares the unsigned text handoff of a
 * candidate that is READY_FOR_SIGNER now (Idempotency-Key; the expected artifact, digest and run in
 * the body are the precondition). READY_FOR_SIGNER means ready for authorized human signer review:
 * nothing here signs, adopts, sends or submits anything, and no G7 exists in the application.
 */
@Controller('candidates')
export class CandidateReadinessController {
  constructor(private readonly service: ReadinessService) {}

  @Get(':candidateId/readiness')
  async readiness(@Param('candidateId') candidateId: string, @Req() request: HttpRequest) {
    const id = parsePathParam(op.readiness, 'candidateId', candidateId);
    return resourceReply(request, await this.service.readiness(id));
  }

  @Post(':candidateId/unsigned-exports')
  @HttpCode(200)
  async export(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    // Every API response is no-store (request-middleware.ts); the handoff states it once more.
    response.setHeader('Cache-Control', 'no-store');
    const reply = await this.service.exportUnsigned(
      requesterOf(request),
      parsePathParam(op.export, 'candidateId', candidateId),
      parseBody<ExportUnsigned>(op.export, body),
    );
    return writeReply(response, reply);
  }
}
