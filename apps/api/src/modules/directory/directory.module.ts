import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
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
 * Directory: Agency, Owner, LegalSubject, OwnerSubject and Signer records (P2) and their canonical
 * bindings (P3A). Directory records are administrative data: none of them grants legal authority,
 * satisfies G1–G7, signs or sends anything, and a Signer record is never an application User. A
 * canonical binding records the source that holds a record's canonical code; it establishes no
 * rights, authority or eligibility.
 */
@Module({
  imports: [WriteModule],
  controllers: [
    AgenciesController,
    OwnersController,
    OwnerSubjectsController,
    LegalSubjectsController,
    SignersController,
  ],
  providers: [
    AgenciesService,
    OwnersService,
    OwnerSubjectsService,
    LegalSubjectsService,
    SignersService,
  ],
})
export class DirectoryModule {}
