import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
import {
  CANDIDATE_WRITE_OBSERVER,
  NO_CANDIDATE_WRITE_OBSERVER,
} from './candidate-write-observer.js';
import { CandidatesController, CaseCandidatesController } from './candidates.controller.js';
import { CandidatesService } from './candidates.service.js';

/**
 * Notice candidates (P4F): the five contracted operations importCandidate, listCaseCandidates,
 * getCandidate, reviseCandidate and supersedeCandidate. A candidate is the exact unsigned draft
 * artifact drafted outside the application from one prompt snapshot, stored with its hashes for
 * later validation and human review. No AI provider, network, mail or Drive client exists here; no
 * validation run, assessment, readiness, G1–G7, READY_FOR_SIGNER, export, signature, sending or
 * retraction code exists.
 */
@Module({
  imports: [WriteModule],
  controllers: [CaseCandidatesController, CandidatesController],
  providers: [
    CandidatesService,
    { provide: CANDIDATE_WRITE_OBSERVER, useValue: NO_CANDIDATE_WRITE_OBSERVER },
  ],
})
export class CandidatesModule {}
