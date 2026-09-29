import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
import { AuditEventsController } from './audit-events.controller.js';
import { AuditEventsService } from './audit-events.service.js';

/**
 * The application audit history (R14-AUD-018): the contracted read listAuditEvents only. Audit
 * events are written by the business writes themselves (WriteExecutor, AuditWriter); nothing here
 * writes, changes or deletes one.
 */
@Module({
  // WriteModule provides the list cursor codec.
  imports: [WriteModule],
  controllers: [AuditEventsController],
  providers: [AuditEventsService],
})
export class AuditModule {}
