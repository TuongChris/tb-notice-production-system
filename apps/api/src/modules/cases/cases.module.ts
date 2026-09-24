import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
import { CaseAuthorityService } from './case-authority.service.js';
import { CaseSourcesService } from './case-sources.service.js';
import { CaseSourcesController, CasesController } from './cases.controller.js';
import { CasesService } from './cases.service.js';

/**
 * Cases (P4A): the case record (the boundary of every case-specific record), its explicit source
 * links and its append-only authority selections. A case source link is not proof, a canonical case
 * binding is an identity reference, and an authority selection pins the chain to evaluate for one
 * case — none of them is a G1–G7 decision, readiness, a signature or an external action, and nothing
 * transfers from one case to another.
 */
@Module({
  imports: [WriteModule],
  controllers: [CasesController, CaseSourcesController],
  providers: [CasesService, CaseSourcesService, CaseAuthorityService],
})
export class CasesModule {}
