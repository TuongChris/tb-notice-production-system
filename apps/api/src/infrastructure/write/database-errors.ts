// Classification of Prisma / MySQL errors for the write path.
//
// Prisma 7 with the MariaDB driver adapter reports MySQL 1213 (deadlock) as P2034 and 1062
// (duplicate key) as P2002; raw-query failures (P2010) and unmapped driver errors such as 1205
// (lock wait timeout) carry the MySQL errno as `originalCode` on the driver adapter error.

/** MySQL errnos after which the whole transaction may be retried unchanged. */
const RETRYABLE_MYSQL_CODES = new Set(['1213', '1205']);

/** Bounded retry budget for deadlocks/lock waits (INVARIANTS §5: "maximum 3"). */
export const MAX_TRANSACTION_ATTEMPTS = 3;

function prismaCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** MySQL errnos found on the error, its cause and a wrapped driver adapter error. */
function mysqlCodes(error: unknown): string[] {
  const codes: string[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (depth > 4 || typeof value !== 'object' || value === null) return;
    const record = value as Record<string, unknown>;
    for (const key of ['originalCode', 'errno']) {
      const code = record[key];
      if (typeof code === 'string' || typeof code === 'number') codes.push(String(code));
    }
    visit(record['cause'], depth + 1);
    visit(record['meta'], depth + 1);
    visit(record['driverAdapterError'], depth + 1);
  };
  visit(error, 0);
  return codes;
}

export function isRetryableTransactionError(error: unknown): boolean {
  if (prismaCode(error) === 'P2034') return true;
  return mysqlCodes(error).some((code) => RETRYABLE_MYSQL_CODES.has(code));
}

export function isUniqueViolation(error: unknown): boolean {
  return prismaCode(error) === 'P2002' || mysqlCodes(error).includes('1062');
}
