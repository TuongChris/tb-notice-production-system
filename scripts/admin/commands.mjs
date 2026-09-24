// Local admin commands accepted by scripts/admin/admin.ts (parity with apps/api/src/cli/admin-args.ts
// and the root package.json `admin:*` scripts is tested in tests/tooling/admin-guard.test.ts).
export const ADMIN_COMMANDS = Object.freeze([
  'create',
  'password',
  'disable',
  'enable',
  'revoke-sessions',
]);
