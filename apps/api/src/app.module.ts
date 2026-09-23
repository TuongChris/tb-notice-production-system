import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { ApiExceptionFilter } from './infrastructure/http/api-exception.filter.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';

// P1: health + local authentication (login/session/logout) behind a secure-by-default global guard.
// No business CRUD, production, signing or sending endpoints.
@Module({
  imports: [DatabaseModule, HealthModule, AuthModule],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
