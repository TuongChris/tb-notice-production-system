import { Injectable, Logger } from '@nestjs/common';
import type { HealthStatus } from '@tb/contracts';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

const DATABASE_CHECK_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Bounded database connectivity query. Any failure or timeout is reported as unavailable. */
  async check(): Promise<HealthStatus> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('database check timed out')),
        DATABASE_CHECK_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return 'ok';
    } catch (error) {
      // Redacted internal log: error class/code only, never connection strings or credentials.
      const code = (error as { code?: unknown }).code;
      this.logger.warn(
        `Database health check failed (${error instanceof Error ? error.name : 'Error'}${
          typeof code === 'string' ? ` ${code}` : ''
        }).`,
      );
      return 'unavailable';
    } finally {
      clearTimeout(timer);
    }
  }
}
