// Local database target allowlist (decision D3). Every Prisma/DB helper that can write or
// destroy data must validate its target with assertLocalTarget() and fail closed otherwise.

export const ALLOWED_SCHEMAS = Object.freeze([
  'tb_notice_dev',
  'tb_notice_shadow',
  'tb_notice_test',
  'tb_notice_replay',
]);

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);
const ALLOWED_PORT = '3307';

/**
 * Parses a mysql:// URL and asserts it targets the local development MySQL, an allowlisted
 * schema and (optionally) one exact expected schema. Never returns or prints the password.
 */
export function assertLocalTarget(variableName, rawUrl, { expectedSchema, forbidUser } = {}) {
  if (!rawUrl) {
    throw new Error(`${variableName} is not set. Create the local .env with \`yarn env:init\`.`);
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${variableName} is not a valid URL.`);
  }
  const schema = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const user = decodeURIComponent(url.username);
  const problems = [];
  if (url.protocol !== 'mysql:') problems.push('protocol must be mysql:');
  if (!ALLOWED_HOSTS.has(url.hostname)) problems.push(`host ${url.hostname} is not loopback`);
  if (url.port !== ALLOWED_PORT)
    problems.push(`port ${url.port || '(default)'} is not ${ALLOWED_PORT}`);
  if (!ALLOWED_SCHEMAS.includes(schema)) problems.push(`schema "${schema}" is not allowlisted`);
  if (expectedSchema && schema !== expectedSchema) {
    problems.push(`schema "${schema}" is not the required "${expectedSchema}"`);
  }
  if (user === 'root') problems.push('root credentials are never permitted');
  if (forbidUser && user === forbidUser) problems.push(`user ${user} is not permitted here`);
  if (problems.length > 0) {
    throw new Error(`${variableName} rejected: ${problems.join('; ')}.`);
  }
  return { host: url.hostname, port: url.port, schema, user };
}

/** Describes a target without its password, for logs. */
export function describeTarget(target) {
  return `${target.user}@${target.host}:${target.port}/${target.schema}`;
}
