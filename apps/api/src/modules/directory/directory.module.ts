import { Module } from '@nestjs/common';
import { AUTH_CONFIG, type AuthConfig } from '../auth/auth-config.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditWriter } from '../../infrastructure/write/audit-writer.js';
import { CursorCodec } from '../../infrastructure/write/cursor.js';
import { WriteExecutor } from '../../infrastructure/write/write-executor.js';
import { AgenciesController } from './agencies.controller.js';
import { AgenciesService } from './agencies.service.js';
import { LegalSubjectsController } from './legal-subjects.controller.js';
import { LegalSubjectsService } from './legal-subjects.service.js';
import { OwnerSubjectsController } from './owner-subjects.controller.js';
import { OwnerSubjectsService } from './owner-subjects.service.js';
import { OwnersController } from './owners.controller.js';
import { OwnersService } from './owners.service.js';
import { SignersController } from './signers.controller.js';
import { SignersService } from './signers.service.js';

/**
 * P2 Directory: Agency, Owner, LegalSubject, OwnerSubject and Signer records. Directory records are
 * administrative data: none of them grants legal authority, satisfies G1–G7, signs or sends
 * anything, and a Signer record is never an application User. Canonical-binding operations are not
 * routed until SourceReference authoring exists (decision D2).
 */
@Module({
  imports: [AuthModule],
  controllers: [
    AgenciesController,
    OwnersController,
    OwnerSubjectsController,
    LegalSubjectsController,
    SignersController,
  ],
  providers: [
    AuditWriter,
    WriteExecutor,
    {
      provide: CursorCodec,
      useFactory: (config: AuthConfig) => new CursorCodec(config.sessionSecret),
      inject: [AUTH_CONFIG],
    },
    AgenciesService,
    OwnersService,
    OwnerSubjectsService,
    LegalSubjectsService,
    SignersService,
  ],
})
export class DirectoryModule {}
