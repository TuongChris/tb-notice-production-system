// Compiled entry of the local admin CLI: `node apps/api/dist/src/cli/admin.js <command> [options]`,
// normally reached through scripts/admin/admin.ts (yarn admin:create | admin:password |
// admin:disable | admin:enable | admin:revoke-sessions), which checks the target before building.
// Running this file directly is equally guarded: every command resolves DATABASE_URL through the
// shared allowlist and the API runtime boundary before connecting (see cli-target.ts).
import { loadRootEnv } from '../infrastructure/config/root-env.js';
import { runAdminCli } from './admin-cli.js';
import { productionAdminCliDeps } from './admin-production.js';

loadRootEnv();
process.exitCode = await runAdminCli(process.argv.slice(2), productionAdminCliDeps());
