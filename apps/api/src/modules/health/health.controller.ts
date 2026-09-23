import { randomUUID } from 'node:crypto';
import { Controller, Get, Header, Req } from '@nestjs/common';
import type { GetHealthResponse } from '@tb/contracts';
import type { HttpRequest } from '../../infrastructure/http/http-types.js';
import { PublicRoute } from '../auth/public-route.decorator.js';
import { HealthService } from './health.service.js';

/**
 * GET /api/v1/health — frozen contract `getHealth`: public, 200 with `{ data: Health, meta }`.
 * An unavailable database is reported as `status: "unavailable"` (the only documented shape);
 * it is never reported as ok. No undocumented fields are added.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @PublicRoute()
  @Header('Cache-Control', 'no-store')
  async getHealth(@Req() request: HttpRequest): Promise<GetHealthResponse> {
    const status = await this.health.check();
    return {
      data: { status },
      meta: { requestId: request.requestId ?? randomUUID(), affectedResources: [] },
    };
  }
}
