import { Module } from '@nestjs/common';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { HealthModule } from './modules/health/health.module.js';

// P0 shell: health only. No authentication, business CRUD or production endpoints.
@Module({
  imports: [DatabaseModule, HealthModule],
})
export class AppModule {}
