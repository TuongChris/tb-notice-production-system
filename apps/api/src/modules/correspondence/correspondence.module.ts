import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
import { CorrespondenceBindingsService } from './correspondence-bindings.service.js';
import {
  CaseCorrespondenceController,
  CorrespondenceController,
} from './correspondence.controller.js';
import { CorrespondenceService } from './correspondence.service.js';

/**
 * Correspondence (P4C): captured communications of an agency's mailbox, stored exactly as supplied,
 * and their explicit, append-only case bindings. Capture and binding are records only — no mailbox
 * connector, SMTP, IMAP, sending, reply, read marking, uploader contact, submission, retraction,
 * Drive write or other external action exists, and nothing computes G1–G7 or readiness.
 */
@Module({
  imports: [WriteModule],
  controllers: [CorrespondenceController, CaseCorrespondenceController],
  providers: [CorrespondenceService, CorrespondenceBindingsService],
})
export class CorrespondenceModule {}
