import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../../generated/prisma/client.js';
import { runtimePoolConfig } from './runtime-database-url.js';

/**
 * Runtime Prisma client (Prisma 7 driver adapter). The MariaDB Node driver is the official
 * Prisma adapter for MySQL connections; the server is MySQL 8.4. Connections are lazy, so the
 * API starts even when the database is down and health reports it as unavailable.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaMariaDb(runtimePoolConfig(process.env['DATABASE_URL'])) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
