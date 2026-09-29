// Ownership of the disposable rows of `yarn ui:sandbox` (ui-sandbox.ts; R14-AUD-004): which rows of
// tb_notice_test a sandbox run may delete, and when.
//
// A run owns the sandbox tables only after it has itself verified that its connection is on
// tb_notice_test and that every table it can write is empty. Until then its cleanup is DISARMED: a
// refused guard (a row that was already there, another schema), a start-up error or a Ctrl+C /
// SIGTERM before that check passed closes only what this process opened (the web server child, the
// API and its own connection pool) and issues no UPDATE or DELETE — rows that existed before the run
// are never touched. Once armed, the teardown deletes every row the sandbox could have written, in
// foreign-key order, and verifies the tables are empty again.

/** The statements the sandbox issues on its own connection (Prisma's raw calls). */
export interface SandboxDatabase {
  $queryRawUnsafe<T>(sql: string): Promise<T>;
  $executeRawUnsafe(sql: string): Promise<number>;
}

/**
 * Every table the running app can write (P2 directory, P3A sources and routes, P3B mandates,
 * versions, coverage, coverage signers and authority events, P4A cases, case sources and authority
 * selections with their pinned coverage, P4B reported items, works, use mappings, case facts and
 * their supports, P4C captured correspondence and its case bindings, P4E prompt snapshots, P4F
 * notice candidates, P4G validation runs and their issues, P4H candidate assessments and their
 * support rows) — every table of the committed migration — in foreign-key deletion order. Source
 * references and the records that point at them reference each other (canonical bindings,
 * revision chains, citations), routes ⇄ coverage, cases ⇄ selections and the version / coverage /
 * event / fact / binding / candidate / assessment chains point at their own tables, so those
 * pointers are cleared first (SANDBOX_POINTERS).
 */
export const SANDBOX_TABLES = [
  'idempotency_records',
  'audit_events',
  'assessment_sources',
  'candidate_assessments',
  'validation_issues',
  'validation_runs',
  'notice_candidates',
  'prompt_snapshots',
  'correspondence_bindings',
  'fact_sources',
  'case_facts',
  'use_mappings',
  'case_works',
  'reported_items',
  'case_authority_coverages',
  'case_authority_selections',
  'case_sources',
  'cases',
  'correspondence',
  'authority_events',
  'coverage_signers',
  'mandate_coverages',
  'mandate_versions',
  'mandates',
  'routes',
  'owner_subjects',
  'signers',
  'legal_subjects',
  'owners',
  'source_references',
  'agencies',
  'auth_sessions',
  'users',
] as const;

/**
 * Pointers cleared before deleting rows (canonical bindings, citations, revision chains, preferred
 * coverage, version / coverage lineage, event, fact, binding and assessment supersession, candidate
 * lineage and a case's selection pointer).
 */
export const SANDBOX_POINTERS = [
  'UPDATE `cases` SET `current_authority_selection_id` = NULL, `packet_source_id` = NULL, `canonical_binding_source_id` = NULL',
  'UPDATE `agencies` SET `canonical_source_id` = NULL',
  'UPDATE `owners` SET `canonical_source_id` = NULL',
  'UPDATE `legal_subjects` SET `canonical_source_id` = NULL',
  'UPDATE `signers` SET `canonical_source_id` = NULL, `identity_source_id` = NULL, `delegation_source_id` = NULL',
  'UPDATE `routes` SET `canonical_source_id` = NULL, `preferred_coverage_id` = NULL',
  'UPDATE `authority_events` SET `supersedes_event_id` = NULL',
  'UPDATE `mandate_coverages` SET `predecessor_coverage_id` = NULL',
  'UPDATE `mandate_versions` SET `predecessor_id` = NULL',
  'UPDATE `mandates` SET `canonical_source_id` = NULL',
  'UPDATE `owner_subjects` SET `source_id` = NULL',
  'UPDATE `source_references` SET `supersedes_source_id` = NULL',
  'UPDATE `case_facts` SET `supersedes_fact_id` = NULL',
  'UPDATE `correspondence_bindings` SET `supersedes_binding_id` = NULL',
  'UPDATE `notice_candidates` SET `parent_candidate_id` = NULL',
  'UPDATE `candidate_assessments` SET `supersedes_assessment_id` = NULL',
] as const;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function countRows(db: SandboxDatabase, table: string): Promise<number> {
  const [row] = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM \`${table}\``,
  );
  return Number(row?.n ?? -1);
}

/** The connection is on tb_notice_test and every sandbox table is empty; throws otherwise. */
export async function assertEmpty(db: SandboxDatabase, when: string): Promise<void> {
  const [session] = await db.$queryRawUnsafe<Array<{ db: string }>>('SELECT DATABASE() AS db');
  if (session?.db !== 'tb_notice_test') {
    throw new Error(`connected to ${session?.db}, not tb_notice_test`);
  }
  const nonEmpty: string[] = [];
  for (const table of SANDBOX_TABLES) {
    const count = await countRows(db, table);
    if (count !== 0) nonEmpty.push(`${table}=${count}`);
  }
  if (nonEmpty.length > 0) {
    throw new Error(`tb_notice_test is not empty ${when} (${nonEmpty.join(', ')}); refusing`);
  }
}

async function cleanup(db: SandboxDatabase): Promise<void> {
  for (const statement of SANDBOX_POINTERS) await db.$executeRawUnsafe(statement);
  for (const table of SANDBOX_TABLES) await db.$executeRawUnsafe(`DELETE FROM \`${table}\``);
}

export interface SandboxLifecycleOptions {
  readonly db: SandboxDatabase;
  /** Stops what this process itself started (the web server child, the API), where started. */
  readonly closeOwnResources: () => Promise<void>;
  /** Closes this process's own connection pool. */
  readonly disconnect: () => Promise<void>;
  readonly exit: (code: number) => void;
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

export interface SandboxLifecycle {
  /** True only once this run verified an empty tb_notice_test, and so owns what it writes there. */
  readonly cleanupArmed: boolean;
  /** The empty-start check. Only its success arms the cleanup, and never once a stop has begun. */
  claimEmptyStart(): Promise<void>;
  /**
   * The one teardown of every exit path (once): this process's own resources, then — only when
   * armed — the cleanup and the empty check after it, then the connection pool, then exit.
   */
  stop(code: number): Promise<void>;
}

export function sandboxLifecycle(options: SandboxLifecycleOptions): SandboxLifecycle {
  let cleanupArmed = false;
  let stopping = false;
  return {
    get cleanupArmed() {
      return cleanupArmed;
    },
    async claimEmptyStart() {
      await assertEmpty(options.db, 'before start');
      // A stop that began while the check ran has already left the rows alone.
      if (!stopping) cleanupArmed = true;
    },
    async stop(code) {
      if (stopping) return;
      stopping = true;
      let exitCode = code;
      options.log('stopping…');
      try {
        await options.closeOwnResources();
      } catch (error) {
        options.error(`stopping the servers FAILED: ${messageOf(error)}`);
        exitCode = 1;
      }
      if (cleanupArmed) {
        try {
          await cleanup(options.db);
          await assertEmpty(options.db, 'after cleanup');
          options.log('sandbox rows deleted; tb_notice_test is empty again');
        } catch (error) {
          options.error(`cleanup FAILED: ${messageOf(error)}`);
          exitCode = 1;
        }
      } else {
        options.log(
          'cleanup not armed: this run never verified an empty tb_notice_test, so no row was updated or deleted',
        );
      }
      try {
        await options.disconnect();
      } catch (error) {
        options.error(`disconnect FAILED: ${messageOf(error)}`);
        exitCode = 1;
      }
      options.exit(exitCode);
    },
  };
}

/** Ctrl+C and SIGTERM go through the lifecycle's one teardown — never straight to a cleanup. */
export function stopOnSignals(
  target: { on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown },
  lifecycle: Pick<SandboxLifecycle, 'stop'>,
): void {
  target.on('SIGINT', () => void lifecycle.stop(0));
  target.on('SIGTERM', () => void lifecycle.stop(0));
}
