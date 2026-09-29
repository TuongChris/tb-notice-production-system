// Candidate assessments (P4H) of one notice candidate, shown on the candidate's page: the recorded
// G1–G6 reviews of this exact artifact, each bound to one evaluation epoch (the artifact SHA-256,
// the dependency digest of the prompt snapshot's scope and the technical ruleset), and the form that
// records a new one. A recorded review's supports are read back from the server every time they are
// opened (getCandidateAssessmentSources, TB-SCHEMA-API-v1.4.0) and shown exactly as stored; the
// present state of each supporting link is a separate read, labelled as present state.
//
// Recording a review decides nothing else: an assessment is never readiness, READY_FOR_SIGNER, G7, a
// signature, notice adoption or permission to send, and it changes no technical validation run.
// Nothing here waives, disposes of or overrides a technical issue. The current context is read
// first and shown; a review is recorded only against exactly that read (the server refuses with 412
// when anything changed, and the page then requires a new read — it never retries). No field has a
// substantive default: the gate, result, scope state, performer and provenance are always chosen.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  CandidateAssessment,
  CaptureAssessment,
  CaseSource,
  ContextView,
  NoticeCandidate,
  PromptSnapshot,
  ValidationRunSummary,
} from '@tb/contracts';
import { ApiError } from '../api/client.js';
import { useSession } from '../auth/session.js';
import { Time } from '../directory/agencies.js';
import { SelectField, TextField } from '../directory/fields.js';
import {
  describeError,
  issuesOf,
  LINK_STATE_LABEL,
  PROVENANCE_LABEL,
  type FieldIssue,
} from '../directory/format.js';
import { useDirectoryApi, useIntentKey, useLoad, useWrite } from '../directory/hooks.js';
import {
  Details,
  ErrorNotice,
  LoadingNotice,
  Section,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';
import { RecordedBy } from '../representation/authority-ui.js';
import { CASE_ARCHIVED_READ_ONLY } from './intake-ui.js';
import { allPages, notApplicableCitations } from './production-context.js';
import { promptScopeOf, RESULT_LABEL, TECHNICAL_RULESET_VERSION } from './validation.js';

type Gate = CaptureAssessment['gate'];
type Result = CaptureAssessment['result'];
type ScopeState = CaptureAssessment['scopeState'];
type PerformerKind = CaptureAssessment['performerKind'];
type Provenance = CaptureAssessment['provenance'];

/** What the section is (and is not). */
export const ASSESSMENT_BOUNDARY =
  'A candidate assessment records one attributable G1–G6 review of this exact artifact at one evaluation epoch — its artifact SHA-256, the current dependency digest of its prompt snapshot’s scope and the technical ruleset — with the linked sources the review rests on. Recording a review decides nothing else: it is not G7, a signature, notice adoption, readiness or permission to send, and it changes no technical validation run.';
/** The history's qualifier (mission §30, verbatim). */
export const ASSESSMENT_HISTORY_QUALIFIER =
  'Recorded G1–G6 review history. Not G7, not a signature, not readiness and not permission to send.';
/** A superseded candidate (mission §35, verbatim). */
export const ASSESSMENT_SUPERSEDED_NOTE =
  'This candidate is superseded. A review recorded here is historical and cannot count toward current readiness.';
/** An inapplicable linked source in the picker (mission §34, verbatim). */
export const NOT_APPLICABLE_SUPPORT_NOTE =
  'This source is not currently applicable to the Case scope; it may be cited to record the problem, but cannot support a PASS.';
/** D-4 (mission §35, verbatim). */
export const AI_DOCUMENT_REVIEW_NOTE =
  'DOCUMENT_REVIEWED requires an actual human document review.';
/** The present state of a supporting link (mission §31, verbatim). */
export const PRESENT_STATE_LABEL =
  'Present CaseSource state — not the state recorded by the historical assessment.';
/** The scope state copy (mission §24, verbatim). */
export const SCOPE_STATE_LABEL: Readonly<Record<ScopeState, string>> = {
  RECORDED_NOT_ADOPTED: 'Scope not confirmed for this candidate.',
  SCOPE_CONFIRMED_FOR_CANDIDATE: 'Scope confirmed for this candidate and evaluation epoch.',
};
export const SCOPE_STATE_NOTE = 'This is not signature, notice adoption or G7.';
export const ASSESSMENT_CONTEXT_CHANGED =
  'Context changed. Read the current context before recording an assessment again.';
export const ASSESSMENT_ARTIFACT_CHANGED =
  'Artifact changed. The stored artifact is not the one shown on this page: reload the page before recording an assessment.';
export const RECORD_ASSESSMENT_LABEL = 'Record assessment';
export const SHOW_SUPPORTS_LABEL = 'Show recorded supports';
export const ASSESSMENT_NOT_HERE =
  'This assessment could not be shown here: it is not a recorded assessment of this candidate.';
const HISTORY_NOTE =
  'Every review of this candidate stays readable exactly as recorded, newest first, also after it is superseded by a later review of its gate or the candidate is superseded. Its supports are read back from the server each time they are opened.';
const DIGEST_STALE =
  'Changed since the last read: not known until the current context is read again.';

/** The gates (CLAUDE.md, permanent terminology; G7 is the human act outside the application). */
export const GATE_LABEL: Readonly<Record<Gate, string>> = {
  G1: 'G1 — authority and standing',
  G2: 'G2 — work-specific rights',
  G3: 'G3 — reported-material identification',
  G4: 'G4 — evidence and audiovisual comparison',
  G5: 'G5 — permission and copyright exceptions',
  G6: 'G6 — exact candidate artifact consistency, traceability and whole-artifact QA',
};
const GATES = Object.keys(GATE_LABEL) as Gate[];
const RESULT_MEANING: Readonly<Record<Result, string>> = {
  PASS: 'the review of this gate is recorded as a PASS for this exact artifact and epoch, resting only on sources that apply to the case now',
  HOLD: 'the review is on hold: something must happen before this gate can be concluded',
  BLOCKED: 'the review found a blocker for this gate',
  MISSING: 'material this gate needs is missing; the supports name what was checked',
  CONFLICT: 'the material conflicts; the conflict is recorded, not resolved here',
};
const RESULTS = Object.keys(RESULT_MEANING) as Result[];
export const PERFORMER_LABEL: Readonly<Record<PerformerKind, string>> = {
  HUMAN: 'Human reviewer',
  AI_ASSISTED: 'AI-assisted analysis',
  DOCUMENTED_EXTERNAL_REVIEW: 'Documented external review',
};
const PERFORMER_MEANING: Readonly<Record<PerformerKind, string>> = {
  HUMAN: 'a person who performed this review',
  AI_ASSISTED: 'an analysis the operator records; it cannot record a document review',
  DOCUMENTED_EXTERNAL_REVIEW:
    'the operator’s report of an actual documented human review made outside this application',
};
const PERFORMERS = Object.keys(PERFORMER_LABEL) as PerformerKind[];
const PROVENANCES = Object.keys(PROVENANCE_LABEL) as Provenance[];
const EXTERNAL_REVIEW_NOTE =
  'Record “Document reviewed” for a documented external review only as your explicit report of an actual human review of the documents. It is never inferred from a file name, link, source record or metadata.';
const ASSESSED_AT_HINT =
  'Optional. The instant the review was actually made, as an ISO 8601 date and time with its offset (for example 2026-09-28T09:30:00Z). Left empty, none is recorded — the recording time is never used instead.';
const TEXT_HINT =
  'Kept exactly as typed. A text box records line breaks as LF; nothing is trimmed or normalized.';

interface SupportDraft {
  readonly selected: boolean;
  readonly conclusion: string;
}

export function CandidateAssessments({
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
  const [assessments, reload] = useLoad(`assessments:${candidate.id}`, () =>
    allPages((cursor) =>
      api.cases.candidates.assessments.list(candidate.id, {
        limit: 100,
        ...(cursor ? { cursor } : {}),
      }),
    ),
  );
  const [latest, setLatest] = useState<CandidateAssessment | null>(null);
  const recorded = assessments.status === 'ready' ? assessments.value : [];
  return (
    <Section title="G1–G6 review record">
      <p className="context-boundary" role="note" data-testid="assessment-boundary">
        {ASSESSMENT_BOUNDARY}
      </p>
      {candidate.supersededAt !== null && (
        <p className="record-boundary" data-testid="assessment-superseded">
          {ASSESSMENT_SUPERSEDED_NOTE}
        </p>
      )}
      {promptError !== null ? (
        <ErrorNotice error={promptError} recordLabel="prompt snapshot" />
      ) : prompt === null ? (
        <LoadingNotice label="Loading the prompt snapshot…" />
      ) : archived ? (
        <UnavailableAction label={RECORD_ASSESSMENT_LABEL} reason={CASE_ARCHIVED_READ_ONLY} />
      ) : (
        <CaptureForm
          caseId={caseId}
          candidate={candidate}
          prompt={prompt}
          recorded={recorded}
          onRecorded={(assessment) => {
            setLatest(assessment);
            reload();
          }}
        />
      )}
      {latest !== null && (
        <div className="assessment-latest" data-testid="assessment-latest">
          <AssessmentRecord
            assessment={latest}
            caseId={caseId}
            candidateId={candidate.id}
            successors={[]}
            focus
            justRecorded
          />
        </div>
      )}
      <h3>Recorded reviews of this candidate</h3>
      <p className="context-boundary" role="note" data-testid="assessment-history-qualifier">
        {ASSESSMENT_HISTORY_QUALIFIER}
      </p>
      <p className="hint">{HISTORY_NOTE}</p>
      {assessments.status === 'loading' && <LoadingNotice label="Loading recorded reviews…" />}
      {assessments.status === 'error' && (
        <ErrorNotice error={assessments.error} recordLabel="assessments" onRetry={reload} />
      )}
      {assessments.status === 'ready' &&
        (recorded.length === 0 ? (
          <p className="absent" data-testid="assessment-history-empty">
            No review is recorded for this candidate.
          </p>
        ) : (
          <ul className="assessment-history" data-testid="assessment-history">
            {recorded.map((assessment) => (
              <li key={assessment.id} data-testid="assessment-history-item">
                <AssessmentRecord
                  assessment={assessment}
                  caseId={caseId}
                  candidateId={candidate.id}
                  successors={recorded.filter(
                    (entry) => entry.supersedesAssessmentId === assessment.id,
                  )}
                  focus={false}
                  justRecorded={false}
                />
              </li>
            ))}
          </ul>
        ))}
    </Section>
  );
}

/** What one read found: the current context, this case's links and the epoch's recorded runs. */
interface EpochRead {
  readonly view: ContextView;
  readonly links: readonly CaseSource[];
  readonly runs: readonly ValidationRunSummary[];
}

function CaptureForm({
  caseId,
  candidate,
  prompt,
  recorded,
  onRecorded,
}: {
  caseId: string;
  candidate: NoticeCandidate;
  prompt: PromptSnapshot;
  recorded: readonly CandidateAssessment[];
  onRecorded: (assessment: CandidateAssessment) => void;
}) {
  const api = useDirectoryApi();
  const write = useWrite();
  const intent = useIntentKey();
  // Nothing is read until asked: a review is recorded only against a read the operator saw.
  const [read, setRead] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; value: EpochRead }
    | { status: 'error'; error: unknown }
  >({ status: 'idle' });
  const [changed, setChanged] = useState<'CONTEXT_CHANGED' | 'ARTIFACT_CHANGED' | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [clientIssues, setClientIssues] = useState<FieldIssue[]>([]);
  const [pending, setPending] = useState(false);
  const [gate, setGate] = useState<Gate | ''>('');
  const [result, setResult] = useState<Result | ''>('');
  const [scopeState, setScopeState] = useState<ScopeState | ''>('');
  const [performerKind, setPerformerKind] = useState<PerformerKind | ''>('');
  const [performerLabel, setPerformerLabel] = useState('');
  const [provenance, setProvenance] = useState<Provenance | ''>('');
  const [assessedAt, setAssessedAt] = useState('');
  const [rationale, setRationale] = useState('');
  const [scopeText, setScopeText] = useState('');
  const [limitations, setLimitations] = useState('');
  const [supersedes, setSupersedes] = useState('');
  const [supports, setSupports] = useState<Readonly<Record<string, SupportDraft>>>({});
  const outcome = useRef<HTMLDivElement>(null);
  const [focusOutcome, setFocusOutcome] = useState(false);
  useEffect(() => {
    if (focusOutcome && read.status !== 'loading') outcome.current?.focus();
  }, [focusOutcome, read, changed]);

  async function readEpoch() {
    setFocusOutcome(true);
    setChanged(null);
    setFailure(null);
    setRead({ status: 'loading' });
    try {
      const view = await api.cases.productionContext(caseId, promptScopeOf(prompt));
      const links = await allPages((cursor) =>
        api.cases.sources.list(caseId, { limit: 100, ...(cursor ? { cursor } : {}) }),
      );
      const runs = await allPages((cursor) =>
        api.cases.candidates.validation.list(candidate.id, {
          q: view.dependencyDigest,
          limit: 100,
          ...(cursor ? { cursor } : {}),
        }),
      );
      setRead({ status: 'ready', value: { view, links, runs } });
    } catch (error) {
      setRead({ status: 'error', error });
    }
  }

  const epoch = read.status === 'ready' ? read.value : null;
  const view = epoch?.view ?? null;
  // Only the case's LINKED sources can support a new review; the context marks those that no
  // longer apply to the case's scope (the page derives nothing itself).
  const linked = (epoch?.links ?? []).filter((link) => link.linkState === 'LINKED');
  const notApplicable =
    view === null ? new Set<string>() : notApplicableCitations(view.context).sources;
  const inapplicable = (link: CaseSource) => notApplicable.has(link.sourceId);
  const epochRuns = (epoch?.runs ?? []).filter(
    (run) =>
      run.rulesetVersion === TECHNICAL_RULESET_VERSION &&
      run.dependencyDigest === view?.dependencyDigest &&
      run.artifactSha256 === candidate.artifactSha256,
  );
  const selectedLinks = linked.filter((link) => supports[link.id]?.selected === true);
  // Heads of the chosen gate's chains: a successor names the latest assessment of its chain.
  const heads = recorded.filter(
    (entry) =>
      entry.gate === gate && !recorded.some((other) => other.supersedesAssessmentId === entry.id),
  );

  function chooseResult(next: Result | '') {
    setResult(next);
    if (next === 'PASS') {
      // A PASS rests only on sources that apply now: inapplicable ones are not cited.
      setSupports((current) => {
        const kept: Record<string, SupportDraft> = { ...current };
        for (const link of linked) {
          const entry = kept[link.id];
          if (inapplicable(link) && entry?.selected) kept[link.id] = { ...entry, selected: false };
        }
        return kept;
      });
    }
  }
  function choosePerformer(next: PerformerKind | '') {
    setPerformerKind(next);
    if (next === 'AI_ASSISTED' && provenance === 'DOCUMENT_REVIEWED') setProvenance('');
  }
  function updateSupport(linkId: string, change: Partial<SupportDraft>) {
    setSupports((current) => ({
      ...current,
      [linkId]: { selected: false, conclusion: '', ...current[linkId], ...change },
    }));
  }

  function body(currentView: ContextView): CaptureAssessment | null {
    const issues: FieldIssue[] = [];
    const required = (value: string, path: string, message: string) => {
      if (value === '') issues.push({ path, message });
    };
    required(gate, 'gate', 'Choose the gate this review covers.');
    required(result, 'result', 'Choose the recorded result.');
    required(scopeState, 'scopeState', 'Choose the scope state.');
    required(performerKind, 'performerKind', 'Choose who performed the review.');
    required(performerLabel, 'performerLabel', 'Name the performer.');
    required(provenance, 'provenance', 'Choose the provenance.');
    required(rationale, 'rationale', 'Enter the rationale.');
    required(scopeText, 'scopeText', 'Enter the scope of the review.');
    if (selectedLinks.length === 0) {
      issues.push({
        path: 'sources',
        message: 'Cite at least one linked source that was checked.',
      });
    }
    selectedLinks.forEach((link, index) => {
      if ((supports[link.id]?.conclusion ?? '') === '') {
        issues.push({
          path: `sources.${index}.supportedConclusion`,
          message: 'Enter what this source supports.',
        });
      }
    });
    setClientIssues(issues);
    if (
      issues.length > 0 ||
      gate === '' ||
      result === '' ||
      scopeState === '' ||
      performerKind === '' ||
      provenance === ''
    ) {
      return null;
    }
    return {
      gate,
      result,
      expectedArtifactSha256: candidate.artifactSha256,
      expectedDependencyDigest: currentView.dependencyDigest,
      rulesetVersion: TECHNICAL_RULESET_VERSION,
      scopeState,
      performerKind,
      performerLabel,
      provenance,
      rationale,
      scopeText,
      ...(limitations === '' ? {} : { limitations }),
      ...(assessedAt === '' ? {} : { assessedAt }),
      ...(supersedes === '' ? {} : { supersedesAssessmentId: supersedes }),
      sources: selectedLinks.map((link) => ({
        caseSourceId: link.id,
        supportedConclusion: supports[link.id]?.conclusion ?? '',
      })),
    };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view === null) return;
    const payload = body(view);
    if (payload === null) return;
    setPending(true);
    setFailure(null);
    try {
      const assessment = await write(
        intent.keyFor({ candidateId: candidate.id, payload }),
        (auth) => api.cases.candidates.assessments.capture(candidate.id, payload, auth),
      );
      intent.done();
      setFocusOutcome(false);
      setGate('');
      setResult('');
      setScopeState('');
      setPerformerKind('');
      setPerformerLabel('');
      setProvenance('');
      setAssessedAt('');
      setRationale('');
      setScopeText('');
      setLimitations('');
      setSupersedes('');
      setSupports({});
      onRecorded(assessment);
    } catch (error) {
      // Never retried here: a changed context or artifact needs a new read first.
      if (error instanceof ApiError && error.status === 412) {
        setFocusOutcome(true);
        setChanged(error.code === 'ARTIFACT_CHANGED' ? 'ARTIFACT_CHANGED' : 'CONTEXT_CHANGED');
      } else {
        setFailure(error);
        const target = refusalFieldId(error, selectedLinks);
        if (target !== null) document.getElementById(target)?.focus();
      }
    } finally {
      setPending(false);
    }
  }

  const serverIssues = issuesOf(failure);
  const refusedField = refusalFieldId(failure, selectedLinks);
  const refusalText = failure === null ? null : describeError(failure, 'assessment');
  const errorAt = (path: string, id: string) =>
    clientIssues.find((issue) => issue.path === path)?.message ??
    serverIssues.find((issue) => issue.path === path)?.message ??
    (refusedField === id ? (refusalText ?? undefined) : undefined);
  const issues = [...clientIssues, ...serverIssues];

  return (
    <div data-testid="assessment-capture">
      <div data-testid="assessment-epoch">
        <Details
          rows={[
            [
              'Artifact SHA-256',
              <code className="digest" data-testid="assessment-artifact-sha256">
                {candidate.artifactSha256}
              </code>,
            ],
            [
              'Current dependency digest',
              view === null ? (
                <span className="absent" data-testid="assessment-digest-unread">
                  Not read yet
                </span>
              ) : changed === 'CONTEXT_CHANGED' ? (
                <span className="absent" data-testid="assessment-digest-stale">
                  {DIGEST_STALE}
                </span>
              ) : (
                <code className="digest" data-testid="assessment-current-digest">
                  {view.dependencyDigest}
                </code>
              ),
            ],
            [
              'Technical ruleset',
              <code data-testid="assessment-ruleset">{TECHNICAL_RULESET_VERSION}</code>,
            ],
            [
              'Technical validation run of this epoch',
              view === null || changed !== null ? (
                <span className="absent">Not read yet</span>
              ) : epochRuns.length === 0 ? (
                <span className="absent" data-testid="assessment-epoch-run-none">
                  None recorded
                </span>
              ) : (
                <span data-testid="assessment-epoch-run">
                  {RESULT_LABEL[(epochRuns[0] as ValidationRunSummary).result]} · recorded{' '}
                  <Time iso={(epochRuns[0] as ValidationRunSummary).createdAt} />
                </span>
              ),
            ],
          ]}
        />
      </div>
      <div ref={outcome} tabIndex={-1} className="context-outcome" data-testid="assessment-outcome">
        {read.status === 'loading' && <LoadingNotice label="Reading the current context…" />}
        {read.status === 'error' && (
          <div className="notice notice-error" role="alert" data-testid="assessment-read-refused">
            <p>
              The current context of this candidate’s prompt snapshot scope could not be read, so no
              review can be recorded against it.
            </p>
            <ErrorNotice error={read.error} recordLabel="context" />
          </div>
        )}
        {view !== null && changed === null && (
          <p className="hint" data-testid="assessment-context-read">
            Current context read: revision {view.contextRevision}, {view.context.missing.length}{' '}
            missing, {view.context.conflicts.length} recorded conflicts. A review is recorded
            against exactly this read.
          </p>
        )}
        {view !== null && changed === null && epochRuns.length === 0 && (
          <p className="notice notice-quiet" data-testid="assessment-run-required">
            No technical validation run of this candidate is recorded against this read. Run the
            technical validation first (it need not pass), then read the current context again.
          </p>
        )}
        {changed !== null && (
          <div
            className="notice notice-error"
            role="alert"
            data-testid={
              changed === 'ARTIFACT_CHANGED'
                ? 'assessment-artifact-changed'
                : 'assessment-context-changed'
            }
          >
            <p>
              <strong>
                {changed === 'ARTIFACT_CHANGED'
                  ? ASSESSMENT_ARTIFACT_CHANGED
                  : ASSESSMENT_CONTEXT_CHANGED}
              </strong>
            </p>
            <p>No assessment was recorded.</p>
          </div>
        )}
      </div>
      {(view === null || changed === 'CONTEXT_CHANGED') && (
        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={() => void readEpoch()}
            disabled={read.status === 'loading'}
            data-testid="assessment-read-context"
          >
            Read the current context
          </button>
        </div>
      )}
      {view !== null && changed === null && (
        <>
          <ValidationSummary
            issues={issues}
            label={(path) => ISSUE_LABEL[path.split('.')[0] ?? ''] ?? path}
            fieldId={(path) => fieldIdOf(path, selectedLinks)}
          />
          {failure !== null && serverIssues.length === 0 && refusedField === null && (
            <ErrorNotice error={failure} recordLabel="assessment" focusOnShow />
          )}
          <form
            noValidate
            onSubmit={(event) => void onSubmit(event)}
            className="record-form assessment-form"
            data-testid="assessment-form"
          >
            <SelectField
              id="assessment-gate"
              label="Gate"
              required
              value={gate}
              placeholder="Choose a gate"
              options={GATES.map((value) => ({ value, label: GATE_LABEL[value] }))}
              onChange={(value) => {
                setGate(value as Gate | '');
                setSupersedes('');
              }}
              error={errorAt('gate', 'assessment-gate')}
            />
            <SelectField
              id="assessment-result"
              label="Recorded result"
              required
              value={result}
              placeholder="Choose a result"
              options={RESULTS.map((value) => ({
                value,
                label: `${value} — ${RESULT_MEANING[value]}`,
              }))}
              onChange={(value) => chooseResult(value as Result | '')}
              error={errorAt('result', 'assessment-result')}
            />
            <SelectField
              id="assessment-scopeState"
              label="Scope state"
              required
              value={scopeState}
              placeholder="Choose a scope state"
              options={(Object.keys(SCOPE_STATE_LABEL) as ScopeState[]).map((value) => ({
                value,
                label: SCOPE_STATE_LABEL[value],
              }))}
              hint={SCOPE_STATE_NOTE}
              onChange={(value) => setScopeState(value as ScopeState | '')}
              error={errorAt('scopeState', 'assessment-scopeState')}
            />
            <SelectField
              id="assessment-performerKind"
              label="Performed by"
              required
              value={performerKind}
              placeholder="Choose who performed the review"
              options={PERFORMERS.map((value) => ({
                value,
                label: `${PERFORMER_LABEL[value]} — ${PERFORMER_MEANING[value]}`,
              }))}
              onChange={(value) => choosePerformer(value as PerformerKind | '')}
              error={errorAt('performerKind', 'assessment-performerKind')}
            />
            <TextField
              id="assessment-performerLabel"
              label="Performer"
              required
              value={performerLabel}
              onChange={setPerformerLabel}
              hint="The reviewer, or the documented review, as you record it."
              error={errorAt('performerLabel', 'assessment-performerLabel')}
            />
            <SelectField
              id="assessment-provenance"
              label="Provenance"
              required
              value={provenance}
              placeholder="Choose the provenance"
              options={PROVENANCES.map((value) => ({
                value,
                label: PROVENANCE_LABEL[value],
                disabled: value === 'DOCUMENT_REVIEWED' && performerKind === 'AI_ASSISTED',
              }))}
              hint={
                performerKind === 'AI_ASSISTED'
                  ? AI_DOCUMENT_REVIEW_NOTE
                  : performerKind === 'DOCUMENTED_EXTERNAL_REVIEW'
                    ? EXTERNAL_REVIEW_NOTE
                    : 'What the review rests on, as you record it. “Document reviewed” records an actual human review of the documents.'
              }
              onChange={(value) => setProvenance(value as Provenance | '')}
              error={errorAt('provenance', 'assessment-provenance')}
            />
            <TextField
              id="assessment-assessedAt"
              label="Assessed at"
              value={assessedAt}
              onChange={setAssessedAt}
              hint={ASSESSED_AT_HINT}
              error={errorAt('assessedAt', 'assessment-assessedAt')}
            />
            <TextField
              id="assessment-rationale"
              label="Rationale"
              required
              multiline
              value={rationale}
              onChange={setRationale}
              hint={TEXT_HINT}
              error={errorAt('rationale', 'assessment-rationale')}
            />
            <TextField
              id="assessment-scopeText"
              label="Scope of the review"
              required
              multiline
              value={scopeText}
              onChange={setScopeText}
              error={errorAt('scopeText', 'assessment-scopeText')}
            />
            <TextField
              id="assessment-limitations"
              label="Limitations"
              multiline
              value={limitations}
              onChange={setLimitations}
              hint="Optional."
              error={errorAt('limitations', 'assessment-limitations')}
            />
            <SelectField
              id="assessment-supersedes"
              label="Supersedes"
              value={supersedes}
              placeholder="None — a new review of this gate"
              options={heads.map((entry) => ({
                value: entry.id,
                label: `${entry.result} review recorded ${entry.createdAt} (${entry.id})`,
              }))}
              hint={
                gate === ''
                  ? 'Choose the gate first. A successor names the latest recorded review of that gate; the earlier review stays unchanged.'
                  : 'Optional. A successor names the latest recorded review of this gate; the earlier review and its supports stay unchanged.'
              }
              onChange={setSupersedes}
              error={errorAt('supersedesAssessmentId', 'assessment-supersedes')}
            />
            <SupportPicker
              linked={linked}
              supports={supports}
              result={result}
              inapplicable={inapplicable}
              selectedLinks={selectedLinks}
              onChange={updateSupport}
              errorAt={errorAt}
            />
            <div className="form-actions">
              <button
                type="submit"
                className="button button-primary"
                disabled={pending || epochRuns.length === 0}
                data-testid="assessment-submit"
              >
                {pending ? 'Recording the assessment…' : RECORD_ASSESSMENT_LABEL}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

const ISSUE_LABEL: Readonly<Record<string, string>> = {
  gate: 'Gate',
  result: 'Recorded result',
  scopeState: 'Scope state',
  performerKind: 'Performed by',
  performerLabel: 'Performer',
  provenance: 'Provenance',
  assessedAt: 'Assessed at',
  rationale: 'Rationale',
  scopeText: 'Scope of the review',
  limitations: 'Limitations',
  supersedesAssessmentId: 'Supersedes',
  sources: 'Supporting linked sources',
};

/** The input an issue path belongs to (`sources.N.*` names the N-th cited link). */
function fieldIdOf(path: string, selected: readonly CaseSource[]): string | null {
  const [head, index, sub] = path.split('.');
  if (head === 'sources') {
    const link = index === undefined ? undefined : selected[Number(index)];
    if (link === undefined) return 'assessment-supports';
    return sub === 'supportedConclusion'
      ? `assessment-support-conclusion-${link.id}`
      : `assessment-support-${link.id}`;
  }
  if (head === 'supersedesAssessmentId') return 'assessment-supersedes';
  return head === undefined || head === '' ? null : `assessment-${head}`;
}

/** The field a refusal names (details.field), when the form shows it. */
function refusalFieldId(error: unknown, selected: readonly CaseSource[]): string | null {
  if (!(error instanceof ApiError) || typeof error.details['field'] !== 'string') return null;
  const id = fieldIdOf(error.details['field'], selected);
  return id !== null && id !== 'assessment-rulesetVersion' ? id : null;
}

function SupportPicker({
  linked,
  supports,
  result,
  inapplicable,
  selectedLinks,
  onChange,
  errorAt,
}: {
  linked: readonly CaseSource[];
  supports: Readonly<Record<string, SupportDraft>>;
  result: Result | '';
  inapplicable: (link: CaseSource) => boolean;
  selectedLinks: readonly CaseSource[];
  onChange: (linkId: string, change: Partial<SupportDraft>) => void;
  errorAt: (path: string, id: string) => string | undefined;
}) {
  const listError = errorAt('sources', 'assessment-supports');
  return (
    <fieldset
      className="assessment-supports"
      id="assessment-supports"
      tabIndex={-1}
      aria-describedby={listError ? 'assessment-supports-error' : 'assessment-supports-hint'}
      data-testid="assessment-supports"
    >
      <legend>
        Supporting linked sources <span className="required">(required)</span>
      </legend>
      <p id="assessment-supports-hint" className="hint">
        Only this case’s linked sources can be cited. Cite the material actually checked, with what
        each supports — also for a MISSING or CONFLICT review.
      </p>
      {listError && (
        <p id="assessment-supports-error" className="field-error">
          {listError}
        </p>
      )}
      {linked.length === 0 ? (
        <p className="absent" data-testid="assessment-supports-none">
          This case has no linked source to cite.
        </p>
      ) : (
        <ul className="support-choices">
          {linked.map((link) => {
            const draft = supports[link.id] ?? { selected: false, conclusion: '' };
            const blocked = result === 'PASS' && inapplicable(link);
            const index = selectedLinks.findIndex((entry) => entry.id === link.id);
            const checkboxError =
              index < 0
                ? undefined
                : errorAt(`sources.${index}.caseSourceId`, `assessment-support-${link.id}`);
            const conclusionError =
              index < 0
                ? undefined
                : errorAt(
                    `sources.${index}.supportedConclusion`,
                    `assessment-support-conclusion-${link.id}`,
                  );
            return (
              <li key={link.id} data-testid="assessment-support-choice">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    id={`assessment-support-${link.id}`}
                    checked={draft.selected}
                    disabled={blocked}
                    aria-invalid={checkboxError ? true : undefined}
                    aria-describedby={
                      inapplicable(link) ? `assessment-support-note-${link.id}` : undefined
                    }
                    onChange={(event) => onChange(link.id, { selected: event.target.checked })}
                  />{' '}
                  Linked source <code>{link.id}</code> — source revision{' '}
                  <code>{link.sourceId}</code> ({link.useRole})
                </label>
                {inapplicable(link) && (
                  <p
                    id={`assessment-support-note-${link.id}`}
                    className="hint hint-conflict"
                    data-testid="assessment-support-not-applicable"
                  >
                    {NOT_APPLICABLE_SUPPORT_NOTE}
                  </p>
                )}
                {checkboxError && <p className="field-error">{checkboxError}</p>}
                {draft.selected && (
                  <TextField
                    id={`assessment-support-conclusion-${link.id}`}
                    label="What this source supports"
                    required
                    multiline
                    value={draft.conclusion}
                    onChange={(value) => onChange(link.id, { conclusion: value })}
                    error={conclusionError}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

/**
 * One recorded review, exactly as stored: its gate, result, scope state, performer, provenance,
 * epoch and texts. Its supports are read back from the server when opened.
 */
function AssessmentRecord({
  assessment,
  caseId,
  candidateId,
  successors,
  focus,
  justRecorded,
}: {
  assessment: CandidateAssessment;
  caseId: string;
  candidateId: string;
  successors: readonly CandidateAssessment[];
  focus: boolean;
  justRecorded: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { state: session } = useSession();
  const currentUserId = session.status === 'authenticated' ? session.session.user.id : '';
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (focus) heading.current?.focus();
  }, [focus, assessment.id]);
  return (
    <div className="assessment-record" data-testid="assessment-record">
      <h4 ref={heading} tabIndex={-1} data-testid="assessment-heading">
        {justRecorded ? 'Assessment recorded: ' : ''}
        {GATE_LABEL[assessment.gate]} — recorded result{' '}
        <span data-testid="assessment-result">{assessment.result}</span>
      </h4>
      <Details
        rows={[
          [
            'Scope state',
            <span>
              {SCOPE_STATE_LABEL[assessment.scopeState]}{' '}
              <span className="hint">{SCOPE_STATE_NOTE}</span>
            </span>,
          ],
          [
            'Performed by',
            <span data-testid="assessment-performer">
              {PERFORMER_LABEL[assessment.performerKind]}: {assessment.performerLabel}
            </span>,
          ],
          ['Provenance', PROVENANCE_LABEL[assessment.provenance]],
          [
            'Assessed at',
            assessment.assessedAt === null ? (
              <span className="absent">Not recorded</span>
            ) : (
              <Time iso={assessment.assessedAt} />
            ),
          ],
          ['Recorded', <Time iso={assessment.createdAt} />],
          [
            'Recorded by',
            <RecordedBy userId={assessment.createdById} currentUserId={currentUserId} />,
          ],
          [
            'Artifact SHA-256 reviewed',
            <code className="digest">{assessment.artifactSha256}</code>,
          ],
          [
            'Dependency digest of the epoch',
            <code className="digest" data-testid="assessment-digest">
              {assessment.dependencyDigest}
            </code>,
          ],
          ['Technical ruleset of the epoch', <code>{assessment.rulesetVersion}</code>],
          [
            'Supersedes',
            assessment.supersedesAssessmentId === null ? (
              <span className="absent">None</span>
            ) : (
              <code data-testid="assessment-supersedes">{assessment.supersedesAssessmentId}</code>
            ),
          ],
          [
            'Superseded by',
            successors.length === 0 ? (
              <span className="absent">None recorded</span>
            ) : (
              <span data-testid="assessment-superseded-by">
                {successors.map((entry) => (
                  <code key={entry.id}>{entry.id}</code>
                ))}
              </span>
            ),
          ],
          ['Assessment id', <code data-testid="assessment-id">{assessment.id}</code>],
        ]}
      />
      <RecordedText label="Rationale" text={assessment.rationale} testId="assessment-rationale" />
      <RecordedText
        label="Scope of the review"
        text={assessment.scopeText}
        testId="assessment-scope-text"
      />
      {assessment.limitations !== null && (
        <RecordedText
          label="Limitations"
          text={assessment.limitations}
          testId="assessment-limitations"
        />
      )}
      {assessment.askDispositions !== null && assessment.askDispositions.length > 0 && (
        <AskDispositions dispositions={assessment.askDispositions} />
      )}
      <button
        type="button"
        className="button button-quiet"
        aria-expanded={open}
        aria-controls={`assessment-supports-${assessment.id}`}
        onClick={() => setOpen(!open)}
        data-testid="assessment-open-supports"
      >
        {open ? 'Hide recorded supports' : SHOW_SUPPORTS_LABEL}
      </button>
      {open && (
        <div id={`assessment-supports-${assessment.id}`} data-testid="assessment-supports-detail">
          <RecordedSupports
            caseId={caseId}
            candidateId={candidateId}
            assessmentId={assessment.id}
          />
        </div>
      )}
    </div>
  );
}

/** Recorded free text, as plain text (never HTML, a link to follow or an instruction). */
function RecordedText({ label, text, testId }: { label: string; text: string; testId: string }) {
  return (
    <div className="recorded-text">
      <p className="recorded-text-label">{label}</p>
      <pre className="captured-text" data-testid={testId} tabIndex={0} aria-label={label}>
        {text}
      </pre>
    </div>
  );
}

function AskDispositions({
  dispositions,
}: {
  dispositions: NonNullable<CandidateAssessment['askDispositions']>;
}) {
  return (
    // Scrollable, so it is focusable: keyboard users scroll it too (P4I, the .table-frame backlog).
    <div
      className="table-frame"
      tabIndex={0}
      role="region"
      aria-label="Ask dispositions, as recorded"
    >
      <table className="records ask-dispositions" data-testid="assessment-ask-dispositions">
        <caption>Ask dispositions, as recorded</caption>
        <thead>
          <tr>
            <th scope="col">Ask</th>
            <th scope="col">Question</th>
            <th scope="col">Disposition</th>
            <th scope="col">Sources</th>
          </tr>
        </thead>
        <tbody>
          {dispositions.map((entry) => (
            <tr key={`${entry.parentBindingId}:${entry.askId}`}>
              <td>
                <code>{entry.askId}</code>
              </td>
              <td>
                <pre className="captured-text">{entry.questionText}</pre>
              </td>
              <td>{entry.disposition}</td>
              <td>
                {entry.sourceIds.length === 0 ? (
                  <span className="absent">None</span>
                ) : (
                  entry.sourceIds.map((id) => <code key={id}>{id}</code>)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The support rows recorded with one review, read back from the server every time they are opened
 * (getCandidateAssessmentSources) — never from what this page remembers — and, apart, the present
 * state of each supporting link. Rows of another candidate's review are not shown.
 */
function RecordedSupports({
  caseId,
  candidateId,
  assessmentId,
}: {
  caseId: string;
  candidateId: string;
  assessmentId: string;
}) {
  const api = useDirectoryApi();
  const { state: session } = useSession();
  const currentUserId = session.status === 'authenticated' ? session.session.user.id : '';
  const [rows, reload] = useLoad(`assessment-sources:${candidateId}:${assessmentId}`, () =>
    api.cases.candidates.assessments.sources(candidateId, assessmentId),
  );
  const [present] = useLoad(`assessment-present:${caseId}:${assessmentId}`, () =>
    allPages((cursor) =>
      api.cases.sources.list(caseId, { limit: 100, ...(cursor ? { cursor } : {}) }),
    ),
  );
  if (rows.status === 'loading') return <LoadingNotice label="Reading the recorded supports…" />;
  if (rows.status === 'error') {
    if (rows.error instanceof ApiError && rows.error.status === 404) {
      return (
        <p className="notice notice-error" role="alert" data-testid="assessment-not-here">
          {ASSESSMENT_NOT_HERE}
        </p>
      );
    }
    return <ErrorNotice error={rows.error} recordLabel="recorded supports" onRetry={reload} />;
  }
  const view = rows.value;
  if (
    view.assessmentId !== assessmentId ||
    view.sources.some((row) => row.assessmentId !== assessmentId)
  ) {
    return (
      <p className="notice notice-error" role="alert" data-testid="assessment-not-here">
        {ASSESSMENT_NOT_HERE}
      </p>
    );
  }
  return (
    <div data-testid="assessment-recorded-supports">
      {/* Scrollable, so it is focusable: keyboard users scroll it too (P4I, the .table-frame backlog). */}
      <div
        className="table-frame"
        tabIndex={0}
        role="region"
        aria-label="Support rows recorded with this review"
      >
        <table className="records assessment-sources" data-testid="assessment-support-rows">
          <caption>Support rows recorded with this review, exactly as stored</caption>
          <thead>
            <tr>
              <th scope="col">Linked source</th>
              <th scope="col">Supported conclusion</th>
              <th scope="col">Recorded</th>
              <th scope="col">Recorded by</th>
            </tr>
          </thead>
          <tbody>
            {view.sources.map((row) => (
              <tr key={row.id} data-testid="assessment-support-row">
                <td>
                  <code>{row.caseSourceId}</code>
                </td>
                <td>
                  <pre className="captured-text" data-testid="assessment-support-conclusion">
                    {row.supportedConclusion}
                  </pre>
                </td>
                <td>
                  <Time iso={row.createdAt} />
                </td>
                <td>
                  <RecordedBy userId={row.createdById} currentUserId={currentUserId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="present-state" data-testid="assessment-present-state">
        <p className="context-boundary" role="note" data-testid="assessment-present-label">
          {PRESENT_STATE_LABEL}
        </p>
        {present.status === 'loading' && <LoadingNotice label="Reading the present link state…" />}
        {present.status === 'error' && (
          <ErrorNotice error={present.error} recordLabel="present link state" />
        )}
        {present.status === 'ready' && (
          <ul data-testid="assessment-present-links">
            {view.sources.map((row) => {
              const link = present.value.find((entry) => entry.id === row.caseSourceId);
              return (
                <li key={row.id} data-testid="assessment-present-link">
                  <code>{row.caseSourceId}</code>:{' '}
                  {link === undefined ? (
                    <span className="absent">not found among this case’s links</span>
                  ) : (
                    <span data-testid="assessment-present-link-state">
                      {LINK_STATE_LABEL[link.linkState]} — source revision{' '}
                      <code>{link.sourceId}</code>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
