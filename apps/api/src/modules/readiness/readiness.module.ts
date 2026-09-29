import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NO_READINESS_OBSERVER, READINESS_OBSERVER } from './readiness-observer.js';
import { CandidateReadinessController } from './readiness.controller.js';
import { ReadinessService } from './readiness.service.js';

/**
 * Readiness and the unsigned export (P4I; ADR-0011, accepted by the operator with the independent
 * review deferred): the contracted operations getCandidateReadiness and exportUnsignedCandidate.
 * READY_FOR_SIGNER is derived on every read and every export (never stored) and means ready for
 * authorized human signer review only. No AI provider, network, mail, platform or Drive
 * client exists here; no signature, adoption, sending, submission or G7 code exists.
 */
@Module({
  // AuthModule provides the clock: readiness is evaluated at the current instant.
  imports: [WriteModule, AuthModule],
  controllers: [CandidateReadinessController],
  providers: [ReadinessService, { provide: READINESS_OBSERVER, useValue: NO_READINESS_OBSERVER }],
})
export class ReadinessModule {}
