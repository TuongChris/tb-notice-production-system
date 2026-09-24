import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
import { RoutesController } from './routes.controller.js';
import { RoutesService } from './routes.service.js';

/**
 * Representation (P3A part): Route, the operational path Agency + OwnerSubject + Platform. Mandate,
 * MandateVersion, MandateCoverage, CoverageSigner and AuthorityEvent are P3B and not routed here.
 */
@Module({
  imports: [WriteModule],
  controllers: [RoutesController],
  providers: [RoutesService],
})
export class RepresentationModule {}
