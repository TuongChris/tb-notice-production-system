import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CLOCK, systemClock, type Clock } from '../../infrastructure/time/clock.js';
import { AUTH_CONFIG, loadAuthConfig, type AuthConfig } from './auth-config.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginThrottle } from './login-throttle.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionService } from './session.service.js';

/**
 * P1 authentication: application Users only. A User is never a Signer; nothing here grants legal
 * authority, satisfies G1–G7, signs, adopts or sends anything.
 */
@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: (): AuthConfig => loadAuthConfig(process.env) },
    { provide: CLOCK, useValue: systemClock },
    { provide: PasswordHasher, useFactory: () => new PasswordHasher() },
    {
      provide: LoginThrottle,
      useFactory: (config: AuthConfig, clock: Clock) => new LoginThrottle(config.throttle, clock),
      inject: [AUTH_CONFIG, CLOCK],
    },
    SessionService,
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AUTH_CONFIG, CLOCK],
})
export class AuthModule {}
