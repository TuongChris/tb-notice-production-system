import { Module } from '@nestjs/common';
import { WriteModule } from '../../infrastructure/write/write.module.js';
import { AuthorityEventsService } from './authority-events.service.js';
import { CoverageSignersService } from './coverage-signers.service.js';
import { CoverageSignersController, CoveragesController } from './coverages.controller.js';
import { CoveragesService } from './coverages.service.js';
import { MandateVersionsController } from './mandate-versions.controller.js';
import { MandateVersionsService } from './mandate-versions.service.js';
import { MandatesController } from './mandates.controller.js';
import { MandatesService } from './mandates.service.js';
import { RoutesController } from './routes.controller.js';
import { RoutesService } from './routes.service.js';

/**
 * Representation: Route, the operational path Agency + OwnerSubject + Platform (P3A), and the
 * representation-authority records (P3B) — Mandate, MandateVersion, MandateCoverage, CoverageSigner
 * and AuthorityEvent. They are structured records of what cited sources support: none of them is
 * self-proving authority, a G1–G7 decision, readiness, a signature or an external action, and an
 * application User is never a Signer.
 */
@Module({
  imports: [WriteModule],
  controllers: [
    RoutesController,
    MandatesController,
    MandateVersionsController,
    CoveragesController,
    CoverageSignersController,
  ],
  providers: [
    RoutesService,
    MandatesService,
    MandateVersionsService,
    CoveragesService,
    CoverageSignersService,
    AuthorityEventsService,
  ],
})
export class RepresentationModule {}
