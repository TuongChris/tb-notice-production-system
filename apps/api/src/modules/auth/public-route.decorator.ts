import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'tb:public-route';

export interface PublicRouteOptions {
  /** Require `X-Requested-With: TB-APP` (browser login, API_CONTRACT_v1 §3). */
  readonly requireRequestedWith: boolean;
}

/**
 * Marks a handler as public (contract `security: []`). Every other route requires a valid session:
 * the global AuthGuard is secure by default, so a future route cannot be exposed by omission.
 */
export const PublicRoute = (options: Partial<PublicRouteOptions> = {}) =>
  SetMetadata(PUBLIC_ROUTE, {
    requireRequestedWith: options.requireRequestedWith ?? false,
  } satisfies PublicRouteOptions);
