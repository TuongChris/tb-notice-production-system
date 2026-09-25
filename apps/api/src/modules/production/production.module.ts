import { Module } from '@nestjs/common';
import { CONTEXT_READ_OBSERVER, NO_CONTEXT_READ_OBSERVER } from './context-read-observer.js';
import { ProductionContextController } from './production-context.controller.js';
import { ProductionContextService } from './production-context.service.js';

/**
 * Production context (P4D): the one contracted read getProductionContext — the case's recorded,
 * scoped input for a later production step, assembled from one consistent snapshot. Read-only; it
 * imports no write layer. No prompt, PromptSnapshot, candidate, validation, assessment, readiness,
 * G1–G7, READY_FOR_SIGNER, export, signature, sending, mailbox, Drive or AI-provider code exists.
 */
@Module({
  controllers: [ProductionContextController],
  providers: [
    ProductionContextService,
    { provide: CONTEXT_READ_OBSERVER, useValue: NO_CONTEXT_READ_OBSERVER },
  ],
})
export class ProductionModule {}
