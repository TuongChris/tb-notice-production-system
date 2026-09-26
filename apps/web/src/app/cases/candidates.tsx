// Notice candidates (P4F) of one case: the history of the candidates imported for it (summaries
// only), the import form, the page that shows one candidate exactly as stored — with the dedicated
// supersession of the draft artifact — and the revision form. A candidate is the exact unsigned
// draft artifact drafted outside this application (by a person, or a drafting tool the operator
// chose) from one prompt snapshot of this case, imported here for later validation and human
// review. It is never approved, signed, ready or sent: nothing here drafts, completes, checks the
// legal sufficiency of, validates, signs, sends, attaches, retracts or calls anything.
//
// Every text is sent exactly as entered — nothing is trimmed, normalized or filled in — and every
// stored text is shown as plain text only. The only values taken from the chosen prompt snapshot
// are its structural ones: the sender (the intended mailbox of the authority selection it names)
// and its reply thread (its parent binding); nothing legal or factual is filled in. A document plan
// names a source revision of the prompt snapshot's own source manifest and is a plan only. A
// revision is a new candidate (the revised one never changes); a supersession is recorded once and
// is an internal lifecycle step, never a retraction. Every page is keyed by the case (and
// candidate) id, and a candidate is shown only under its own case.
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  CreateCandidate,
  NoticeCandidate,
  PromptSnapshot,
  PromptSnapshotSummary,
  ReviseCandidate,
  SourceManifestEntry,
  SourceReference,
} from '@tb/contracts';
import { ApiError } from '../api/client.js';
import { useSession } from '../auth/session.js';
import { Time } from '../directory/agencies.js';
import { SelectField, TextField } from '../directory/fields.js';
import {
  describeError,
  DISCLOSURE_REVIEW_LABEL,
  HASH_TARGET_LABEL,
  issuesOf,
  PLAN_STATE_LABEL,
  TASK_TYPE_LABEL,
} from '../directory/format.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { useFlashMessage, useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  Details,
  ErrorNotice,
  LoadingNotice,
  Section,
  StatusNotice,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';
import { RecordedBy, SourceCitation } from '../representation/authority-ui.js';
import { CASE_ARCHIVED_READ_ONLY, NotInThisCase } from './intake-ui.js';
import { allPages, MODE_LABEL } from './production-context.js';
import { CandidateValidation } from './validation.js';

/** The permanent statement of what a candidate is (mission §32, verbatim). */
export const CANDIDATE_BOUNDARY =
  'This is an unsigned draft artifact. It is not approved, signed, ready, or sent.';
/** The supersession action and what it means (mission §35, verbatim). */
export const SUPERSEDE_TITLE = 'Supersede this draft artifact';
export const SUPERSEDE_MEANING =
  'Superseding marks this candidate as no longer the active draft artifact. It does not contact the platform or retract anything previously sent.';
const HISTORY_MEANING =
  'Each candidate is the exact draft — subject, envelope, body and document plan — drafted outside this application from one prompt snapshot of this case and imported here with its hashes. It never changes: a revision is a new candidate, and a superseded candidate stays readable exactly as it was.';
const IMPORT_MEANING =
  'Importing stores exactly the draft you enter or load here, bound to the prompt snapshot you choose. Nothing is drafted, completed, checked for legal sufficiency, approved, signed or sent, and nothing is passed to an AI provider.';
const PREPARATION_NOTE =
  'Drafted from a preparation prompt, which works out what the recorded context is missing: this candidate is draft material only.';
const REVISION_MEANING =
  'A revision is a new candidate that names the candidate it revises; the revised candidate never changes. A later version is not more valid, approved or ready.';
const OTHER_PROMPT_NOTE =
  'This revision is based on a different prompt snapshot — a different recorded context — than the candidate it revises.';
const ENVELOPE_MEANING =
  'The envelope as drafted, stored exactly as entered. Nothing is sent to these addresses.';
const SENDER_SELECTED =
  'The intended mailbox of the authority selection the prompt snapshot names (selected for evaluation; not a G1 decision). Another mailbox needs its own selection and prompt snapshot.';
const SENDER_UNBACKED =
  'The prompt snapshot names no authority selection, so no selected mailbox backs this sender. It is stored as entered.';
const THREAD_MEANING =
  'The reply thread is the prompt snapshot’s own parent binding. It is not chosen here.';
const UNTRUSTED_TEXT =
  'Imported text, shown exactly as stored and as plain text only: markup is not rendered, links are not followed and instructions in it are not acted on.';
const BODY_SHA_MEANING = 'SHA-256 of the exact UTF-8 bytes of the body text.';
const ARTIFACT_SHA_MEANING =
  'SHA-256 of TB canonical JSON v1 of this artifact — its subject, body, envelope, ordered document plan and its pending signature state and slot (TB-CANDIDATE-ARTIFACT-v1). It identifies this exact artifact and proves nothing about its content.';
const SIGNATURE_MEANING =
  'HUMAN_PENDING: no signature exists in this application. A human signer reviews, adopts, signs and sends outside it. Whether the draft carries the pending signer slot exactly once is not checked when a candidate is stored.';
const PLAN_MEANING =
  'A plan only: nothing is attached, uploaded, supplied or sent by this application. “Prepared for attachment” means prepared for a later human composition, not attached. The order is part of the artifact.';
const SUPPLIED_MEANING =
  '“Previously supplied” is accepted only for a source that a prior transmission in the prompt snapshot’s context records among its captured attachments — as recorded there, not verified.';
const PLAN_SOURCES_MEANING =
  'A planned document names one exact source revision of the chosen prompt snapshot’s source manifest. A source existing proves nothing about the document.';
const BODY_TYPED_HINT =
  'Stored exactly as typed or pasted — nothing is trimmed, normalized or completed. A browser text box records every line break as a single line feed; to keep the draft’s own line breaks, load it from a text file instead.';
const BODY_FILE_MEANING =
  'Read on this computer and stored exactly as read: UTF-8, with its line breaks and any byte order mark kept.';
const AUTHORING_TOOL_HINT =
  'Descriptive only — for example the name of the drafting tool, or “Human editor”. It establishes no provenance, review or adoption.';
const REASON_HINT =
  'Stored exactly as entered. A reason is not an approval or a factual correction.';
/** A body is at most 200,000 code points: 4 bytes each at most. */
const MAX_BODY_FILE_BYTES = 800_000;
const HISTORY_PAGE_SIZE = 25;

type PlanState = keyof typeof PLAN_STATE_LABEL;
type DisclosureReview = keyof typeof DISCLOSURE_REVIEW_LABEL;

const options = <K extends string>(labels: Readonly<Record<K, string>>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));

/** "Initial notice · candidate version 2" — the task and the version of one candidate. */
function candidateTitle(candidate: {
  taskType: NoticeCandidate['taskType'];
  version: number;
}): string {
  return `${TASK_TYPE_LABEL[candidate.taskType]} · candidate version ${candidate.version}`;
}

/** "Initial notice · prompt version 1 (Drafting)" — the task, version and mode of one prompt. */
function promptLabel(prompt: Pick<PromptSnapshot, 'taskType' | 'version' | 'generationMode'>) {
  return `${TASK_TYPE_LABEL[prompt.taskType]} · prompt version ${prompt.version} (${MODE_LABEL[prompt.generationMode]})`;
}

/** Plain text exactly as stored, in the captured-text treatment. */
function StoredText({
  text,
  testId,
  label,
  scrollable = false,
}: {
  text: string;
  testId: string;
  label: string;
  scrollable?: boolean;
}) {
  return (
    <pre
      className={`captured-text${scrollable ? ' candidate-text' : ''}`}
      data-testid={testId}
      aria-label={label}
      // Scrollable, so it is focusable: keyboard users scroll it too.
      tabIndex={scrollable ? 0 : undefined}
    >
      {text}
    </pre>
  );
}

function SupersededStamp() {
  return <span className="stamp stamp-superseded">Superseded artifact</span>;
}

// History -----------------------------------------------------------------------------------------

export function CandidateHistoryPage() {
  const { id = '' } = useParams();
  return <CandidateHistory key={id} caseId={id} />;
}

function CandidateHistory({ caseId }: { caseId: string }) {
  const api = useDirectoryApi();
  const [caseState] = useLoad(`candidates-case:${caseId}`, () => api.cases.get(caseId));
  // The prompt snapshots of this case, to name each candidate's prompt (summaries only).
  const [prompts] = useLoad(`candidates-prompts:${caseId}`, () =>
    allPages((cursor) =>
      api.cases.prompts.list(caseId, { limit: 100, ...(cursor ? { cursor } : {}) }),
    ),
  );
  // The cursors of the pages shown so far: the last one is the page on screen (none = the newest).
  const [cursors, setCursors] = useState<readonly string[]>([]);
  const cursor = cursors.at(-1);
  const [state, reload] = useLoad(`candidates:${caseId}:${cursor ?? ''}`, () =>
    api.cases.candidates.list(caseId, {
      limit: HISTORY_PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
    }),
  );
  const promptById = new Map(
    (prompts.status === 'ready' ? prompts.value : []).map((prompt) => [prompt.id, prompt]),
  );
  const label = caseState.status === 'ready' ? caseState.value.data.intakeLabel : 'Case';
  const trail = [
    ['Cases', '/cases'],
    [label, `/cases/${caseId}`],
    ['Candidates', null],
  ] as const;
  if (caseState.status === 'error') {
    return (
      <article className="sheet" data-testid="candidate-history">
        <Breadcrumbs trail={trail} />
        <ErrorNotice error={caseState.error} recordLabel="case" />
      </article>
    );
  }
  const archived = caseState.status === 'ready' && caseState.value.data.archivedAt !== null;
  return (
    <article className="sheet" data-testid="candidate-history">
      <Breadcrumbs trail={trail} />
      <header className="record-header">
        <h1 className="record-name">Candidates</h1>
        {caseState.status === 'ready' && (
          <div className="record-facts">
            <span className="record-fact">{caseState.value.data.intakeLabel}</span>
          </div>
        )}
        <p className="context-boundary" role="note" data-testid="candidate-history-boundary">
          {CANDIDATE_BOUNDARY}
        </p>
      </header>
      <Section
        title="Candidate history"
        actions={
          archived ? (
            <UnavailableAction label="Import a candidate" reason={CASE_ARCHIVED_READ_ONLY} />
          ) : (
            <Link
              className="button button-primary"
              to={`/cases/${caseId}/candidates/new`}
              data-testid="open-import-candidate"
            >
              Import a candidate
            </Link>
          )
        }
      >
        <p className="hint">{HISTORY_MEANING}</p>
        {state.status === 'loading' && <LoadingNotice label="Loading candidates…" />}
        {state.status === 'error' && (
          <ErrorNotice error={state.error} recordLabel="case" onRetry={reload} />
        )}
        {state.status === 'ready' && state.value.items.length === 0 && (
          <p className="absent" data-testid="candidates-empty">
            {cursor === undefined
              ? 'No candidate has been imported for this case.'
              : 'No older candidate.'}
          </p>
        )}
        {state.status === 'ready' && state.value.items.length > 0 && (
          <div className="table-frame">
            <table className="records" data-testid="candidates">
              <caption className="visually-hidden">Candidates of this case, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Candidate</th>
                  <th scope="col">Prompt snapshot</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Signature state</th>
                  <th scope="col">Imported</th>
                  <th scope="col">Supersession</th>
                  <th scope="col">Body SHA-256</th>
                  <th scope="col">Artifact SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {state.value.items.map((candidate) => {
                  const prompt = promptById.get(candidate.promptSnapshotId);
                  return (
                    <tr key={candidate.id} data-testid="candidate-row">
                      <th scope="row">
                        <Link to={`/cases/${caseId}/candidates/${candidate.id}`}>
                          {candidateTitle(candidate)}
                        </Link>
                      </th>
                      <td>
                        <Link to={`/cases/${caseId}/prompts/${candidate.promptSnapshotId}`}>
                          {prompt ? (
                            promptLabel(prompt)
                          ) : (
                            <code className="digest">{candidate.promptSnapshotId}</code>
                          )}
                        </Link>
                      </td>
                      <td className="candidate-subject-cell">{candidate.subject}</td>
                      <td>
                        <code>{candidate.signatureState}</code>
                      </td>
                      <td>
                        <Time iso={candidate.createdAt} />
                      </td>
                      <td>
                        {candidate.supersededAt === null ? (
                          'Not superseded'
                        ) : (
                          <>
                            <SupersededStamp /> <Time iso={candidate.supersededAt} />
                          </>
                        )}
                      </td>
                      <td>
                        <code className="digest">{candidate.bodySha256}</code>
                      </td>
                      <td>
                        <code className="digest">{candidate.artifactSha256}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {state.status === 'ready' && (cursors.length > 0 || state.value.nextCursor !== null) && (
          <nav aria-label="Candidate pages" className="form-actions">
            {cursors.length > 0 && (
              <button type="button" className="button" onClick={() => setCursors([])}>
                Newest candidates
              </button>
            )}
            {state.value.nextCursor !== null && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  const next = state.value.nextCursor;
                  if (next !== null) setCursors([...cursors, next]);
                }}
              >
                Older candidates
              </button>
            )}
          </nav>
        )}
      </Section>
    </article>
  );
}

// Detail ------------------------------------------------------------------------------------------

export function CandidateDetailPage() {
  const { id = '', candidateId = '' } = useParams();
  return <CandidateDetail key={`${id}:${candidateId}`} caseId={id} candidateId={candidateId} />;
}

function CandidateDetail({ caseId, candidateId }: { caseId: string; candidateId: string }) {
  const api = useDirectoryApi();
  // Shown once after storing here: cleared from history, so a reload does not repeat it.
  const stored = useFlashMessage();
  const [message, setMessage] = useState<string | null>(stored);
  const { state: session } = useSession();
  const currentUserId = session.status === 'authenticated' ? session.session.user.id : '';
  const [caseState] = useLoad(`candidate-case:${caseId}`, () => api.cases.get(caseId));
  const [state, reload, replace] = useLoad(`candidate:${candidateId}`, () =>
    api.cases.candidates.get(candidateId),
  );
  const candidate = state.status === 'ready' && state.value.caseId === caseId ? state.value : null;
  const promptId = candidate?.promptSnapshotId ?? '';
  const [prompt] = useLoad(`candidate-prompt-of:${promptId}`, async () =>
    promptId === '' ? null : api.cases.prompts.get(promptId),
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const supersession = useRef<HTMLHeadingElement>(null);
  // Superseded here: the supersession replaces the form, and focus moves to it once it is shown.
  const [supersededHere, setSupersededHere] = useState(false);
  useEffect(() => {
    if (stored !== null && state.status === 'ready') heading.current?.focus();
  }, [stored, state.status]);
  useEffect(() => {
    if (supersededHere) supersession.current?.focus();
  }, [supersededHere, state]);
  const label = caseState.status === 'ready' ? caseState.value.data.intakeLabel : 'Case';
  const trail = [
    ['Cases', '/cases'],
    [label, `/cases/${caseId}`],
    ['Candidates', `/cases/${caseId}/candidates`],
  ] as const;
  if (state.status === 'loading') return <LoadingNotice label="Loading candidate…" />;
  // Another case's candidate is shown exactly like an unknown one: nothing of it appears here.
  const notHere =
    (state.status === 'error' && state.error instanceof ApiError && state.error.status === 404) ||
    (state.status === 'ready' && candidate === null);
  if (state.status === 'error' || candidate === null || notHere) {
    return (
      <article className="sheet" data-testid="candidate-detail">
        <Breadcrumbs trail={[...trail, ['Candidate', null]]} />
        <h1>Candidate</h1>
        {notHere || state.status !== 'error' ? (
          <NotInThisCase caseId={caseId} noun="candidate" testId="candidate-not-found" />
        ) : (
          <ErrorNotice error={state.error} recordLabel="candidate" onRetry={reload} />
        )}
      </article>
    );
  }
  const loadedPrompt = prompt.status === 'ready' ? prompt.value : null;
  const selection = loadedPrompt?.contextJson.authority?.selection ?? null;
  const archived = caseState.status === 'ready' && caseState.value.data.archivedAt !== null;
  const envelope = candidate.envelopeJson;
  return (
    <article className="sheet" data-testid="candidate-detail">
      <Breadcrumbs trail={[...trail, [candidateTitle(candidate), null]]} />
      <header className="record-header">
        <h1 className="record-name" ref={heading} tabIndex={-1}>
          Candidate: {candidateTitle(candidate)}
        </h1>
        <div className="record-facts">
          <span className="record-fact" data-testid="candidate-signature-state">
            Signature state <code>{candidate.signatureState}</code>
          </span>
          {candidate.supersededAt !== null && <SupersededStamp />}
        </div>
        <p className="context-boundary" role="note" data-testid="candidate-boundary">
          {CANDIDATE_BOUNDARY}
        </p>
        {loadedPrompt?.generationMode === 'PREPARATION' && (
          <p className="record-boundary" data-testid="candidate-preparation">
            {PREPARATION_NOTE}
          </p>
        )}
      </header>
      <StatusNotice message={message} />
      <Section title="Draft artifact">
        <div data-testid="candidate-facts">
          <Details
            rows={[
              ['Version', String(candidate.version)],
              ['Task', `${TASK_TYPE_LABEL[candidate.taskType]} (${candidate.taskType})`],
              [
                'Prompt snapshot',
                <Link
                  to={`/cases/${caseId}/prompts/${candidate.promptSnapshotId}`}
                  data-testid="candidate-prompt-link"
                >
                  {loadedPrompt ? (
                    promptLabel(loadedPrompt)
                  ) : (
                    <code>{candidate.promptSnapshotId}</code>
                  )}
                </Link>,
              ],
              [
                'Revises',
                candidate.parentCandidateId && (
                  <Link
                    to={`/cases/${caseId}/candidates/${candidate.parentCandidateId}`}
                    data-testid="candidate-parent-link"
                  >
                    <code>{candidate.parentCandidateId}</code>
                  </Link>
                ),
              ],
              ['Authoring tool (descriptive only)', candidate.authoringTool],
              ['Revision reason', candidate.revisionReason],
              ['Imported', <Time iso={candidate.createdAt} />],
              [
                'Imported by',
                <RecordedBy userId={candidate.createdById} currentUserId={currentUserId} />,
              ],
              ['Record id', <code>{candidate.id}</code>],
            ]}
          />
        </div>
      </Section>
      <Section title="Envelope">
        <p className="hint">{ENVELOPE_MEANING}</p>
        <div data-testid="candidate-envelope">
          <Details
            rows={[
              ['From', <code>{envelope.from}</code>],
              ['To', <code>{envelope.to}</code>],
              ['Reply-To', envelope.replyTo && <code>{envelope.replyTo}</code>],
              [
                'Reply thread (parent binding)',
                envelope.parentBindingId ? (
                  <code data-testid="candidate-parent-binding">{envelope.parentBindingId}</code>
                ) : (
                  'None: an initial notice, or a prompt snapshot that named no parent message'
                ),
              ],
            ]}
          />
        </div>
        {loadedPrompt !== null && (
          <p className="hint" data-testid="candidate-sender-note">
            {selection === null ? SENDER_UNBACKED : SENDER_SELECTED}
          </p>
        )}
      </Section>
      <Section title="Subject">
        <p className="hint">{UNTRUSTED_TEXT}</p>
        <StoredText text={candidate.subject} testId="candidate-subject" label="Candidate subject" />
      </Section>
      <Section title="Body">
        <p className="hint">{UNTRUSTED_TEXT}</p>
        <StoredText
          text={candidate.bodyText}
          testId="candidate-body"
          label="Candidate body"
          scrollable
        />
        <Details
          rows={[
            [
              'Body SHA-256',
              <code className="digest" data-testid="candidate-body-sha256">
                {candidate.bodySha256}
              </code>,
            ],
          ]}
        />
        <p className="hint">{BODY_SHA_MEANING}</p>
      </Section>
      <Section title="Document plan">
        <p className="hint">{PLAN_MEANING}</p>
        <PlanTable plans={candidate.preparedDocuments} />
      </Section>
      <Section title="Signature">
        <Details rows={[['Signature state', <code>{candidate.signatureState}</code>]]} />
        <p className="hint">{SIGNATURE_MEANING}</p>
      </Section>
      <Section title="Artifact hash">
        <Details
          rows={[
            [
              'Artifact SHA-256',
              <code className="digest" data-testid="candidate-artifact-sha256">
                {candidate.artifactSha256}
              </code>,
            ],
          ]}
        />
        <p className="hint">{ARTIFACT_SHA_MEANING}</p>
      </Section>
      <CandidateValidation
        caseId={caseId}
        candidate={candidate}
        prompt={loadedPrompt}
        promptError={prompt.status === 'error' ? prompt.error : null}
        archived={archived}
      />
      {candidate.supersededAt !== null ? (
        <section className="sheet-section" aria-labelledby="candidate-superseded-heading">
          <div className="section-heading">
            <h2 id="candidate-superseded-heading" ref={supersession} tabIndex={-1}>
              Superseded artifact
            </h2>
          </div>
          <div data-testid="candidate-supersession">
            <Details
              rows={[
                ['Superseded', <Time iso={candidate.supersededAt} />],
                ['Reason', candidate.supersedeReason],
              ]}
            />
          </div>
          <p className="hint">
            This candidate is no longer the active draft artifact. It stays readable exactly as it
            was stored. This is not a retraction: nothing was sent, contacted or retracted.
          </p>
        </section>
      ) : (
        <SupersedeSection
          candidate={candidate}
          archived={archived}
          onSuperseded={(next) => {
            replace(next);
            setMessage(
              'Draft artifact superseded. Nothing was sent, contacted or retracted, and the candidate itself is unchanged.',
            );
            setSupersededHere(true);
          }}
        />
      )}
      <Section title="Revision">
        <p className="hint">{REVISION_MEANING}</p>
        {archived ? (
          <UnavailableAction
            label="Import a revision of this candidate"
            reason={CASE_ARCHIVED_READ_ONLY}
          />
        ) : (
          <p>
            <Link
              to={`/cases/${caseId}/candidates/${candidate.id}/revise`}
              data-testid="open-revise-candidate"
            >
              Import a revision of this candidate
            </Link>
          </p>
        )}
      </Section>
      <p>
        <Link to={`/cases/${caseId}/candidates`}>Back to the candidates of this case</Link>
      </p>
    </article>
  );
}

/** The document plan exactly as stored, in its order: a plan, never an attachment record. */
function PlanTable({ plans }: { plans: NoticeCandidate['preparedDocuments'] }) {
  if (plans.length === 0) {
    return (
      <p className="absent" data-testid="candidate-plans-empty">
        No document is planned.
      </p>
    );
  }
  return (
    <div className="table-frame">
      <table className="records" data-testid="candidate-plans">
        <caption className="visually-hidden">Planned documents, in their stored order</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Source revision</th>
            <th scope="col">Purpose</th>
            <th scope="col">Planned state</th>
            <th scope="col">File name</th>
            <th scope="col">Content SHA-256 named</th>
            <th scope="col">Disclosure review</th>
            <th scope="col">Limitations</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan, index) => (
            <tr key={index} data-testid="candidate-plan-row">
              <th scope="row">{index + 1}</th>
              <td>
                <SourceCitation sourceId={plan.sourceId} />
              </td>
              <td className="candidate-plan-text">{plan.purpose}</td>
              <td>{PLAN_STATE_LABEL[plan.state]}</td>
              <td>{plan.fileName ?? <span className="absent">Not recorded</span>}</td>
              <td>
                {plan.contentSha256 ? (
                  <code className="digest">{plan.contentSha256}</code>
                ) : (
                  <span className="absent">None named</span>
                )}
              </td>
              <td>{DISCLOSURE_REVIEW_LABEL[plan.disclosureReview]}</td>
              <td className="candidate-plan-text">
                {plan.limitations ?? <span className="absent">Not recorded</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The dedicated supersession: recorded once, with its reason; an internal lifecycle step only. */
function SupersedeSection({
  candidate,
  archived,
  onSuperseded,
}: {
  candidate: NoticeCandidate;
  archived: boolean;
  onSuperseded: (candidate: NoticeCandidate) => void;
}) {
  const api = useDirectoryApi();
  const submission = useSubmission();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const issue = issuesOf(submission.error).find((entry) => entry.path === 'reason');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason === '') {
      setProblem('Enter why this draft artifact is superseded.');
      document.getElementById('candidate-supersede-reason')?.focus();
      return;
    }
    setProblem(null);
    const body = { reason };
    const outcome = await submission.submit({ candidateId: candidate.id, body }, (auth) =>
      api.cases.candidates.supersede(candidate.id, body, auth),
    );
    if (outcome.ok) onSuperseded(outcome.value);
  }

  return (
    <Section title={SUPERSEDE_TITLE}>
      <p className="hint" data-testid="candidate-supersede-meaning">
        {SUPERSEDE_MEANING}
      </p>
      {archived ? (
        <UnavailableAction label={SUPERSEDE_TITLE} reason={CASE_ARCHIVED_READ_ONLY} />
      ) : (
        <form
          noValidate
          className="link-form"
          onSubmit={(event) => void onSubmit(event)}
          data-testid="candidate-supersede-form"
        >
          <TextField
            id="candidate-supersede-reason"
            label="Reason"
            required
            multiline
            hint="Stored with this candidate exactly as entered; the audit trail keeps only its length. A supersession is recorded once and never changed."
            value={reason}
            error={problem ?? issue?.message}
            onChange={setReason}
          />
          {submission.error !== null && issue === undefined && (
            <ErrorNotice error={submission.error} recordLabel="candidate" focusOnShow />
          )}
          <button
            type="submit"
            className="button"
            disabled={submission.pending}
            data-testid="candidate-supersede-button"
          >
            {submission.pending ? 'Superseding…' : SUPERSEDE_TITLE}
          </button>
        </form>
      )}
    </Section>
  );
}

// Import and revision -----------------------------------------------------------------------------

export function ImportCandidatePage() {
  const { id = '' } = useParams();
  return <ImportCandidateFlow key={id} caseId={id} />;
}

function ImportCandidateFlow({ caseId }: { caseId: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const [caseState] = useLoad(`candidate-import-case:${caseId}`, () => api.cases.get(caseId));
  const [prompts] = useLoad(`candidate-import-prompts:${caseId}`, () =>
    allPages((cursor) =>
      api.cases.prompts.list(caseId, { limit: 100, ...(cursor ? { cursor } : {}) }),
    ),
  );
  const trail = [['Cases', '/cases']] as const;
  if (caseState.status === 'loading') return <LoadingNotice label="Loading case…" />;
  if (caseState.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Import a candidate', null]]} />
        <ErrorNotice error={caseState.error} recordLabel="case" />
      </>
    );
  }
  const record = caseState.value.data;
  return (
    <article className="sheet" data-testid="candidate-import">
      <Breadcrumbs
        trail={[
          ...trail,
          [record.intakeLabel, `/cases/${caseId}`],
          ['Candidates', `/cases/${caseId}/candidates`],
          ['Import a candidate', null],
        ]}
      />
      <h1>Import a candidate</h1>
      <p className="context-boundary" role="note" data-testid="candidate-import-boundary">
        {CANDIDATE_BOUNDARY}
      </p>
      <p className="page-intro">{IMPORT_MEANING}</p>
      {record.archivedAt !== null ? (
        <p className="notice notice-quiet" data-testid="candidate-case-archived">
          {CASE_ARCHIVED_READ_ONLY}
        </p>
      ) : prompts.status === 'loading' ? (
        <LoadingNotice label="Loading the prompt snapshots of this case…" />
      ) : prompts.status === 'error' ? (
        <ErrorNotice error={prompts.error} recordLabel="case" />
      ) : (
        <CandidateForm
          caseId={caseId}
          prompts={prompts.value}
          notOffered={0}
          parent={null}
          onStored={(candidate) =>
            navigate(`/cases/${caseId}/candidates/${candidate.id}`, {
              state: {
                flash: `Candidate stored: ${candidateTitle(candidate)}. It is an unsigned draft artifact; nothing was sent.`,
              } satisfies FlashState,
            })
          }
        />
      )}
    </article>
  );
}

export function ReviseCandidatePage() {
  const { id = '', candidateId = '' } = useParams();
  return <ReviseCandidateFlow key={`${id}:${candidateId}`} caseId={id} candidateId={candidateId} />;
}

function ReviseCandidateFlow({ caseId, candidateId }: { caseId: string; candidateId: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const [caseState] = useLoad(`candidate-revise-case:${caseId}`, () => api.cases.get(caseId));
  const [state, reload] = useLoad(`candidate-revise:${candidateId}`, () =>
    api.cases.candidates.get(candidateId),
  );
  const [prompts] = useLoad(`candidate-revise-prompts:${caseId}`, () =>
    allPages((cursor) =>
      api.cases.prompts.list(caseId, { limit: 100, ...(cursor ? { cursor } : {}) }),
    ),
  );
  const label = caseState.status === 'ready' ? caseState.value.data.intakeLabel : 'Case';
  const trail = [
    ['Cases', '/cases'],
    [label, `/cases/${caseId}`],
    ['Candidates', `/cases/${caseId}/candidates`],
  ] as const;
  if (state.status === 'loading' || caseState.status === 'loading') {
    return <LoadingNotice label="Loading candidate…" />;
  }
  const parent = state.status === 'ready' && state.value.caseId === caseId ? state.value : null;
  if (parent === null) {
    const unknown =
      state.status === 'ready' || (state.error instanceof ApiError && state.error.status === 404);
    return (
      <article className="sheet" data-testid="candidate-revise">
        <Breadcrumbs trail={[...trail, ['Revision', null]]} />
        <h1>Import a revision</h1>
        {unknown ? (
          <NotInThisCase caseId={caseId} noun="candidate" testId="candidate-not-found" />
        ) : (
          <ErrorNotice error={state.error} recordLabel="candidate" onRetry={reload} />
        )}
      </article>
    );
  }
  if (caseState.status === 'error') {
    return <ErrorNotice error={caseState.error} recordLabel="case" />;
  }
  const all = prompts.status === 'ready' ? prompts.value : [];
  // A revision keeps its task: only prompt snapshots of the same task are offered.
  const offered = all.filter((prompt) => prompt.taskType === parent.taskType);
  return (
    <article className="sheet" data-testid="candidate-revise">
      <Breadcrumbs
        trail={[
          ...trail,
          [candidateTitle(parent), `/cases/${caseId}/candidates/${parent.id}`],
          ['Revision', null],
        ]}
      />
      <h1>Import a revision of {candidateTitle(parent)}</h1>
      <p className="context-boundary" role="note" data-testid="candidate-revise-boundary">
        {CANDIDATE_BOUNDARY}
      </p>
      <p className="page-intro">{REVISION_MEANING}</p>
      <Section title="Candidate revised">
        <div data-testid="candidate-revise-parent">
          <Details
            rows={[
              [
                'Candidate',
                <Link to={`/cases/${caseId}/candidates/${parent.id}`}>
                  {candidateTitle(parent)}
                </Link>,
              ],
              [
                'Prompt snapshot',
                <Link to={`/cases/${caseId}/prompts/${parent.promptSnapshotId}`}>
                  <code>{parent.promptSnapshotId}</code>
                </Link>,
              ],
              [
                'Artifact SHA-256',
                <code className="digest" data-testid="candidate-revise-parent-sha">
                  {parent.artifactSha256}
                </code>,
              ],
              [
                'Supersession',
                parent.supersededAt === null ? 'Not superseded' : <SupersededStamp />,
              ],
            ]}
          />
        </div>
        <p className="hint">
          It stays exactly as stored. The revision below is imported as a new candidate naming it.
        </p>
      </Section>
      {caseState.value.data.archivedAt !== null ? (
        <p className="notice notice-quiet" data-testid="candidate-case-archived">
          {CASE_ARCHIVED_READ_ONLY}
        </p>
      ) : prompts.status === 'loading' ? (
        <LoadingNotice label="Loading the prompt snapshots of this case…" />
      ) : prompts.status === 'error' ? (
        <ErrorNotice error={prompts.error} recordLabel="case" />
      ) : (
        <CandidateForm
          caseId={caseId}
          prompts={offered}
          notOffered={all.length - offered.length}
          parent={parent}
          onStored={(candidate) =>
            navigate(`/cases/${caseId}/candidates/${candidate.id}`, {
              state: {
                flash: `Revision stored: ${candidateTitle(candidate)}, revising candidate version ${parent.version}, which is unchanged. Nothing was sent.`,
              } satisfies FlashState,
            })
          }
        />
      )}
    </article>
  );
}

interface PlanRow {
  readonly sourceId: string;
  readonly purpose: string;
  readonly state: PlanState | '';
  readonly fileName: string;
  /** Name the SHA-256 recorded on the source revision (only when it records one). */
  readonly namesHash: boolean;
  readonly disclosureReview: DisclosureReview | '';
  readonly limitations: string;
}

const EMPTY_PLAN: PlanRow = {
  sourceId: '',
  purpose: '',
  state: '',
  fileName: '',
  namesHash: false,
  disclosureReview: '',
  limitations: '',
};

type Body =
  | { readonly kind: 'typed'; readonly text: string }
  | { readonly kind: 'file'; readonly name: string; readonly text: string };

const PLAN_FIELD_LABEL: Record<string, string> = {
  sourceId: 'source',
  purpose: 'purpose',
  state: 'planned state',
  fileName: 'file name',
  contentSha256: 'content SHA-256',
  disclosureReview: 'disclosure review',
  limitations: 'limitations',
};

const ENVELOPE_FIELD_LABEL: Record<string, string> = {
  from: 'from',
  to: 'to',
  replyTo: 'reply-to',
  parentBindingId: 'reply thread',
};

const FIELD_LABEL: Record<string, string> = {
  promptSnapshotId: 'Prompt snapshot',
  subject: 'Subject',
  envelope: 'Envelope',
  bodyText: 'Body',
  preparedDocuments: 'Document plan',
  authoringTool: 'Authoring tool',
  revisionReason: 'Revision reason',
};

function issueLabel(path: string): string {
  const [head = '', second, third] = path.split('.');
  if (head === 'envelope' && second !== undefined) {
    return `Envelope ${ENVELOPE_FIELD_LABEL[second] ?? second}`;
  }
  if (head === 'preparedDocuments' && second !== undefined && /^\d+$/.test(second)) {
    const field = third === undefined ? '' : `: ${PLAN_FIELD_LABEL[third] ?? third}`;
    return `Planned document ${Number(second) + 1}${field}`;
  }
  return FIELD_LABEL[head] ?? path;
}

/** The input of an issue path; a planned document's fields have their own inputs. */
function candidateFieldId(path: string, body: Body): string | null {
  const [head, second, third] = path.split('.');
  if (head === 'promptSnapshotId') return 'candidate-promptSnapshotId';
  if (head === 'subject') return 'candidate-subject';
  if (head === 'bodyText')
    return body.kind === 'typed' ? 'candidate-bodyText' : 'candidate-body-preview';
  if (head === 'authoringTool') return 'candidate-authoringTool';
  if (head === 'revisionReason') return 'candidate-revisionReason';
  if (head === 'envelope') {
    if (second === 'parentBindingId') return 'candidate-envelope-thread';
    return second === undefined ? null : `candidate-envelope-${second}`;
  }
  if (head === 'preparedDocuments' && second !== undefined && /^\d+$/.test(second)) {
    return `candidate-plan-${second}-${third ?? 'sourceId'}`;
  }
  return null;
}

/** An optional value: sent exactly as entered (nothing trimmed), not sent when empty. */
function exact<K extends string>(key: K, value: string): Partial<Record<K, string>> {
  return value === '' ? {} : ({ [key]: value } as Record<K, string>);
}

/** Sources a prior transmission of the prompt's context records among its captured attachments. */
function suppliedSources(prompt: PromptSnapshot): ReadonlySet<string> {
  const priors = new Set(prompt.contextJson.priorCorrespondenceIds);
  const sources = new Set<string>();
  for (const message of prompt.contextJson.correspondence) {
    if (!priors.has(message.id)) continue;
    for (const attachment of message.attachmentsManifest ?? []) {
      if (typeof attachment.sourceId === 'string') sources.add(attachment.sourceId);
    }
  }
  return sources;
}

interface ChosenPrompt {
  readonly prompt: PromptSnapshot;
  /** One manifest entry per source revision, in manifest order. */
  readonly entries: readonly SourceManifestEntry[];
  readonly titles: ReadonlyMap<string, SourceReference | null>;
}

function CandidateForm({
  caseId,
  prompts,
  notOffered,
  parent,
  onStored,
}: {
  caseId: string;
  /** The prompt snapshots offered (this case's; for a revision, those of its task). */
  prompts: readonly PromptSnapshotSummary[];
  /** How many prompt snapshots of this case are not offered (another task). */
  notOffered: number;
  /** The candidate revised, or null for an initial import. */
  parent: NoticeCandidate | null;
  onStored: (candidate: NoticeCandidate) => void;
}) {
  const api = useDirectoryApi();
  const submission = useSubmission();
  const [promptId, setPromptId] = useState('');
  const [subject, setSubject] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [body, setBody] = useState<Body>({ kind: 'typed', text: '' });
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [authoringTool, setAuthoringTool] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [chosen] = useLoad<ChosenPrompt | null>(`candidate-form-prompt:${promptId}`, async () => {
    if (promptId === '') return null;
    const prompt = await api.cases.prompts.get(promptId);
    const seen = new Set<string>();
    const entries = prompt.sourceManifest.filter((entry) => {
      if (seen.has(entry.sourceId)) return false;
      seen.add(entry.sourceId);
      return true;
    });
    const titles = new Map(
      await Promise.all(
        entries.map((entry) =>
          api.sources.get(entry.sourceId).then(
            (source) => [entry.sourceId, source] as const,
            () => [entry.sourceId, null] as const,
          ),
        ),
      ),
    );
    return { prompt, entries, titles };
  });
  const loaded =
    chosen.status === 'ready' && chosen.value?.prompt.id === promptId ? chosen.value : null;
  const prompt = loaded?.prompt ?? null;
  const selectedMailbox = prompt?.contextJson.authority?.selection.intendedFromEmail ?? null;
  const supplied = prompt === null ? new Set<string>() : suppliedSources(prompt);
  const entryOf = (sourceId: string) =>
    loaded?.entries.find((entry) => entry.sourceId === sourceId) ?? null;
  const issues = issuesOf(submission.error);
  const refusal = submission.error instanceof ApiError ? submission.error : null;
  const refusalField =
    refusal !== null && typeof refusal.details['field'] === 'string'
      ? refusal.details['field']
      : null;
  const refusedAtField =
    refusalField !== null && candidateFieldId(refusalField, body) !== null ? refusalField : null;
  const headId =
    refusal?.code === 'REVISION_NOT_HEAD' && typeof refusal.details['headId'] === 'string'
      ? refusal.details['headId']
      : null;
  const errorFor = (path: string) =>
    clientErrors[path] ??
    issues.find((issue) => issue.path === path)?.message ??
    (refusedAtField === path ? describeError(refusal, 'candidate') : undefined);
  const updatePlan = (index: number, change: Partial<PlanRow>) =>
    setPlans((rows) => rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const movePlan = (index: number, offset: -1 | 1) =>
    setPlans((rows) => {
      const target = index + offset;
      if (target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      [next[index], next[target]] = [next[target] as PlanRow, next[index] as PlanRow];
      return next;
    });

  function choosePrompt(id: string) {
    setPromptId(id);
    // A planned document names a source of the chosen prompt snapshot: choose them again.
    setPlans((rows) => rows.map((row) => ({ ...row, sourceId: '', namesHash: false })));
    setClientErrors({});
    submission.reset();
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    // Cleared, so the same file can be loaded again after a change.
    input.value = '';
    if (!file) return;
    if (file.size > MAX_BODY_FILE_BYTES) {
      setFileProblem('That file is larger than a candidate body can be, so nothing was loaded.');
      return;
    }
    try {
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        await file.arrayBuffer(),
      );
      setBody({ kind: 'file', name: file.name, text });
      setFileProblem(null);
    } catch {
      setFileProblem('That file is not UTF-8 text, so nothing was loaded.');
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    const sender = selectedMailbox ?? from;
    if (promptId === '') {
      problems['promptSnapshotId'] = 'Choose the prompt snapshot this draft was made from.';
    } else if (prompt === null) {
      problems['promptSnapshotId'] = 'The prompt snapshot is still loading. Try again.';
    }
    if (subject === '') problems['subject'] = 'Enter the subject exactly as drafted.';
    if (sender === '') problems['envelope.from'] = 'Enter the sender address as drafted.';
    if (to === '') problems['envelope.to'] = 'Enter the recipient address as drafted.';
    if (body.text === '') problems['bodyText'] = 'Enter the body, or load it from a text file.';
    plans.forEach((row, index) => {
      const at = `preparedDocuments.${index}`;
      if (row.sourceId === '') problems[`${at}.sourceId`] = 'Choose the source of this document.';
      if (row.purpose === '') problems[`${at}.purpose`] = 'Enter the purpose as planned.';
      if (row.state === '') problems[`${at}.state`] = 'Choose the planned state.';
      if (row.disclosureReview === '') {
        problems[`${at}.disclosureReview`] = 'Choose the disclosure review as recorded.';
      }
    });
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined || prompt === null) {
      const fieldId = first === undefined ? null : candidateFieldId(first, body);
      if (fieldId !== null) document.getElementById(fieldId)?.focus();
      return;
    }
    const envelope = {
      from: sender,
      to,
      ...exact('replyTo', replyTo),
      ...(prompt.parentBindingId === null ? {} : { parentBindingId: prompt.parentBindingId }),
    };
    const preparedDocuments = plans.map((row) => {
      const recorded = entryOf(row.sourceId)?.contentSha256 ?? null;
      return {
        sourceId: row.sourceId,
        purpose: row.purpose,
        state: row.state as PlanState,
        ...exact('fileName', row.fileName),
        ...(row.namesHash && recorded !== null ? { contentSha256: recorded } : {}),
        disclosureReview: row.disclosureReview as DisclosureReview,
        ...exact('limitations', row.limitations),
      };
    });
    const common = {
      promptSnapshotId: promptId,
      subject,
      envelope,
      bodyText: body.text,
      preparedDocuments,
      ...exact('authoringTool', authoringTool),
    };
    const outcome =
      parent === null
        ? await (async () => {
            const request: CreateCandidate = {
              ...common,
              ...exact('revisionReason', revisionReason),
            };
            return submission.submit({ caseId, request }, (auth) =>
              api.cases.candidates.import(caseId, request, auth),
            );
          })()
        : await (async () => {
            const request: ReviseCandidate = {
              ...common,
              revisionReason: revisionReason === '' ? null : revisionReason,
            };
            return submission.submit({ candidateId: parent.id, request }, (auth) =>
              api.cases.candidates.revise(parent.id, request, auth),
            );
          })();
    if (outcome.ok) {
      onStored(outcome.value);
      return;
    }
    const failure = outcome.error;
    if (failure instanceof ApiError && typeof failure.details['field'] === 'string') {
      const fieldId = candidateFieldId(failure.details['field'], body);
      if (fieldId !== null) document.getElementById(fieldId)?.focus();
    }
  }

  const otherPrompt = parent !== null && promptId !== '' && promptId !== parent.promptSnapshotId;
  return (
    <>
      <ValidationSummary
        issues={issues}
        label={issueLabel}
        fieldId={(path) => candidateFieldId(path, body)}
      />
      {headId !== null && (
        <div className="notice notice-error" role="alert" data-testid="candidate-not-head">
          <p>{describeError(refusal, 'candidate')}</p>
          <p>
            <Link to={`/cases/${caseId}/candidates/${headId}`}>Open the latest version</Link>
          </p>
        </div>
      )}
      {submission.error !== null &&
        issues.length === 0 &&
        refusedAtField === null &&
        headId === null && (
          <ErrorNotice error={submission.error} recordLabel="candidate" focusOnShow />
        )}
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="record-form candidate-form"
        data-testid="candidate-form"
      >
        <fieldset
          className="fieldset"
          id="candidate-promptSnapshotId"
          tabIndex={-1}
          data-testid="candidate-prompt-choices"
          aria-describedby="candidate-prompt-hint"
        >
          <legend>
            Prompt snapshot <span className="required">(required)</span>
          </legend>
          <p className="hint" id="candidate-prompt-hint">
            The prompt snapshot of this case the draft was made from. Nothing is preselected.
            {parent === null
              ? ''
              : ' A revision keeps its task: only prompt snapshots of the same task are offered.'}
          </p>
          {prompts.length === 0 && (
            <p className="absent" data-testid="candidate-no-prompts">
              {parent === null
                ? 'No prompt snapshot has been generated for this case. A candidate is imported from one.'
                : 'No prompt snapshot of this task exists for this case.'}{' '}
              <Link to={`/cases/${caseId}/prompts/new`}>Generate a prompt</Link>
            </p>
          )}
          {prompts.map((summary) => (
            <label key={summary.id} className="choice">
              <input
                type="radio"
                name="candidate-prompt"
                value={summary.id}
                checked={promptId === summary.id}
                onChange={() => choosePrompt(summary.id)}
              />
              <span className="choice-text">
                <span className="choice-title">{promptLabel(summary)}</span>
                <span className="choice-meta">
                  {' '}
                  Generated <Time iso={summary.createdAt} /> · context revision{' '}
                  {summary.contextRevision}
                  {parent !== null && summary.id === parent.promptSnapshotId
                    ? ' · the prompt snapshot of the candidate revised'
                    : ''}
                </span>
              </span>
            </label>
          ))}
          {notOffered > 0 && (
            <p className="hint" data-testid="candidate-prompts-not-offered">
              {notOffered} prompt snapshot{notOffered === 1 ? '' : 's'} of another task not offered.
            </p>
          )}
          {errorFor('promptSnapshotId') && (
            <p className="field-error">{errorFor('promptSnapshotId')}</p>
          )}
        </fieldset>
        {promptId !== '' && chosen.status === 'loading' && (
          <LoadingNotice label="Loading the prompt snapshot…" />
        )}
        {promptId !== '' && chosen.status === 'error' && (
          <ErrorNotice error={chosen.error} recordLabel="prompt" />
        )}
        {prompt !== null && (
          <div className="context-block" data-testid="candidate-prompt-facts">
            <h3>Chosen prompt snapshot</h3>
            <Details
              rows={[
                ['Task', `${TASK_TYPE_LABEL[prompt.taskType]} (${prompt.taskType})`],
                ['Mode', `${MODE_LABEL[prompt.generationMode]} (${prompt.generationMode})`],
                ['Version', String(prompt.version)],
                ['Context revision', String(prompt.contextRevision)],
                [
                  'Dependency digest',
                  <code className="digest" data-testid="candidate-prompt-digest">
                    {prompt.dependencyDigest}
                  </code>,
                ],
                ['Prompt SHA-256', <code className="digest">{prompt.promptSha256}</code>],
                ['Generated', <Time iso={prompt.createdAt} />],
              ]}
            />
            {prompt.generationMode === 'PREPARATION' && (
              <p className="hint" data-testid="candidate-form-preparation">
                A preparation prompt works out what the recorded context is missing. A candidate
                drafted from it is stored as draft material only.
              </p>
            )}
            {otherPrompt && (
              <p className="notice notice-quiet" data-testid="candidate-other-prompt">
                {OTHER_PROMPT_NOTE} A later version is not more valid, approved or ready.
              </p>
            )}
          </div>
        )}
        <fieldset className="fieldset">
          <legend>Subject</legend>
          <TextField
            id="candidate-subject"
            label="Subject"
            required
            hint="Exactly as drafted — nothing is trimmed or normalized."
            value={subject}
            error={errorFor('subject')}
            onChange={setSubject}
          />
        </fieldset>
        <fieldset className="fieldset" data-testid="candidate-envelope-fields">
          <legend>Envelope</legend>
          <p className="hint">{ENVELOPE_MEANING}</p>
          <div className="field-grid">
            {selectedMailbox !== null ? (
              <TextField
                id="candidate-envelope-from"
                label="From"
                type="email"
                value={selectedMailbox}
                locked={SENDER_SELECTED}
                error={errorFor('envelope.from')}
                onChange={() => undefined}
              />
            ) : (
              <TextField
                id="candidate-envelope-from"
                label="From"
                required
                type="email"
                hint={prompt === null ? 'Choose the prompt snapshot first.' : SENDER_UNBACKED}
                value={from}
                error={errorFor('envelope.from')}
                onChange={setFrom}
              />
            )}
            <TextField
              id="candidate-envelope-to"
              label="To"
              required
              type="email"
              hint="The recipient address as drafted."
              value={to}
              error={errorFor('envelope.to')}
              onChange={setTo}
            />
            <TextField
              id="candidate-envelope-replyTo"
              label="Reply-To (optional)"
              type="email"
              value={replyTo}
              error={errorFor('envelope.replyTo')}
              onChange={setReplyTo}
            />
          </div>
          <div className="field" data-testid="candidate-envelope-thread">
            <p className="field-static-label">Reply thread (parent binding)</p>
            <p id="candidate-envelope-thread" tabIndex={-1} className="field-static">
              {prompt === null ? (
                <span className="hint">Choose the prompt snapshot first.</span>
              ) : prompt.parentBindingId === null ? (
                'None: the prompt snapshot names no parent message.'
              ) : (
                <code>{prompt.parentBindingId}</code>
              )}
            </p>
            <p className="hint">{THREAD_MEANING}</p>
            {errorFor('envelope.parentBindingId') && (
              <p className="field-error">{errorFor('envelope.parentBindingId')}</p>
            )}
          </div>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Body</legend>
          {body.kind === 'typed' ? (
            <TextField
              id="candidate-bodyText"
              label="Body"
              required
              multiline
              hint={BODY_TYPED_HINT}
              value={body.text}
              error={errorFor('bodyText')}
              onChange={(text) => setBody({ kind: 'typed', text })}
            />
          ) : (
            <div className={`field${errorFor('bodyText') ? ' field-invalid' : ''}`}>
              <p className="field-static-label" id="candidate-body-file-label">
                Body loaded from the file {body.name}
              </p>
              <p className="hint" data-testid="candidate-body-file-meaning">
                {BODY_FILE_MEANING} {Array.from(body.text).length} characters.
              </p>
              <pre
                id="candidate-body-preview"
                className="captured-text candidate-text"
                tabIndex={0}
                aria-labelledby="candidate-body-file-label"
                data-testid="candidate-body-preview"
              >
                {body.text}
              </pre>
              {errorFor('bodyText') && <p className="field-error">{errorFor('bodyText')}</p>}
              <button
                type="button"
                className="button-quiet"
                onClick={() => setBody({ kind: 'typed', text: '' })}
              >
                Type or paste the body instead
              </button>
            </div>
          )}
          <div className="field">
            <label htmlFor="candidate-body-file">Load the body from a text file (optional)</label>
            <p className="hint" id="candidate-body-file-hint">
              A UTF-8 text file on this computer. It replaces the body above; nothing else is read.
            </p>
            <input
              id="candidate-body-file"
              type="file"
              accept=".txt,text/plain"
              aria-describedby="candidate-body-file-hint"
              onChange={(event) => void onFile(event)}
            />
            {fileProblem !== null && (
              <p className="field-error" role="alert">
                {fileProblem}
              </p>
            )}
          </div>
        </fieldset>
        <fieldset className="fieldset" data-testid="candidate-plan-rows">
          <legend>Document plan (optional)</legend>
          <p className="hint">{PLAN_MEANING}</p>
          <p className="hint">{PLAN_SOURCES_MEANING}</p>
          <p className="hint">{SUPPLIED_MEANING}</p>
          {plans.map((row, index) => {
            const entry = entryOf(row.sourceId);
            const at = `preparedDocuments.${index}`;
            return (
              <div key={index} className="repeat-row" data-testid="candidate-plan-editor">
                <SelectField
                  id={`candidate-plan-${index}-sourceId`}
                  label={`Planned document ${index + 1}: source revision`}
                  required
                  value={row.sourceId}
                  placeholder={
                    loaded === null ? 'Choose the prompt snapshot first' : 'Choose a source'
                  }
                  options={(loaded?.entries ?? []).map((item) => {
                    const source = loaded?.titles.get(item.sourceId) ?? null;
                    return {
                      value: item.sourceId,
                      label:
                        source === null
                          ? `${item.sourceId} — ${item.role}`
                          : `${source.title} — revision ${source.revision}, ${item.role}`,
                    };
                  })}
                  error={errorFor(`${at}.sourceId`)}
                  onChange={(sourceId) => updatePlan(index, { sourceId, namesHash: false })}
                />
                <TextField
                  id={`candidate-plan-${index}-purpose`}
                  label="Purpose"
                  required
                  hint="What the document is for, as planned."
                  value={row.purpose}
                  error={errorFor(`${at}.purpose`)}
                  onChange={(purpose) => updatePlan(index, { purpose })}
                />
                <SelectField
                  id={`candidate-plan-${index}-state`}
                  label="Planned state"
                  required
                  hint={
                    row.state !== 'PREVIOUSLY_SUPPLIED' || row.sourceId === ''
                      ? undefined
                      : supplied.has(row.sourceId)
                        ? 'A prior transmission in this prompt snapshot’s context records this source among its captured attachments (as recorded, not verified).'
                        : 'No prior transmission in this prompt snapshot’s context records this source among its captured attachments.'
                  }
                  value={row.state}
                  placeholder="Choose the planned state"
                  options={options(PLAN_STATE_LABEL)}
                  error={errorFor(`${at}.state`)}
                  onChange={(state) => updatePlan(index, { state: state as PlanState | '' })}
                />
                <TextField
                  id={`candidate-plan-${index}-fileName`}
                  label="File name as planned (optional)"
                  value={row.fileName}
                  error={errorFor(`${at}.fileName`)}
                  onChange={(fileName) => updatePlan(index, { fileName })}
                />
                <div className="field">
                  {entry?.contentSha256 ? (
                    <label className="choice" htmlFor={`candidate-plan-${index}-contentSha256`}>
                      <input
                        id={`candidate-plan-${index}-contentSha256`}
                        type="checkbox"
                        checked={row.namesHash}
                        onChange={(event) => updatePlan(index, { namesHash: event.target.checked })}
                      />
                      <span className="choice-text">
                        <span className="choice-title">
                          Name the SHA-256 recorded on this source revision
                        </span>
                        <span className="choice-meta">
                          {' '}
                          <code className="digest">{entry.contentSha256}</code>, recorded over the{' '}
                          {entry.hashTarget
                            ? HASH_TARGET_LABEL[entry.hashTarget]
                            : 'content its source names'}{' '}
                          — not over any future email attachment.
                        </span>
                      </span>
                    </label>
                  ) : (
                    <p className="hint" id={`candidate-plan-${index}-contentSha256`} tabIndex={-1}>
                      {row.sourceId === ''
                        ? 'A SHA-256 can be named once a source is chosen, when its revision records one.'
                        : 'This source revision records no SHA-256, so none can be named.'}
                    </p>
                  )}
                  {errorFor(`${at}.contentSha256`) && (
                    <p className="field-error">{errorFor(`${at}.contentSha256`)}</p>
                  )}
                </div>
                <SelectField
                  id={`candidate-plan-${index}-disclosureReview`}
                  label="Disclosure review"
                  required
                  hint="As recorded — not an approval."
                  value={row.disclosureReview}
                  placeholder="Choose as recorded"
                  options={options(DISCLOSURE_REVIEW_LABEL)}
                  error={errorFor(`${at}.disclosureReview`)}
                  onChange={(value) =>
                    updatePlan(index, { disclosureReview: value as DisclosureReview | '' })
                  }
                />
                <TextField
                  id={`candidate-plan-${index}-limitations`}
                  label="Limitations (optional)"
                  multiline
                  value={row.limitations}
                  error={errorFor(`${at}.limitations`)}
                  onChange={(limitations) => updatePlan(index, { limitations })}
                />
                <div className="form-actions">
                  <button
                    type="button"
                    className="button-quiet"
                    disabled={index === 0}
                    onClick={() => movePlan(index, -1)}
                  >
                    Move planned document {index + 1} up
                  </button>
                  <button
                    type="button"
                    className="button-quiet"
                    disabled={index === plans.length - 1}
                    onClick={() => movePlan(index, 1)}
                  >
                    Move planned document {index + 1} down
                  </button>
                  <button
                    type="button"
                    className="button-quiet"
                    onClick={() => setPlans((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Remove planned document {index + 1}
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            disabled={loaded === null}
            onClick={() => setPlans((rows) => [...rows, EMPTY_PLAN])}
            data-testid="candidate-add-plan"
          >
            Add a planned document
          </button>
        </fieldset>
        <fieldset className="fieldset">
          <legend>About this draft</legend>
          <TextField
            id="candidate-authoringTool"
            label="Authoring tool (optional)"
            hint={AUTHORING_TOOL_HINT}
            value={authoringTool}
            error={errorFor('authoringTool')}
            onChange={setAuthoringTool}
          />
          <TextField
            id="candidate-revisionReason"
            label={
              parent === null ? 'Reason (optional)' : 'Why this revision was drafted (optional)'
            }
            multiline
            hint={REASON_HINT}
            value={revisionReason}
            error={errorFor('revisionReason')}
            onChange={setRevisionReason}
          />
        </fieldset>
        <div className="form-actions">
          <button
            type="submit"
            className="button button-primary"
            disabled={submission.pending}
            data-testid="candidate-store"
          >
            {submission.pending
              ? 'Storing…'
              : parent === null
                ? 'Store this candidate'
                : 'Store this revision'}
          </button>
          <Link to={`/cases/${caseId}/candidates`}>Cancel</Link>
        </div>
        <p className="hint">
          Storing records this exact draft and its hashes. Nothing is validated, approved, signed or
          sent.
        </p>
      </form>
    </>
  );
}
