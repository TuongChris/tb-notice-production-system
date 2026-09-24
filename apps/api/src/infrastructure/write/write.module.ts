import { Module } from '@nestjs/common';
import { AUTH_CONFIG, type AuthConfig } from '../../modules/auth/auth-config.js';
import { AuthModule } from '../../modules/auth/auth.module.js';
import { AuditWriter } from './audit-writer.js';
import { CursorCodec } from './cursor.js';
import { WriteExecutor } from './write-executor.js';

/**
 * The shared write layer of every contracted business operation (P2 directory, P3A sources and
 * representation): one WriteExecutor (idempotency, If-Match, transaction, audit, bounded retries),
 * one AuditWriter and one CursorCodec keyed from the session secret. Feature modules import this
 * module instead of declaring their own copies.
 */
@Module({
  imports: [AuthModule],
  providers: [
    AuditWriter,
    WriteExecutor,
    {
      provide: CursorCodec,
      useFactory: (config: AuthConfig) => new CursorCodec(config.sessionSecret),
      inject: [AUTH_CONFIG],
    },
  ],
  exports: [AuditWriter, WriteExecutor, CursorCodec],
})
export class WriteModule {}
