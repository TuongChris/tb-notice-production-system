import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
import {
  NO_PROMPT_GENERATION_OBSERVER,
  PROMPT_GENERATION_OBSERVER,
} from './prompt-generation-observer.js';
import { CasePromptsController, PromptsController } from './prompts.controller.js';
import { PromptsService } from './prompts.service.js';

/**
 * Prompt snapshots (P4E): the three contracted operations generatePrompt, listCasePrompts and
 * getPrompt. A prompt is rendered locally and deterministically from one exact production context
 * (the P4D reader and assembly, reused unchanged) and frozen with it in an immutable snapshot. No AI
 * provider, network, mail or Drive client exists here; no NoticeCandidate, validation, assessment,
 * readiness, G1–G7, READY_FOR_SIGNER, export, signature or sending code exists.
 */
@Module({
  imports: [WriteModule],
  controllers: [CasePromptsController, PromptsController],
  providers: [
    PromptsService,
    { provide: PROMPT_GENERATION_OBSERVER, useValue: NO_PROMPT_GENERATION_OBSERVER },
  ],
})
export class PromptsModule {}
