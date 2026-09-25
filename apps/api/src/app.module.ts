import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { ApiExceptionFilter } from './infrastructure/http/api-exception.filter.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CasesModule } from './modules/cases/cases.module.js';
import { CorrespondenceModule } from './modules/correspondence/correspondence.module.js';
import { DirectoryModule } from './modules/directory/directory.module.js';
import { RepresentationModule } from './modules/representation/representation.module.js';
import { SourcesModule } from './modules/sources/sources.module.js';
import { HealthModule } from './modules/health/health.module.js';

// P1: health + local authentication (login/session/logout) behind a secure-by-default global guard.
// P2: the Directory (Agency, Owner, LegalSubject, OwnerSubject, Signer) behind the same guard.
// P3A: SourceReference registry, canonical bindings and Route. P3B: Mandate, MandateVersion,
// MandateCoverage, CoverageSigner and AuthorityEvent. P4A: Case, CaseSource and
// CaseAuthoritySelection. P4B: reported items, case works, use mappings and case facts. P4C:
// correspondence capture and case bindings (records only; nothing is sent). No production,
// prompt, candidate, validation, assessment, readiness, signing or sending endpoints.
@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    AuthModule,
    DirectoryModule,
    SourcesModule,
    RepresentationModule,
    CasesModule,
    CorrespondenceModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
