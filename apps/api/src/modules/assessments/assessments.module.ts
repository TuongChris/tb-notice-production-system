import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
import {
  ASSESSMENT_WRITE_OBSERVER,
  NO_ASSESSMENT_WRITE_OBSERVER,
} from './assessment-write-observer.js';
import { CandidateAssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';

/**
 * Candidate assessments (P4H): the contracted operations captureCandidateAssessment and
 * listCandidateAssessments, and the read-back getCandidateAssessmentSources of one assessment's
 * stored support rows (TB-SCHEMA-API-v1.4.0, ADR-0009). An assessment records one attributable
 * G1–G6 review of one exact candidate artifact at one evaluation epoch (ADR-0008) — a record only.
 * No AI provider, network, mail or Drive client exists here; no readiness, READY_FOR_SIGNER,
 * unsigned export, waiver, disposition, signature or sending code exists.
 */
@Module({
  imports: [WriteModule],
  controllers: [CandidateAssessmentsController],
  providers: [
    AssessmentsService,
    { provide: ASSESSMENT_WRITE_OBSERVER, useValue: NO_ASSESSMENT_WRITE_OBSERVER },
  ],
})
export class AssessmentsModule {}
