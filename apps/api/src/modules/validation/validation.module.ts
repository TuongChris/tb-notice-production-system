import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
import { AuthModule } from '../auth/auth.module.js';
import {
  CandidateValidationController,
  ValidationRunsController,
} from './validation.controller.js';
import { NO_VALIDATION_OBSERVER, VALIDATION_OBSERVER } from './validation-observer.js';
import { ValidationService } from './validation.service.js';

/**
 * Technical validation (P4G): the three contracted operations validateCandidate,
 * listValidationRuns and listValidationIssues. A validation run is the technical ruleset's result
 * for one exact candidate artifact against the current production context of its prompt's scope —
 * a technical result only. No AI provider, network, mail or Drive client exists here; no
 * CandidateAssessment, G1–G6 review, readiness, READY_FOR_SIGNER, export, signature or sending code
 * exists.
 */
@Module({
  // AuthModule provides the clock: a run records when its evaluation started and completed.
  imports: [WriteModule, AuthModule],
  controllers: [CandidateValidationController, ValidationRunsController],
  providers: [
    ValidationService,
    { provide: VALIDATION_OBSERVER, useValue: NO_VALIDATION_OBSERVER },
  ],
})
export class ValidationModule {}
