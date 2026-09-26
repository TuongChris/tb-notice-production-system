// Technical validation (P4G) of one notice candidate, shown on the candidate's page: the values a run
// is checked against (the artifact SHA-256, the current dependency digest of the prompt snapshot's
// scope, the candidate's task, the prompt's mode and the ruleset), the action that records a run,
// the run's result with its permanent qualifier, its coverage manifest and issues, and the recorded
// runs of this candidate with their issues.
//
// A run is a technical result only: the technical ruleset checks the stored artifact — exact text,
// hashes, envelope and thread, document plan, internal markers — against the current recorded
// context. It reviews nothing substantively: no G1–G6 gate, legal approval, readiness, signature or
// permission to send follows from it, and no page here approves, signs or sends anything. The
// current context is read first and shown; a run is recorded only against exactly that read
// (the server refuses with 412 when anything changed, and the page then requires a new read — it
// never retries). Deterministic checks and heuristic signals are shown apart: a heuristic is a signal
// a person reads, never a finding.
import { useEffect, useRef, useState } from 'react';
import type {
  ContextView,
  NoticeCandidate,
  PromptSnapshot,
  ValidationIssue,
  ValidationRun,
  ValidationRunSummary,
} from '@tb/contracts';
import { ApiError } from '../api/client.js';
import type { ContextQuery } from '../api/directory.js';
import { Time } from '../directory/agencies.js';
import { TASK_TYPE_LABEL } from '../directory/format.js';
import { useDirectoryApi, useIntentKey, useLoad, useWrite } from '../directory/hooks.js';
import {
  Details,
  ErrorNotice,
  LoadingNotice,
  Section,
  UnavailableAction,
} from '../directory/ui.js';
import { CASE_ARCHIVED_READ_ONLY } from './intake-ui.js';
import { allPages, MODE_LABEL } from './production-context.js';

/** The ruleset the server applies (a test pins it to the API's identifier). */
export const TECHNICAL_RULESET_VERSION = 'TB-TECHNICAL-RULESET-v1';
/** The action (mission §32, verbatim). */
export const RUN_VALIDATION_LABEL = 'Run technical validation';
/** The permanent qualifier of every result (mission §33, verbatim). */
export const TECHNICAL_QUALIFIER =
  'Technical checks only. This is not G1–G6 review, legal approval, readiness, signature, or permission to send.';
export const VALIDATION_BOUNDARY =
  'A technical validation checks this stored artifact — its exact text and hashes, envelope and thread, document plan and internal markers — against the current recorded context with a fixed technical ruleset. It reviews nothing substantively: authority, rights, identification, evidence, permission and whether the text is legally sufficient belong to the separate G1–G6 review.';
export const VALIDATION_CONTEXT_CHANGED =
  'Context changed. Read the current context before validating again.';
/** The digest row after a 412: the earlier read's digest is no longer the current one. */
export const VALIDATION_DIGEST_STALE =
  'Changed since the last read: not known until the current context is read again.';
export const VALIDATION_ARTIFACT_CHANGED =
  'Artifact changed. The stored artifact is not the one shown on this page: reload the page before validating.';
export const RESULT_LABEL: Readonly<Record<ValidationRun['result'], string>> = {
  TECHNICAL_PASS: 'TECHNICAL PASS',
  BLOCKED: 'BLOCKED',
  REVIEW_REQUIRED: 'REVIEW REQUIRED',
  ERROR: 'ERROR',
};
const RESULT_MEANING: Readonly<Record<ValidationRun['result'], string>> = {
  TECHNICAL_PASS:
    'The configured technical rules executed and found no technical blocker or review-required technical issue under this ruleset.',
  BLOCKED:
    'Technical blockers were found (listed below). The artifact never changes: a corrected draft is imported as a revision.',
  REVIEW_REQUIRED:
    'The rules found issues a person must review, or a rule was not executed (listed below).',
  ERROR:
    'A rule could not be completed. Its safe diagnostic is listed below; nothing about the candidate follows from this run.',
};
export const CHECK_KIND_LABEL: Readonly<Record<ValidationIssue['checkKind'], string>> = {
  DETERMINISTIC: 'Deterministic check',
  HEURISTIC: 'Heuristic signal',
};
const CHECK_KIND_MEANING: Readonly<Record<ValidationIssue['checkKind'], string>> = {
  DETERMINISTIC: 'follows from exact stored values alone',
  HEURISTIC:
    'a pattern in free text for a person to read — not a finding about what the text means',
};
const SEVERITY_LABEL: Readonly<Record<ValidationIssue['severity'], string>> = {
  BLOCKER: 'Blocker',
  REVIEW_REQUIRED: 'Review required',
  WARNING: 'Warning',
  INFO: 'Information',
};
const SUPERSEDED_NOTE =
  'This candidate is superseded: it is no longer the active draft artifact. A run checks this exact historical artifact only; it does not make it active again.';
const RECIPIENT_NOTE =
  'Recipients are compared only with exact records (a reply’s parent message); whether a recipient is the right one is not assessed here.';
const HISTORY_NOTE =
  'Every run of this candidate stays readable exactly as recorded, also after the candidate is superseded. A run’s full coverage manifest is returned only when it is recorded — the contract offers no read of a stored run — so a recorded run shows its summary and its issues, which name every rule that was not executed.';
const ISSUE_PAGES = 10;

/**
 * The production-context scope of a prompt snapshot: its task, mode, selection and parent binding,
 * and its prior bindings — the correspondence bindings of its frozen dependency manifest other than
 * the parent (exactly as the server derives them).
 */
export function promptScopeOf(prompt: PromptSnapshot): ContextQuery {
  const bindings = prompt.dependencyManifest
    .filter((dependency) => dependency.entityType === 'CorrespondenceBinding')
    .map((dependency) => dependency.entityId);
  return {
    taskType: prompt.taskType,
    generationMode: prompt.generationMode,
    authoritySelectionId: prompt.authoritySelectionId,
    parentBindingId: prompt.parentBindingId,
    priorBindingIds: bindings.filter((id) => id !== prompt.parentBindingId).sort(),
  };
}

export function CandidateValidation({
  caseId,
  candidate,
  prompt,
  promptError,
  archived,
}: {
  caseId: string;
  candidate: NoticeCandidate;
  /** The candidate's prompt snapshot (null while it loads or when it could not be read). */
  prompt: PromptSnapshot | null;
  promptError: unknown;
  archived: boolean;
}) {
  const api = useDirectoryApi();
  const [runs, reloadRuns] = useLoad(`validation-runs:${candidate.id}`, () =>
    allPages((cursor) =>
      api.cases.candidates.validation.list(candidate.id, {
        limit: 100,
        ...(cursor ? { cursor } : {}),
      }),
    ),
  );
  const [latest, setLatest] = useState<ValidationRun | null>(null);
  return (
    <Section title="Technical validation">
      <p className="context-boundary" role="note" data-testid="validation-boundary">
        {VALIDATION_BOUNDARY}
      </p>
      {candidate.supersededAt !== null && (
        <p className="record-boundary" data-testid="validation-superseded">
          {SUPERSEDED_NOTE}
        </p>
      )}
      {promptError !== null ? (
        <ErrorNotice error={promptError} recordLabel="prompt snapshot" />
      ) : prompt === null ? (
        <LoadingNotice label="Loading the prompt snapshot…" />
      ) : archived ? (
        <UnavailableAction label={RUN_VALIDATION_LABEL} reason={CASE_ARCHIVED_READ_ONLY} />
      ) : (
        <RunValidation
          caseId={caseId}
          candidate={candidate}
          prompt={prompt}
          onRecorded={(run) => {
            setLatest(run);
            reloadRuns();
          }}
        />
      )}
      {latest !== null && <RunResult run={latest} fresh />}
      <h3>Recorded runs of this candidate</h3>
      <p className="hint">{HISTORY_NOTE}</p>
      {runs.status === 'loading' && <LoadingNotice label="Loading validation runs…" />}
      {runs.status === 'error' && (
        <ErrorNotice error={runs.error} recordLabel="validation runs" onRetry={reloadRuns} />
      )}
      {runs.status === 'ready' && <RunHistory runs={runs.value} />}
    </Section>
  );
}

function RunValidation({
  caseId,
  candidate,
  prompt,
  onRecorded,
}: {
  caseId: string;
  candidate: NoticeCandidate;
  prompt: PromptSnapshot;
  onRecorded: (run: ValidationRun) => void;
}) {
  const api = useDirectoryApi();
  const write = useWrite();
  const intent = useIntentKey();
  const scope = promptScopeOf(prompt);
  // Nothing is read until asked: a run is recorded only against a read the operator saw.
  const [read, setRead] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; view: ContextView }
    | { status: 'error'; error: unknown }
  >({ status: 'idle' });
  const [pending, setPending] = useState(false);
  // A 412 (never retried): the context changed since the read, or the artifact is not the shown one.
  const [changed, setChanged] = useState<'CONTEXT_CHANGED' | 'ARTIFACT_CHANGED' | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const outcome = useRef<HTMLDivElement>(null);
  const [focusOutcome, setFocusOutcome] = useState(false);
  useEffect(() => {
    if (focusOutcome && read.status !== 'loading') outcome.current?.focus();
  }, [focusOutcome, read, changed, failure]);

  async function readContext() {
    setFocusOutcome(true);
    setChanged(null);
    setFailure(null);
    setRead({ status: 'loading' });
    try {
      setRead({ status: 'ready', view: await api.cases.productionContext(caseId, scope) });
    } catch (error) {
      setRead({ status: 'error', error });
    }
  }

  async function run(view: ContextView) {
    const body = {
      expectedArtifactSha256: candidate.artifactSha256,
      expectedDependencyDigest: view.dependencyDigest,
    };
    setPending(true);
    setFailure(null);
    try {
      const recorded = await write(intent.keyFor({ candidateId: candidate.id, body }), (auth) =>
        api.cases.candidates.validation.run(candidate.id, body, auth),
      );
      intent.done();
      setFocusOutcome(false);
      onRecorded(recorded);
    } catch (error) {
      // Never retried here: a changed context or artifact needs a new read first.
      setFocusOutcome(true);
      if (error instanceof ApiError && error.status === 412) {
        setChanged(error.code === 'ARTIFACT_CHANGED' ? 'ARTIFACT_CHANGED' : 'CONTEXT_CHANGED');
      } else setFailure(error);
    } finally {
      setPending(false);
    }
  }

  const view = read.status === 'ready' ? read.view : null;
  return (
    <div data-testid="validation-run-panel">
      <div data-testid="validation-expected">
        <Details
          rows={[
            [
              'Artifact SHA-256',
              <code className="digest" data-testid="validation-artifact-sha256">
                {candidate.artifactSha256}
              </code>,
            ],
            ['Candidate task', `${TASK_TYPE_LABEL[candidate.taskType]} (${candidate.taskType})`],
            [
              'Prompt mode',
              <span data-testid="validation-prompt-mode">
                {MODE_LABEL[prompt.generationMode]} ({prompt.generationMode})
              </span>,
            ],
            ['Ruleset', <code data-testid="validation-ruleset">{TECHNICAL_RULESET_VERSION}</code>],
            [
              'Current dependency digest',
              view === null ? (
                <span className="absent" data-testid="validation-digest-unread">
                  Not read yet
                </span>
              ) : changed === 'CONTEXT_CHANGED' ? (
                // The read's digest is known to be stale: it is never shown as the current one.
                <span className="absent" data-testid="validation-digest-stale">
                  {VALIDATION_DIGEST_STALE}
                </span>
              ) : (
                <code className="digest" data-testid="validation-current-digest">
                  {view.dependencyDigest}
                </code>
              ),
            ],
          ]}
        />
      </div>
      <p className="hint">{RECIPIENT_NOTE}</p>
      <div ref={outcome} tabIndex={-1} className="context-outcome" data-testid="validation-outcome">
        {read.status === 'loading' && <LoadingNotice label="Reading the current context…" />}
        {read.status === 'error' && (
          <div
            className="notice notice-error"
            role="alert"
            data-testid="validation-context-refused"
          >
            <p>
              The current context of this candidate’s prompt snapshot scope could not be read, so
              this candidate cannot be validated against it.
            </p>
            <ErrorNotice error={read.error} recordLabel="context" />
          </div>
        )}
        {view !== null && changed === null && (
          <p className="hint" data-testid="validation-context-read">
            Current context read: revision {view.contextRevision}, {view.context.missing.length}{' '}
            missing, {view.context.conflicts.length} recorded conflicts. A run is checked against
            exactly this read.
          </p>
        )}
        {changed !== null && (
          <div
            className="notice notice-error"
            role="alert"
            data-testid={
              changed === 'ARTIFACT_CHANGED'
                ? 'validation-artifact-changed'
                : 'validation-context-changed'
            }
          >
            <p>
              <strong>
                {changed === 'ARTIFACT_CHANGED'
                  ? VALIDATION_ARTIFACT_CHANGED
                  : VALIDATION_CONTEXT_CHANGED}
              </strong>
            </p>
            <p>No validation run was recorded.</p>
          </div>
        )}
        {failure !== null && <ErrorNotice error={failure} recordLabel="validation run" />}
      </div>
      <div className="form-actions">
        {(view === null || changed === 'CONTEXT_CHANGED') && (
          <button
            type="button"
            className="button"
            onClick={() => void readContext()}
            disabled={read.status === 'loading'}
            data-testid="validation-read-context"
          >
            Read the current context
          </button>
        )}
        {view !== null && changed === null && (
          <button
            type="button"
            className="button button-primary"
            disabled={pending}
            onClick={() => void run(view)}
            data-testid="validation-run-button"
          >
            {pending ? 'Running technical validation…' : RUN_VALIDATION_LABEL}
          </button>
        )}
      </div>
    </div>
  );
}

/** One run: its result with the permanent qualifier, its values, coverage manifest and issues. */
function RunResult({ run, fresh }: { run: ValidationRun; fresh: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (fresh) heading.current?.focus();
  }, [fresh, run.id]);
  const coverage = run.coverageManifest;
  return (
    <div
      className={`validation-result validation-${run.result.toLowerCase()}`}
      data-testid="validation-result"
    >
      <h3 ref={heading} tabIndex={-1} data-testid="validation-result-heading">
        Technical validation result:{' '}
        <span data-testid="validation-result-label">{RESULT_LABEL[run.result]}</span>
      </h3>
      <p className="context-boundary" role="note" data-testid="validation-qualifier">
        {TECHNICAL_QUALIFIER}
      </p>
      <p data-testid="validation-result-meaning">{RESULT_MEANING[run.result]}</p>
      <Details
        rows={[
          ['Ruleset', <code>{run.rulesetVersion}</code>],
          ['Artifact SHA-256', <code className="digest">{run.artifactSha256}</code>],
          [
            'Dependency digest evaluated',
            <code className="digest" data-testid="validation-result-digest">
              {run.dependencyDigest}
            </code>,
          ],
          ['Started', <Time iso={run.startedAt} />],
          ['Completed', <Time iso={run.completedAt} />],
          [
            'Issues',
            `${run.blockerCount} blockers, ${run.reviewRequiredCount} review required, ${run.warningCount} warnings`,
          ],
          ['Run id', <code>{run.id}</code>],
        ]}
      />
      <div data-testid="validation-coverage">
        <h4>Coverage manifest</h4>
        <Details
          rows={[
            [
              `Required rules (${coverage.requiredRuleIds.length})`,
              <RuleList ids={coverage.requiredRuleIds} testId="validation-required-rules" />,
            ],
            [
              `Executed rules (${coverage.executedRuleIds.length})`,
              <RuleList ids={coverage.executedRuleIds} testId="validation-executed-rules" />,
            ],
            [
              `Not executed (${coverage.notExecutedRuleIds.length})`,
              coverage.notExecutedRuleIds.length === 0 ? (
                <span data-testid="validation-not-executed-rules">None</span>
              ) : (
                <RuleList
                  ids={coverage.notExecutedRuleIds}
                  testId="validation-not-executed-rules"
                />
              ),
            ],
            [
              'Semantic review required',
              <span data-testid="validation-semantic-review">
                Yes — this run performed no G1–G6 or legal review
              </span>,
            ],
          ]}
        />
      </div>
      <IssueList runId={run.id} />
    </div>
  );
}

function RuleList({ ids, testId }: { ids: readonly string[]; testId: string }) {
  return (
    <ul className="rule-list" data-testid={testId}>
      {ids.map((id) => (
        <li key={id}>
          <code>{id}</code>
        </li>
      ))}
    </ul>
  );
}

/** The issues of one run, in the order the ruleset reported them. */
function IssueList({ runId }: { runId: string }) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`validation-issues:${runId}`, async () => {
    const items: ValidationIssue[] = [];
    let cursor: string | undefined;
    let complete = false;
    for (let page = 0; page < ISSUE_PAGES; page += 1) {
      const next = await api.cases.candidates.validation.issues(runId, {
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      items.push(...next.items);
      if (next.nextCursor === null) {
        complete = true;
        break;
      }
      cursor = next.nextCursor;
    }
    return { items, complete };
  });
  if (state.status === 'loading') return <LoadingNotice label="Loading issues…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="issues" onRetry={reload} />;
  }
  const { items, complete } = state.value;
  if (items.length === 0) {
    return (
      <p className="absent" data-testid="validation-no-issues">
        No issue was recorded: every executed rule passed.
      </p>
    );
  }
  return (
    <div className="table-frame">
      <table className="records validation-issues" data-testid="validation-issues">
        <caption>Issues, in the order the ruleset reported them</caption>
        <thead>
          <tr>
            <th scope="col">Rule</th>
            <th scope="col">Kind</th>
            <th scope="col">Severity</th>
            <th scope="col">Field</th>
            <th scope="col">Message</th>
          </tr>
        </thead>
        <tbody>
          {items.map((issue) => (
            <tr
              key={issue.id}
              className={`issue-${issue.checkKind.toLowerCase()} issue-${issue.severity.toLowerCase()}`}
              data-testid="validation-issue"
            >
              <td>
                <code>{issue.ruleId}</code>
              </td>
              <td>
                <span
                  className={`check-kind check-kind-${issue.checkKind.toLowerCase()}`}
                  data-testid="validation-issue-kind"
                >
                  {CHECK_KIND_LABEL[issue.checkKind]}
                </span>
                <span className="hint"> — {CHECK_KIND_MEANING[issue.checkKind]}</span>
              </td>
              <td data-testid="validation-issue-severity">{SEVERITY_LABEL[issue.severity]}</td>
              <td>
                {issue.fieldPath ? (
                  <code>{issue.fieldPath}</code>
                ) : (
                  <span className="absent">None</span>
                )}
              </td>
              <td className="validation-issue-message">
                {issue.message}
                {issue.details !== null && (
                  <details>
                    <summary>Details</summary>
                    <pre className="captured-text">{JSON.stringify(issue.details, null, 2)}</pre>
                  </details>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!complete && (
        <p className="hint" data-testid="validation-issues-truncated">
          Only the first {items.length} issues are loaded here.
        </p>
      )}
    </div>
  );
}

/** The recorded runs of this candidate (summaries), newest first; each shows its issues on request. */
function RunHistory({ runs }: { runs: readonly ValidationRunSummary[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (runs.length === 0) {
    return (
      <p className="absent" data-testid="validation-history-empty">
        No validation run is recorded for this candidate.
      </p>
    );
  }
  return (
    <ul className="validation-history" data-testid="validation-history">
      {runs.map((run) => (
        <li key={run.id} data-testid="validation-history-run">
          <p>
            <strong data-testid="validation-history-result">{RESULT_LABEL[run.result]}</strong> ·{' '}
            <Time iso={run.completedAt} /> · <code>{run.rulesetVersion}</code> · {run.blockerCount}{' '}
            blockers, {run.reviewRequiredCount} review required, {run.warningCount} warnings
          </p>
          <p className="hint">{TECHNICAL_QUALIFIER}</p>
          <p className="hint">
            Dependency digest evaluated <code className="digest">{run.dependencyDigest}</code>
          </p>
          <button
            type="button"
            className="button button-quiet"
            aria-expanded={open === run.id}
            onClick={() => setOpen(open === run.id ? null : run.id)}
            data-testid="validation-history-toggle"
          >
            {open === run.id ? 'Hide issues' : 'Show issues'}
          </button>
          {open === run.id && <IssueList runId={run.id} />}
        </li>
      ))}
    </ul>
  );
}
