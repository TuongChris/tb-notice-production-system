import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
import { SourcesController } from './sources.controller.js';
import { SourcesService } from './sources.service.js';

/**
 * Source registry (P3A): SourceReference capture metadata and revision chains. The canonical
 * evidence stays in Google Drive; the app stores pointers, capture metadata, supplied hashes and
 * provenance/scope/history fields, and never fetches, uploads or edits the source.
 */
@Module({
  imports: [WriteModule],
  controllers: [SourcesController],
  providers: [SourcesService],
})
export class SourcesModule {}
