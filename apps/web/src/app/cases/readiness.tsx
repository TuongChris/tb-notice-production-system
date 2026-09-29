// Readiness (P4I) of one notice candidate, shown on the candidate's page: the readiness the server
// derives now from the current captured records (getCandidateReadiness) — read only when asked,
// never inferred or remembered here, never stored — and, only while that read says
// READY_FOR_SIGNER, the unsigned handoff (exportUnsignedCandidate): the stored subject, envelope
// and body exactly, unsigned and unsent, for an authorized human who reviews, adopts, signs and
// sends outside this application.
//
// READY_FOR_SIGNER means only "ready for authorized human signer review": never a legal approval,
// G7, a signature, an adoption or permission to send. Nothing here signs, adopts, sends, submits or
// records anything as sent. The technical result and the six G1–G6 review summaries are shown
// apart, with the reason codes in neutral copy. The handoff is requested against exactly the
// artifact, digest and run of the evaluation shown; the server evaluates the readiness again, and a
// 412 (something changed) or a 409 (not ready now) is shown exactly and never retried — only a new
// evaluation is offered. A successful write on the candidate page that can change the readiness
// starts a new readiness generation (R14-AUD-019): the evaluation and any handoff shown are dropped
// at once, and a response to a request started under an earlier generation is discarded — it never
// brings an evaluation or a handoff back. Nothing is inferred in their place.
import { useEffect, useRef, useState } from 'react';
import type { GateSummary, NoticeCandidate, Readiness, UnsignedExport } from '@tb/contracts';
import { ApiError } from '../api/client.js';
import { Time } from '../directory/agencies.js';
import { useDirectoryApi, useIntentKey, useWrite } from '../directory/hooks.js';
import { Details, ErrorNotice, LoadingNotice, Section } from '../directory/ui.js';
import { GATE_LABEL } from './assessments.js';
import { RESULT_LABEL, TECHNICAL_QUALIFIER } from './validation.js';

type Status = Readiness['status'];
type GateStatus = GateSummary['status'];

/** What the section is (and is not). */
export const READINESS_BOUNDARY =
  'Readiness is derived by the server from the current captured records each time it is evaluated here: the exact artifact, the current dependency digest of its prompt snapshot’s scope, the technical ruleset, the counted technical validation run and the current G1–G6 reviews of that epoch. It is never stored, never inferred by this page and never a legal approval, G7, a signature, an adoption or permission to send.';
/** The permanent qualifiers of every evaluation (mission §32, verbatim). */
export const READINESS_QUALIFIERS = [
  'Derived from current captured records.',
  'Not G7, not a signature, and not a send action.',
  'Source changes not captured by this system cannot be detected here.',
] as const;
/** READY_FOR_SIGNER in words (mission §28, §33 and §57, verbatim). */
export const READY_LABEL = 'Ready for authorized human signer review';
export const READY_QUALIFIER =
  'This candidate remains unsigned and unsent. An authorized human must review, adopt, sign and send outside this application.';
export const READY_STILL_REQUIRED =
  'Human review/adoption/signature/send are still required outside the application.';
export const EVALUATE_LABEL = 'Evaluate current readiness';
export const PREPARE_LABEL = 'Prepare unsigned handoff';
export const HANDOFF_MEANING =
  'Prepares the stored subject, envelope and body exactly as stored, for an authorized human signer outside this application. The server evaluates the readiness again first. Nothing is signed, adopted or sent, and nothing is recorded as sent.';
export const HANDOFF_BOUNDARY =
  'Unsigned handoff text, exactly as stored. Nothing was signed, adopted or sent, and nothing is recorded as sent: an authorized human reviews, adopts, signs and sends outside this application.';
export const HANDOFF_CHANGED: Readonly<Record<ChangedCode, string>> = {
  CONTEXT_CHANGED:
    'Context changed. Evaluate the current readiness before preparing the handoff again.',
  ARTIFACT_CHANGED:
    'Artifact changed. The stored artifact is not the one evaluated here: evaluate the current readiness again.',
  VALIDATION_RUN_CHANGED:
    'Validation run changed. The counted technical validation run is not the one evaluated here: evaluate the current readiness again.',
};
export const NOTHING_PREPARED = 'No unsigned handoff was prepared.';
/** A binding the prompt named was corrected since: the scope has no readiness (409). */
export const SCOPE_UNAVAILABLE =
  'A binding this candidate’s prompt snapshot named has been corrected by a later binding, so its scope cannot be evaluated any more and no readiness is derived. The correction is never used in its place: a new prompt snapshot and candidate are needed.';
/** Shown in place of the evaluation after a refused handoff: it is no longer the current one. */
export const EVALUATION_OUTDATED =
  'The earlier evaluation is no longer current, so it is not shown. Evaluate the current readiness again.';
const NOT_EVALUATED =
  'Not evaluated yet. Readiness is read from the server only when you ask; this page infers nothing.';

type ChangedCode = 'CONTEXT_CHANGED' | 'ARTIFACT_CHANGED' | 'VALIDATION_RUN_CHANGED';

/** Each derived status in words, never as a verdict. */
export const STATUS_LABEL: Readonly<Record<Status, string>> = {
  READY_FOR_SIGNER: READY_LABEL,
  REVIEW_REQUIRED: 'Review required',
  BLOCKED: 'Blocked',
  UNVALIDATED: 'Not technically validated',
  STALE_REVALIDATION_REQUIRED: 'Stale: revalidation required',
  SUPERSEDED: 'Superseded candidate',
};
const STATUS_MEANING: Readonly<Record<Status, string>> = {
  READY_FOR_SIGNER:
    'Every condition the server evaluates holds now: a full technical validation run of the current epoch with no technical issue, and a current confirmed PASS review of each of the six gates.',
  REVIEW_REQUIRED: 'Not reached: the reasons listed below need a person’s review or a new record.',
  BLOCKED: 'Not reached: the reasons listed below block it.',
  UNVALIDATED: 'Not reached: no technical validation run is recorded for this candidate.',
  STALE_REVALIDATION_REQUIRED:
    'Not reached: a recorded input changed or a recorded boundary passed since the technical validation run or a review; it no longer counts for the current evaluation.',
  SUPERSEDED: 'Not reached: this candidate is no longer the active draft artifact.',
};
const GATE_STATUS_LABEL: Readonly<Record<GateStatus, string>> = {
  PASS: 'PASS — a current confirmed review counts for this epoch',
  HOLD: 'HOLD',
  BLOCKED: 'BLOCKED',
  MISSING: 'MISSING',
  CONFLICT: 'CONFLICT — more than one current review, or conflicting material',
  UNASSESSED: 'UNASSESSED — no current review counts',
};

/** Neutral copy for each reason code the server reports; an unknown code is shown as it is. */
const REASON_TEXT: Readonly<Record<string, string>> = {
  CANDIDATE_SUPERSEDED: 'This candidate is superseded: it is no longer the active draft artifact.',
  CASE_ARCHIVED: 'The case is archived (read-only).',
  PREPARATION_MODE:
    'The candidate was drafted from a preparation prompt: it is draft material only.',
  CONTEXT_INPUT_MISSING: 'The current context lacks input a drafting context requires.',
  CONTEXT_TOO_LARGE: 'The current context exceeds a contracted bound.',
  ARTIFACT_INTEGRITY_FAILED:
    'The stored artifact does not match its stored form or its recorded hashes.',
  SIGNATURE_SLOT_INVALID:
    'The pending signer slot is not in the body exactly once (and never in the subject), or the signature state is not HUMAN_PENDING.',
  VALIDATION_MISSING: 'No technical validation run is recorded for this candidate.',
  VALIDATION_STALE:
    'No technical validation run is recorded for the current epoch (this artifact, the current dependency digest and the current ruleset).',
  VALIDATION_BLOCKED: 'The counted technical validation run records a blocker.',
  VALIDATION_ERROR:
    'The latest technical validation run of the current epoch could not complete a rule; no earlier run is relied on until a later run completes.',
  TECHNICAL_RUN_CONFLICT:
    'Completed technical validation runs of the current epoch record different outcomes; none is counted.',
  VALIDATION_REVIEW_REQUIRED:
    'The counted technical validation run records issues a person must review; nothing waives them.',
  PLAN_SOURCE_NOT_IN_CONTEXT:
    'A planned document names a source outside the evaluated context; this is never waived.',
  VALIDATION_COVERAGE_INCOMPLETE:
    'The latest technical validation run of the current epoch did not execute every required rule; no earlier run is relied on.',
  CONTEXT_MISSING_ITEMS: 'The current context lists missing items.',
  CONTEXT_CONFLICTS: 'The current context lists recorded conflicts.',
  AUTHORITY_EFFECTIVE_DATE_NOT_REACHED:
    'A recorded authority start date lies in the future: it is not assumed effective.',
  ASSESSMENT_INTEGRITY_FAILED:
    'A counted review’s supports or ask dispositions no longer match this case or its current context.',
  ASSESSMENT_STALE: 'Reviews of this gate are recorded, but none at the current epoch.',
  G1_TEMPORAL_REVIEW_STALE:
    'The G1 review was recorded as made before a recorded authority boundary that has since been reached.',
  GATE_HEADS_UNRECONCILED: 'More than one current review of this gate stands; none is chosen.',
  SCOPE_NOT_CONFIRMED:
    'The PASS review is recorded without its scope confirmed for this candidate.',
  ASSESSMENT_RECORD_INCOMPLETE: 'The review’s performer, rationale or scope text is blank.',
  ASSESSMENT_PROVENANCE_UNSUPPORTED: 'The review’s provenance is recorded as MISSING or CONFLICT.',
  G1_REVIEW_TIME_UNKNOWN:
    'A recorded authority boundary has been reached, and the G1 review’s own time is not recorded (or lies after this evaluation): the recording time is never used instead.',
  TEMPORAL_BOUNDARY_AMBIGUOUS:
    'A date-only authority boundary falls too close to the review or to this evaluation to tell which came first.',
  G6_ASK_DISPOSITIONS_MISSING: 'The G6 review of a reply records no ask dispositions.',
  G6_ASK_REQUIRES_DOCUMENT:
    'An ask disposition records that a requested document is still needed: the ask is unresolved.',
  G6_ASK_MISSING_FACT:
    'An ask disposition records that a material fact is still missing: the ask is unresolved.',
  G6_ASK_LEGAL_REVIEW_REQUIRED: 'An ask disposition records that legal review is required.',
  G6_ASK_SOURCE_NOT_APPLICABLE:
    'An ask disposition cites a source that does not apply to the case scope now.',
  GATE_HOLD: 'The current review of this gate is recorded as HOLD.',
  GATE_BLOCKED: 'This gate is blocked.',
  GATE_MISSING: 'The current review of this gate is recorded as MISSING.',
  GATE_CONFLICT: 'This gate is in conflict.',
  GATE_UNASSESSED: 'No current review of this gate counts.',
};

/** A reason code in words: a gate status code names its gate. */
export function reasonText(code: string): string {
  const known = REASON_TEXT[code];
  if (known !== undefined) return known;
  const gate = /^(G[1-6])_(PASS|HOLD|BLOCKED|MISSING|CONFLICT|UNASSESSED)$/.exec(code);
  if (gate) {
    const label = GATE_LABEL[gate[1] as GateSummary['gate']];
    return `${label}: ${GATE_STATUS_LABEL[gate[2] as GateStatus]}.`;
  }
  return code;
}

type Evaluation =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly readiness: Readiness }
  | { readonly status: 'error'; readonly error: unknown };

type Handoff =
  | { readonly status: 'none' }
  | { readonly status: 'pending' }
  | { readonly status: 'prepared'; readonly handoff: UnsignedExport }
  | { readonly status: 'changed'; readonly code: ChangedCode }
  | {
      readonly status: 'not-ready';
      readonly readinessStatus: string;
      readonly reasonCodes: readonly string[];
    }
  | { readonly status: 'failed'; readonly error: unknown };

export function CandidateReadiness({
  candidate,
  generation,
}: {
  candidate: NoticeCandidate;
  /** The page's readiness generation: a new one invalidates what this section shows. */
  generation: number;
}) {
  const api = useDirectoryApi();
  const write = useWrite();
  const intent = useIntentKey();
  const [evaluation, setEvaluation] = useState<Evaluation>({ status: 'idle' });
  const [handoff, setHandoff] = useState<Handoff>({ status: 'none' });
  // Where focus goes once the page settles: the evaluation's outcome, or the handoff's.
  const [focusTarget, setFocusTarget] = useState<'outcome' | 'handoff' | null>(null);
  // A new generation drops the evaluation and the handoff before anything is shown with it.
  const [shownGeneration, setShownGeneration] = useState(generation);
  if (shownGeneration !== generation) {
    setShownGeneration(generation);
    setEvaluation({ status: 'idle' });
    setHandoff({ status: 'none' });
    setFocusTarget(null);
  }
  // The generation a response is checked against when it arrives (the latest rendered one).
  const currentGeneration = useRef(generation);
  currentGeneration.current = generation;
  const outcome = useRef<HTMLDivElement>(null);
  const handoffOutcome = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusTarget === 'outcome' && evaluation.status !== 'loading') outcome.current?.focus();
    if (focusTarget === 'handoff' && handoff.status !== 'pending') handoffOutcome.current?.focus();
  }, [focusTarget, evaluation, handoff]);

  async function evaluate() {
    const started = currentGeneration.current;
    setHandoff({ status: 'none' });
    setFocusTarget('outcome');
    setEvaluation({ status: 'loading' });
    try {
      const readiness = await api.cases.candidates.readiness.get(candidate.id);
      // Started before a write that can change the readiness: discarded, never shown.
      if (currentGeneration.current !== started) return;
      setEvaluation({ status: 'ready', readiness });
    } catch (error) {
      if (currentGeneration.current !== started) return;
      setEvaluation({ status: 'error', error });
    }
  }

  async function prepare(readiness: Readiness) {
    if (readiness.status !== 'READY_FOR_SIGNER' || readiness.validationRunId === null) return;
    const body = {
      expectedArtifactSha256: readiness.artifactSha256,
      expectedDependencyDigest: readiness.dependencyDigest,
      validationRunId: readiness.validationRunId,
      format: 'PLAIN_TEXT' as const,
    };
    const started = currentGeneration.current;
    setHandoff({ status: 'pending' });
    setFocusTarget('handoff');
    try {
      const prepared = await write(intent.keyFor({ candidateId: candidate.id, body }), (auth) =>
        api.cases.candidates.readiness.exportUnsigned(candidate.id, body, auth),
      );
      intent.done();
      // Requested before a write that can change the readiness: the handoff is discarded, never
      // shown or offered for copying (the server re-evaluates any later request).
      if (currentGeneration.current !== started) return;
      setHandoff({ status: 'prepared', handoff: prepared });
    } catch (error) {
      if (currentGeneration.current !== started) return;
      // Never retried here: a change or a status that is not ready needs a new evaluation first.
      if (
        error instanceof ApiError &&
        error.status === 412 &&
        (error.code === 'CONTEXT_CHANGED' ||
          error.code === 'ARTIFACT_CHANGED' ||
          error.code === 'VALIDATION_RUN_CHANGED')
      ) {
        setHandoff({ status: 'changed', code: error.code });
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === 'CANDIDATE_NOT_READY'
      ) {
        const codes = error.details['reasonCodes'];
        setHandoff({
          status: 'not-ready',
          readinessStatus: String(error.details['status'] ?? ''),
          reasonCodes: Array.isArray(codes) ? codes.map(String) : [],
        });
      } else setHandoff({ status: 'failed', error });
    }
  }

  const readiness = evaluation.status === 'ready' ? evaluation.readiness : null;
  // After a refused handoff the evaluation is no longer the current one: it is not shown any more
  // (never as current), and only a new evaluation is offered.
  const outdated = handoff.status === 'changed' || handoff.status === 'not-ready';
  const canPrepare =
    readiness !== null &&
    !outdated &&
    readiness.status === 'READY_FOR_SIGNER' &&
    readiness.validationRunId !== null &&
    (handoff.status === 'none' || handoff.status === 'pending' || handoff.status === 'failed');
  return (
    <Section title="Readiness">
      <div data-testid="readiness-section">
        <p className="context-boundary" role="note" data-testid="readiness-boundary">
          {READINESS_BOUNDARY}
        </p>
        <ul className="readiness-qualifiers" data-testid="readiness-qualifiers">
          {READINESS_QUALIFIERS.map((qualifier) => (
            <li key={qualifier}>{qualifier}</li>
          ))}
        </ul>
        <div
          ref={outcome}
          tabIndex={-1}
          className="context-outcome"
          data-testid="readiness-outcome"
        >
          {evaluation.status === 'idle' && (
            <p className="absent" data-testid="readiness-not-evaluated">
              {NOT_EVALUATED}
            </p>
          )}
          {evaluation.status === 'loading' && (
            <LoadingNotice label="Evaluating the current readiness…" />
          )}
          {evaluation.status === 'error' && (
            <div className="notice notice-error" role="alert" data-testid="readiness-refused">
              <p>The current readiness of this candidate could not be evaluated.</p>
              {evaluation.error instanceof ApiError &&
              evaluation.error.code === 'BINDING_ALREADY_SUPERSEDED' ? (
                <p data-testid="readiness-scope-unavailable">{SCOPE_UNAVAILABLE}</p>
              ) : (
                <ErrorNotice error={evaluation.error} recordLabel="readiness" />
              )}
            </div>
          )}
          {readiness !== null && !outdated && <ReadinessView readiness={readiness} />}
          {readiness !== null && outdated && (
            <p className="absent" data-testid="readiness-outdated">
              {EVALUATION_OUTDATED}
            </p>
          )}
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={() => void evaluate()}
            disabled={evaluation.status === 'loading' || handoff.status === 'pending'}
            data-testid="readiness-evaluate"
          >
            {EVALUATE_LABEL}
          </button>
          {canPrepare && (
            <button
              type="button"
              className="button button-primary"
              onClick={() => void prepare(readiness)}
              disabled={handoff.status === 'pending'}
              aria-describedby="handoff-meaning"
              data-testid="handoff-prepare"
            >
              {handoff.status === 'pending' ? 'Preparing the unsigned handoff…' : PREPARE_LABEL}
            </button>
          )}
        </div>
        {canPrepare && (
          <p className="hint" id="handoff-meaning" data-testid="handoff-meaning">
            {HANDOFF_MEANING}
          </p>
        )}
        <div
          ref={handoffOutcome}
          tabIndex={-1}
          className="context-outcome"
          data-testid="handoff-outcome"
        >
          {handoff.status === 'changed' && (
            <div className="notice notice-error" role="alert" data-testid="handoff-changed">
              <p>
                <strong>{HANDOFF_CHANGED[handoff.code]}</strong>
              </p>
              <p>{NOTHING_PREPARED}</p>
            </div>
          )}
          {handoff.status === 'not-ready' && (
            <div className="notice notice-error" role="alert" data-testid="handoff-not-ready">
              <p>
                <strong>
                  Not ready now. The server evaluated the readiness again:{' '}
                  {STATUS_LABEL[handoff.readinessStatus as Status] ?? handoff.readinessStatus} (
                  <code>{handoff.readinessStatus}</code>).
                </strong>
              </p>
              <ReasonList codes={handoff.reasonCodes} testId="handoff-not-ready-reasons" />
              <p>{NOTHING_PREPARED}</p>
            </div>
          )}
          {handoff.status === 'failed' && (
            <ErrorNotice error={handoff.error} recordLabel="unsigned handoff" />
          )}
          {handoff.status === 'prepared' && <HandoffView handoff={handoff.handoff} />}
        </div>
      </div>
    </Section>
  );
}

/** One evaluation exactly as the server returned it: the status, the technical result, the gates. */
function ReadinessView({ readiness }: { readiness: Readiness }) {
  const ready = readiness.status === 'READY_FOR_SIGNER';
  return (
    <div
      className={`readiness-result readiness-${readiness.status.toLowerCase()}`}
      data-testid="readiness-result"
    >
      <h3 data-testid="readiness-status-heading">
        Current readiness:{' '}
        <span data-testid="readiness-status-label">{STATUS_LABEL[readiness.status]}</span>
      </h3>
      {ready ? (
        <div data-testid="readiness-ready-qualifier">
          <p className="context-boundary" role="note">
            {READY_QUALIFIER}
          </p>
          <p className="record-boundary">{READY_STILL_REQUIRED}</p>
        </div>
      ) : (
        <p data-testid="readiness-status-meaning">{STATUS_MEANING[readiness.status]}</p>
      )}
      <Details
        rows={[
          ['Derived status', <code data-testid="readiness-status-code">{readiness.status}</code>],
          [
            'Artifact SHA-256',
            <code className="digest" data-testid="readiness-artifact">
              {readiness.artifactSha256}
            </code>,
          ],
          [
            'Current dependency digest',
            <code className="digest" data-testid="readiness-digest">
              {readiness.dependencyDigest}
            </code>,
          ],
          [
            'Technical ruleset',
            <code data-testid="readiness-ruleset">{readiness.rulesetVersion}</code>,
          ],
          ['Evaluated', <Time iso={readiness.evaluatedAt} />],
          [
            'Signature state',
            <code data-testid="readiness-signature-state">{readiness.signatureState}</code>,
          ],
          [
            'External action',
            <code data-testid="readiness-external-action">{readiness.externalAction}</code>,
          ],
        ]}
      />
      {!ready && readiness.reasonCodes.length > 0 && (
        <div data-testid="readiness-why">
          <h4>Reasons</h4>
          <ReasonList codes={readiness.reasonCodes} testId="readiness-reasons" />
        </div>
      )}
      <div data-testid="readiness-technical">
        <h4>Technical validation</h4>
        <p className="hint">{TECHNICAL_QUALIFIER}</p>
        <Details
          rows={[
            [
              'Counted run result',
              readiness.technicalResult === null ? (
                <span className="absent" data-testid="readiness-technical-result">
                  None counted
                </span>
              ) : (
                <span data-testid="readiness-technical-result">
                  {RESULT_LABEL[readiness.technicalResult]}
                </span>
              ),
            ],
            [
              'Counted run',
              readiness.validationRunId === null ? (
                <span className="absent" data-testid="readiness-run">
                  None counted
                </span>
              ) : (
                <code data-testid="readiness-run">{readiness.validationRunId}</code>
              ),
            ],
          ]}
        />
      </div>
      <div data-testid="readiness-gates-section">
        <h4>G1–G6 reviews at the current epoch</h4>
        <p className="hint">
          Each gate counts only its own current confirmed PASS review: no gate makes up for another.
        </p>
        <ol className="readiness-gates" data-testid="readiness-gates">
          {readiness.gates.map((gate) => (
            <li key={gate.gate} data-testid="readiness-gate" data-gate={gate.gate}>
              <p>
                <strong>{GATE_LABEL[gate.gate]}</strong>:{' '}
                <span data-testid="readiness-gate-status">{GATE_STATUS_LABEL[gate.status]}</span>
              </p>
              <p className="hint">
                Counted review:{' '}
                {gate.assessmentId === null ? (
                  <span className="absent" data-testid="readiness-gate-assessment">
                    None
                  </span>
                ) : (
                  <code data-testid="readiness-gate-assessment">{gate.assessmentId}</code>
                )}
              </p>
              {gate.reasonCodes.length > 0 && (
                <ReasonList codes={gate.reasonCodes} testId="readiness-gate-reasons" />
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ReasonList({ codes, testId }: { codes: readonly string[]; testId: string }) {
  return (
    <ul className="readiness-reasons" data-testid={testId}>
      {codes.map((code) => (
        <li key={code} data-testid="readiness-reason">
          <code data-testid="readiness-reason-code">{code}</code> — {reasonText(code)}
        </li>
      ))}
    </ul>
  );
}

/** The unsigned handoff exactly as the server returned it: the stored text, unsigned and unsent. */
function HandoffView({ handoff }: { handoff: UnsignedExport }) {
  const envelope = handoff.envelope;
  const evaluated = handoff.readiness;
  return (
    <div className="handoff" data-testid="handoff">
      <h3 data-testid="handoff-heading">Unsigned handoff prepared</h3>
      <p className="stamps" data-testid="handoff-labels">
        <span className="stamp stamp-unsigned" data-testid="handoff-unsigned">
          UNSIGNED
        </span>{' '}
        <span className="stamp stamp-not-sent" data-testid="handoff-not-sent">
          NOT SENT
        </span>
      </p>
      <p className="context-boundary" role="note" data-testid="handoff-boundary">
        {HANDOFF_BOUNDARY}
      </p>
      <p className="record-boundary">{READY_QUALIFIER}</p>
      <Details
        rows={[
          ['From', <code data-testid="handoff-from">{envelope.from}</code>],
          ['To', <code data-testid="handoff-to">{envelope.to}</code>],
          [
            'Reply-To',
            envelope.replyTo ? (
              <code data-testid="handoff-reply-to">{envelope.replyTo}</code>
            ) : (
              <span className="absent" data-testid="handoff-reply-to">
                None
              </span>
            ),
          ],
          [
            'Reply thread (parent binding)',
            envelope.parentBindingId ? (
              <code>{envelope.parentBindingId}</code>
            ) : (
              <span className="absent">None</span>
            ),
          ],
          [
            'Signature state',
            <code data-testid="handoff-signature-state">{handoff.signatureState}</code>,
          ],
          [
            'Send performed',
            <span data-testid="handoff-send-performed">
              {handoff.sendPerformed ? String(handoff.sendPerformed) : 'No — nothing was sent'}
            </span>,
          ],
          ['Prepared', <Time iso={handoff.exportedAt} />],
        ]}
      />
      <p className="recorded-text-label">Subject</p>
      <pre className="captured-text" data-testid="handoff-subject" aria-label="Unsigned subject">
        {handoff.subject}
      </pre>
      <p className="recorded-text-label">Body</p>
      {/* Scrollable, so it is focusable: keyboard users scroll it too. */}
      <pre
        className="captured-text candidate-text"
        data-testid="handoff-body"
        tabIndex={0}
        aria-label="Unsigned body"
      >
        {handoff.bodyText}
      </pre>
      <CopyBody text={handoff.bodyText} />
      <Details
        rows={[
          [
            'Body SHA-256',
            <code className="digest" data-testid="handoff-body-sha256">
              {handoff.bodySha256}
            </code>,
          ],
          [
            'Artifact SHA-256',
            <code className="digest" data-testid="handoff-artifact-sha256">
              {handoff.artifactSha256}
            </code>,
          ],
        ]}
      />
      <div data-testid="handoff-readiness">
        <h4>Readiness evaluated for this handoff</h4>
        <Details
          rows={[
            [
              'Status',
              <span data-testid="handoff-readiness-status">
                {STATUS_LABEL[evaluated.status]} (<code>{evaluated.status}</code>)
              </span>,
            ],
            [
              'Dependency digest',
              <code className="digest" data-testid="handoff-readiness-digest">
                {evaluated.dependencyDigest}
              </code>,
            ],
            ['Technical ruleset', <code>{evaluated.rulesetVersion}</code>],
            [
              'Counted run',
              evaluated.validationRunId === null ? (
                <span className="absent">None</span>
              ) : (
                <code data-testid="handoff-readiness-run">{evaluated.validationRunId}</code>
              ),
            ],
            [
              'Counted reviews',
              <span data-testid="handoff-readiness-gates">
                {evaluated.gates.map((gate) => (
                  <span key={gate.gate} className="handoff-gate">
                    {gate.gate} <code>{gate.assessmentId ?? 'none'}</code>{' '}
                  </span>
                ))}
              </span>,
            ],
            ['Evaluated', <Time iso={evaluated.evaluatedAt} />],
          ]}
        />
      </div>
    </div>
  );
}

/** Copies the unsigned body text to the local clipboard; nothing else happens. */
function CopyBody({ text }: { text: string }) {
  const [status, setStatus] = useState<string | null>(null);
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setStatus('Copied to this computer’s clipboard. Nothing was sent.');
    } catch {
      setStatus(
        'The clipboard is not available in this browser. Select the body text and copy it instead.',
      );
    }
  }
  return (
    <div className="copy-prompt">
      <button
        type="button"
        className="button"
        onClick={() => void copy()}
        data-testid="handoff-copy-body"
      >
        Copy body text
      </button>
      <span role="status" className="hint" data-testid="handoff-copy-status">
        {status ?? ''}
      </span>
    </div>
  );
}
