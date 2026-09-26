import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { GeneratePrompt } from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { pageReply, requesterOf, resourceReply, writeReply } from '../directory/directory-http.js';
import { PromptsService } from './prompts.service.js';

const op = {
  generate: contractOperation('generatePrompt'),
  list: contractOperation('listCasePrompts'),
  get: contractOperation('getPrompt'),
};

/**
 * Prompt snapshots of one case (P4E): POST generates one immutable snapshot from exactly the context
 * revision and dependency digest the caller reviewed (Idempotency-Key; no If-Match — none is
 * contracted); GET lists the case's snapshots as summaries. A prompt is input for a later drafting
 * step: nothing here drafts, calls an AI provider, approves, decides G1–G7 or readiness, signs,
 * sends or takes any external action.
 */
@Controller('cases')
export class CasePromptsController {
  constructor(private readonly prompts: PromptsService) {}

  @Post(':caseId/prompts')
  @HttpCode(201)
  async generate(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.prompts.generate(
      requesterOf(request),
      parsePathParam(op.generate, 'caseId', caseId),
      parseBody<GeneratePrompt>(op.generate, body),
    );
    return writeReply(response, reply);
  }

  @Get(':caseId/prompts')
  async list(
    @Param('caseId') caseId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.list, 'caseId', caseId);
    return pageReply(request, await this.prompts.list(id, parseQuery(op.list, query)));
  }
}

/** One prompt snapshot by id, exactly as stored (no ETag: it never changes). */
@Controller('prompts')
export class PromptsController {
  constructor(private readonly prompts: PromptsService) {}

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: HttpRequest) {
    return resourceReply(request, await this.prompts.get(parsePathParam(op.get, 'id', id)));
  }
}
