import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { ApiExceptionFilter } from './infrastructure/http/api-exception.filter.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DirectoryModule } from './modules/directory/directory.module.js';
import { HealthModule } from './modules/health/health.module.js';

// P1: health + local authentication (login/session/logout) behind a secure-by-default global guard.
// P2: the Directory (Agency, Owner, LegalSubject, OwnerSubject, Signer) behind the same guard.
// No Route/Mandate/Case, production, signing or sending endpoints.
@Module({
  imports: [DatabaseModule, HealthModule, AuthModule, DirectoryModule],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
