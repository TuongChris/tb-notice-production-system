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
import type { CreateCoverageSigner, PatchCoverage } from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { entityReply, pageReply, requesterOf, writeReply } from '../directory/directory-http.js';
import { CoverageSignersService } from './coverage-signers.service.js';
import { CoveragesService } from './coverages.service.js';

const op = {
  get: contractOperation('getCoverage'),
  patch: contractOperation('patchDraftCoverage'),
  listSigners: contractOperation('listCoverageSigners'),
  createSigner: contractOperation('createCoverageSigner'),
  getSigner: contractOperation('getCoverageSigner'),
  deleteSigner: contractOperation('deleteDraftCoverageSigner'),
};

/**
 * MandateCoverage operations and the signers recorded under a coverage. A coverage is documented
 * scope, not a G1 decision; a coverage signer is an association, not G7 or a signature.
 */
@Controller('coverages')
export class CoveragesController {
  constructor(
    private readonly coverages: CoveragesService,
    private readonly signers: CoverageSignersService,
  ) {}

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.coverages.get(parsePathParam(op.get, 'id', id));
    return entityReply(request, response, 'MandateCoverage', data);
  }

  @Patch(':id')
  @HttpCode(200)
  async patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.coverages.patch(
      requesterOf(request),
      parsePathParam(op.patch, 'id', id),
      parseBody<PatchCoverage>(op.patch, body),
    );
    return writeReply(response, reply);
  }

  @Get(':coverageId/signers')
  async listSigners(
    @Param('coverageId') coverageId: string,
    @Query() query: unknown,
    @Req() request: HttpRequest,
  ) {
    const id = parsePathParam(op.listSigners, 'coverageId', coverageId);
    return pageReply(request, await this.signers.list(id, parseQuery(op.listSigners, query)));
  }

  @Post(':coverageId/signers')
  @HttpCode(201)
  async createSigner(
    @Param('coverageId') coverageId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.signers.create(
      requesterOf(request),
      parsePathParam(op.createSigner, 'coverageId', coverageId),
      parseBody<CreateCoverageSigner>(op.createSigner, body),
    );
    return writeReply(response, reply);
  }
}

/** A coverage signer by id: read, or removed while its version is a draft. */
@Controller('coverage-signers')
export class CoverageSignersController {
  constructor(private readonly signers: CoverageSignersService) {}

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.signers.get(parsePathParam(op.getSigner, 'id', id));
    return entityReply(request, response, 'CoverageSigner', data);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const signerId = parsePathParam(op.deleteSigner, 'id', id);
    parseBody(op.deleteSigner, body);
    return writeReply(response, await this.signers.delete(requesterOf(request), signerId));
  }
}
