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
import type { ArchiveRequest, CreateSigner, PatchSigner, SignerStateRequest } from '@tb/contracts';
import type { HttpRequest, HttpResponse } from '../../infrastructure/http/http-types.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../infrastructure/write/request-parsing.js';
import { entityReply, pageReply, requesterOf, writeReply } from './directory-http.js';
import { SignersService } from './signers.service.js';

const op = {
  list: contractOperation('listSigners'),
  create: contractOperation('createSigner'),
  get: contractOperation('getSigner'),
  patch: contractOperation('patchSigner'),
  delete: contractOperation('deleteUnusedSigner'),
  archive: contractOperation('archiveSigner'),
  restore: contractOperation('restoreSigner'),
  state: contractOperation('setSignerState'),
};

/**
 * Signer operations of TB-SCHEMA-API-v1 except `bindCanonicalSigner` (needs a SourceReference that
 * cannot be authored before the Source phase — decision D2 — so it is not routed).
 */
@Controller('signers')
export class SignersController {
  constructor(private readonly signers: SignersService) {}

  @Get()
  async list(@Query() query: unknown, @Req() request: HttpRequest) {
    return pageReply(request, await this.signers.list(parseQuery(op.list, query)));
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.signers.create(
      requesterOf(request),
      parseBody<CreateSigner>(op.create, body),
    );
    return writeReply(response, reply);
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const data = await this.signers.get(parsePathParam(op.get, 'id', id));
    return entityReply(request, response, 'Signer', data);
  }

  @Patch(':id')
  @HttpCode(200)
  async patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.signers.patch(
      requesterOf(request),
      parsePathParam(op.patch, 'id', id),
      parseBody<PatchSigner>(op.patch, body),
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
    const signerId = parsePathParam(op.delete, 'id', id);
    parseBody(op.delete, body);
    return writeReply(response, await this.signers.delete(requesterOf(request), signerId));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const reply = await this.signers.archive(
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
    const reply = await this.signers.restore(
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
    const reply = await this.signers.setState(
      requesterOf(request),
      parsePathParam(op.state, 'id', id),
      parseBody<SignerStateRequest>(op.state, body),
    );
    return writeReply(response, reply);
  }
}
