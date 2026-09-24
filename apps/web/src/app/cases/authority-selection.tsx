// Case authority selection (P4A): "the authority chain selected/pinned for evaluation in this
// specific Case". This selection records which authority materials will be evaluated for this
// Case. It is not a G1 decision: it confirms no standing, current authority, owner rights or signer
// eligibility and makes nothing ready for signature. The operator chooses every link of the chain
// explicitly — the case's bound route, one signer and each coverage of a frozen version under which
// that signer is recorded. Nothing is preselected: not the route's default signer, not its
// preferred coverage, not the latest version. Selections are append-only; a new one becomes the one
// in use for evaluation and earlier ones stay unchanged.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  CaseAuthoritySelection,
  CaseRecord,
  CoverageSigner,
  Mandate,
  MandateCoverage,
  MandateVersion,
  SelectAuthority,
  Signer,
} from '@tb/contracts';
import { useSession } from '../auth/session.js';
import { Absent, Time } from '../directory/agencies.js';
import { SelectField, TextField } from '../directory/fields.js';
import { issuesOf, SIGNER_STATE_LABEL, TASK_TYPE_LABEL } from '../directory/format.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { RecordName } from '../directory/lookup.js';
import { useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  Section,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';
import {
  ActionScopeText,
  RecordedBy,
  RecordedDate,
  SourceCitation,
  SourceSelect,
  VersionStamp,
} from '../representation/authority-ui.js';
import {
  PINNED_COVERAGE_LIMIT,
  SELECTION_DETAIL,
  SELECTION_HISTORY,
  SELECTION_MEANING,
  useCaseTarget,
} from './case-ui.js';

type TaskType = SelectAuthority['taskType'];

/** The required statement, shown with every selection view and next to the selection button. */
export function SelectionMeaning() {
  return (
    <p className="selection-meaning" data-testid="selection-meaning">
      {SELECTION_MEANING}
    </p>
  );
}

/** The selections of one case, newest first; the one the case points to is marked. */
export function AuthoritySelectionSection({ caseRecord }: { caseRecord: CaseRecord }) {
  const api = useDirectoryApi();
  const { state: session } = useSession();
  const currentUserId = session.status === 'authenticated' ? session.session.user.id : '';
  const [state, reload] = useLoad(`case-selections:${caseRecord.id}:${caseRecord.rowVersion}`, () =>
    api.cases.selections.list(caseRecord.id, { limit: 100 }),
  );
  const unavailable =
    caseRecord.archivedAt !== null
      ? 'Archived cases are read-only. Restore the case first.'
      : caseRecord.routeId === null
        ? 'Bind a route to this case first; a selection names the case’s own route.'
        : null;
  return (
    <Section
      title="Selected authority records for evaluation"
      actions={
        unavailable === null ? (
          <Link className="button" to={`/cases/${caseRecord.id}/authority-selections/new`}>
            Select authority materials
          </Link>
        ) : (
          <UnavailableAction label="Select authority materials" reason={unavailable} />
        )
      }
    >
      <SelectionMeaning />
      <p className="hint">{SELECTION_DETAIL}</p>
      <p className="hint">{SELECTION_HISTORY}</p>
      {state.status === 'loading' && <LoadingNotice label="Loading selections…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} onRetry={reload} />}
      {state.status === 'ready' && state.value.items.length === 0 && (
        <p className="absent" data-testid="case-selections-empty">
          No authority materials have been selected for evaluation in this case.
        </p>
      )}
      {state.status === 'ready' && state.value.items.length > 0 && (
        <ol className="timeline" aria-label="Selection history" data-testid="case-selections">
          {state.value.items.map((selection) => (
            <SelectionItem
              key={selection.id}
              selection={selection}
              inUse={selection.id === caseRecord.currentAuthoritySelectionId}
              currentUserId={currentUserId}
            />
          ))}
        </ol>
      )}
      <p className="hint">{PINNED_COVERAGE_LIMIT}</p>
    </Section>
  );
}

function SelectionItem({
  selection,
  inUse,
  currentUserId,
}: {
  selection: CaseAuthoritySelection;
  inUse: boolean;
  currentUserId: string;
}) {
  return (
    <li className="timeline-item">
      <div className="timeline-when">
        <span className="timeline-label">Selected authority record</span>
        <Time iso={selection.createdAt} />
        {inUse ? (
          <span className="tag" data-testid="selection-in-use">
            In use for evaluation
          </span>
        ) : (
          <span className="tag tag-quiet">Earlier selection</span>
        )}
      </div>
      <div className="timeline-body">
        <Details
          rows={[
            ['Agency', <RecordName kind="agency" id={selection.agencyId} />],
            ['Route', <RecordName kind="route" id={selection.routeId} />],
            ['Signer named in the selection', <RecordName kind="signer" id={selection.signerId} />],
            ['Task type', TASK_TYPE_LABEL[selection.taskType]],
            ['Intended sender address', selection.intendedFromEmail],
            [
              'Basis source',
              selection.basisSourceId === null ? null : (
                <SourceCitation sourceId={selection.basisSourceId} />
              ),
            ],
            ['Selection note', <p className="prose">{selection.selectionNote}</p>],
            [
              'Recorded by',
              <RecordedBy userId={selection.createdById} currentUserId={currentUserId} />,
            ],
          ]}
        />
      </div>
    </li>
  );
}

interface Candidate {
  readonly mandate: Mandate;
  readonly version: MandateVersion;
  readonly coverage: MandateCoverage;
  readonly signers: CoverageSigner[];
}

interface Candidates {
  readonly offered: Candidate[];
  /** Coverage of this route in draft versions: shown as not selectable. */
  readonly drafts: number;
}

const LABELS: Record<string, string> = {
  routeId: 'Route',
  signerId: 'Signer',
  taskType: 'Task type',
  intendedFromEmail: 'Intended sender address',
  basisSourceId: 'Basis source',
  selectionNote: 'Selection note',
  coverages: 'Coverage',
};

export function SelectAuthorityPage() {
  const { id = '' } = useParams();
  return <SelectAuthority key={id} caseId={id} />;
}

function SelectAuthority({ caseId }: { caseId: string }) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`case-select:${caseId}`, () => api.cases.get(caseId));
  if (state.status === 'loading') return <LoadingNotice label="Loading case…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="case" onRetry={reload} />;
  }
  const item = state.value.data;
  const trail = [
    ['Cases', '/cases'],
    [item.intakeLabel, `/cases/${caseId}`],
    ['Select authority materials', null],
  ] as const;
  if (item.archivedAt !== null || item.routeId === null) {
    return (
      <article className="sheet">
        <Breadcrumbs trail={trail} />
        <h1>Select authority materials for evaluation</h1>
        <SelectionMeaning />
        <p className="notice notice-quiet">
          {item.archivedAt !== null
            ? 'This case is archived, so nothing can be selected. Restore the case first.'
            : 'This case has no route yet. Bind a route to the case first: a selection names the case’s own route.'}{' '}
          <Link to={`/cases/${caseId}`}>Back to the case</Link>
        </p>
      </article>
    );
  }
  return (
    <SelectionForm
      caseRecord={item}
      routeId={item.routeId}
      etag={state.value.etag}
      onReload={reload}
      trail={trail}
    />
  );
}

function SelectionForm({
  caseRecord,
  routeId,
  etag,
  onReload,
  trail,
}: {
  caseRecord: CaseRecord;
  routeId: string;
  etag: string;
  onReload: () => void;
  trail: ReadonlyArray<readonly [string, string | null]>;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const target = useCaseTarget(caseRecord);
  const [signerId, setSignerId] = useState('');
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [taskType, setTaskType] = useState<TaskType | ''>('');
  const [intendedFromEmail, setIntendedFromEmail] = useState('');
  const [basisSourceId, setBasisSourceId] = useState('');
  const [selectionNote, setSelectionNote] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [route] = useLoad(
    `case-select-route:${caseRecord.id}:${routeId}`,
    async () => (await api.routes.get(routeId)).data,
  );
  const [signers] = useLoad(
    `case-select-signers:${caseRecord.id}:${caseRecord.agencyId}`,
    async () => (await api.signers.list({ agencyId: caseRecord.agencyId, limit: 100 })).items,
  );
  const [candidates, reloadCandidates] = useLoad<Candidates>(
    `case-select-candidates:${caseRecord.id}:${routeId}`,
    async () => {
      const mandates = (await api.mandates.list({ agencyId: caseRecord.agencyId, limit: 100 }))
        .items;
      const offered: Candidate[] = [];
      let drafts = 0;
      for (const mandate of mandates) {
        const versions = (await api.versions.list(mandate.id, { limit: 100 })).items;
        for (const version of versions) {
          const coverages = (await api.coverages.list(version.id, { limit: 100 })).items.filter(
            (coverage) => coverage.routeId === routeId,
          );
          if (version.versionState !== 'FROZEN') {
            drafts += coverages.length;
            continue;
          }
          for (const coverage of coverages) {
            const recorded = (await api.coverageSigners.list(coverage.id, { limit: 100 })).items;
            offered.push({ mandate, version, coverage, signers: recorded });
          }
        }
      }
      return { offered, drafts };
    },
  );
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  const signerItems = signers.status === 'ready' ? signers.value : [];
  const routeRecord = route.status === 'ready' ? route.value : null;
  const offered = candidates.status === 'ready' ? candidates.value.offered : [];

  function signerUnavailable(signer: Signer): string | null {
    if (signer.archivedAt !== null) return 'archived';
    if (signer.operationalState === 'ENDED') return SIGNER_STATE_LABEL.ENDED.toLowerCase();
    return null;
  }

  function coverageUnavailable(candidate: Candidate): string | null {
    if (candidate.mandate.archivedAt !== null) {
      return 'The mandate is archived, so its coverage cannot be selected.';
    }
    if (signerId === '') return 'Choose the signer first.';
    if (!candidate.signers.some((signer) => signer.signerId === signerId)) {
      return 'The chosen signer is not recorded under this coverage.';
    }
    return null;
  }

  function chooseSigner(value: string) {
    setSignerId(value);
    // Coverage that does not record the new signer can no longer stay chosen.
    setChosen((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([coverageId]) =>
          offered.some(
            (candidate) =>
              candidate.coverage.id === coverageId &&
              candidate.signers.some((signer) => signer.signerId === value),
          ),
        ),
      ),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (signerId === '') problems['signerId'] = 'Choose the signer to name in this selection.';
    if (Object.keys(chosen).length === 0) {
      problems['coverages'] = 'Choose at least one coverage to evaluate.';
    }
    for (const [coverageId, scope] of Object.entries(chosen)) {
      if (scope.trim() === '') {
        problems[`scope-${coverageId}`] = 'Describe how this coverage applies to this case.';
      }
    }
    if (taskType === '') problems['taskType'] = 'Choose the task type.';
    if (intendedFromEmail.trim() === '') {
      problems['intendedFromEmail'] = 'Enter the address the notice is intended to come from.';
    }
    if (selectionNote.trim() === '') problems['selectionNote'] = 'Explain this selection.';
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(`select-${first}`)?.focus();
      return;
    }
    const body: SelectAuthority = {
      routeId,
      signerId,
      taskType: taskType as TaskType,
      intendedFromEmail: intendedFromEmail.trim(),
      ...(basisSourceId === '' ? {} : { basisSourceId }),
      selectionNote,
      coverages: offered
        .filter((candidate) => candidate.coverage.id in chosen)
        .map((candidate) => ({
          coverageId: candidate.coverage.id,
          applicationScope: chosen[candidate.coverage.id] ?? '',
        })),
    };
    const outcome = await submission.submit({ caseId: caseRecord.id, etag, body }, (auth) =>
      api.cases.selections.select(caseRecord.id, body, etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/cases/${caseRecord.id}`, {
        state: {
          flash: 'Authority materials selected for evaluation. This is not a G1 decision.',
        } satisfies FlashState,
      });
    }
  }

  const chosenCandidates = offered.filter((candidate) => candidate.coverage.id in chosen);
  return (
    <article className="sheet" data-testid="select-authority">
      <Breadcrumbs trail={trail} />
      <h1>Select authority materials for evaluation</h1>
      <SelectionMeaning />
      <p className="page-intro">
        {SELECTION_DETAIL} Every choice below is explicit: nothing is preselected from the route’s
        default signer, its preferred coverage or the latest version.
      </p>
      {submission.conflict && <ConflictNotice recordLabel="case" onReload={onReload} />}
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
        fieldId={(path) => {
          const head = path.split('.')[0] ?? '';
          return head === 'coverages' ? 'select-coverages' : `select-${head}`;
        }}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="case" focusOnShow />
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Case and route</legend>
          <Details
            rows={[
              ['Case', caseRecord.intakeLabel],
              ['Agency', <RecordName kind="agency" id={caseRecord.agencyId} />],
              ['Route (the case’s bound route)', <RecordName kind="route" id={routeId} />],
            ]}
          />
        </fieldset>
        <fieldset className="fieldset">
          <legend>Signer</legend>
          <SelectField
            id="select-signerId"
            label="Signer named in the selection"
            required
            hint="A signer record of this case’s agency. Naming a signer here records who is to be evaluated; it is not signature authority, G7 or eligibility. The application user is never a signer."
            value={signerId}
            placeholder="Choose a signer"
            options={signerItems.map((signer) => {
              const unavailable = signerUnavailable(signer);
              return {
                value: signer.id,
                label: `${signer.fullLegalName}${unavailable ? ` (not available: ${unavailable})` : ''}`,
                disabled: unavailable !== null,
              };
            })}
            error={errorFor('signerId')}
            onChange={chooseSigner}
          />
          {routeRecord?.defaultSignerId && (
            <p className="hint" data-testid="default-signer-suggestion">
              The route’s default signer is{' '}
              <RecordName kind="signer" id={routeRecord.defaultSignerId} plain />. It is a
              suggestion only and is not preselected.
            </p>
          )}
        </fieldset>
        <fieldset className="fieldset" aria-describedby="select-coverages-hint">
          <legend id="select-coverages" tabIndex={-1}>
            Coverage to evaluate
          </legend>
          <p id="select-coverages-hint" className="hint">
            Only coverage of this exact route in a frozen version is offered, and only coverage that
            records the chosen signer can be chosen. Each chosen coverage keeps its own application
            scope; nothing is combined or computed. Dates are shown exactly as recorded — nothing
            here decides whether authority is current.
          </p>
          {candidates.status === 'loading' && <LoadingNotice label="Loading coverage…" />}
          {candidates.status === 'error' && (
            <ErrorNotice error={candidates.error} onRetry={reloadCandidates} />
          )}
          {candidates.status === 'ready' && offered.length === 0 && (
            <p className="absent">
              No coverage of a frozen version names this route.{' '}
              <Link to="/representation/mandates">Open the mandates</Link> to record and freeze
              coverage first.
            </p>
          )}
          {candidates.status === 'ready' && candidates.value.drafts > 0 && (
            <p className="hint">
              {candidates.value.drafts} coverage record
              {candidates.value.drafts === 1 ? '' : 's'} of draft versions not offered: only
              coverage of a frozen version can be selected.
            </p>
          )}
          {offered.length > 0 && (
            <ol className="authority-tree" aria-label="Coverage of this route">
              {offered.map((candidate) => (
                <CandidateItem
                  key={candidate.coverage.id}
                  candidate={candidate}
                  preferred={routeRecord?.preferredCoverageId === candidate.coverage.id}
                  unavailable={coverageUnavailable(candidate)}
                  scope={chosen[candidate.coverage.id]}
                  scopeError={errorFor(`scope-${candidate.coverage.id}`)}
                  onToggle={(checked) =>
                    setChosen((current) => {
                      const next = { ...current };
                      if (checked) next[candidate.coverage.id] = '';
                      else delete next[candidate.coverage.id];
                      return next;
                    })
                  }
                  onScope={(value) =>
                    setChosen((current) => ({ ...current, [candidate.coverage.id]: value }))
                  }
                />
              ))}
            </ol>
          )}
          {errorFor('coverages') && <p className="field-error">{errorFor('coverages')}</p>}
        </fieldset>
        <fieldset className="fieldset">
          <legend>Task</legend>
          <SelectField
            id="select-taskType"
            label="Task type"
            required
            hint="Recorded as chosen, for later evaluation of the coverage’s scope."
            value={taskType}
            placeholder="Choose a task type"
            options={(Object.keys(TASK_TYPE_LABEL) as TaskType[]).map((value) => ({
              value,
              label: TASK_TYPE_LABEL[value],
            }))}
            error={errorFor('taskType')}
            onChange={(value) => setTaskType(value as TaskType | '')}
          />
          <TextField
            id="select-intendedFromEmail"
            label="Intended sender address"
            type="email"
            required
            hint="The address the notice is intended to come from. This application never sends anything."
            value={intendedFromEmail}
            error={errorFor('intendedFromEmail')}
            onChange={setIntendedFromEmail}
          />
          <SourceSelect
            id="select-basisSourceId"
            label="Basis source"
            hint="Optional: the source this selection is based on. Only sources whose recorded scope includes this case are offered; citing one reviews nothing."
            target={target.status === 'ready' ? target.value : null}
            value={basisSourceId}
            onChange={setBasisSourceId}
            error={errorFor('basisSourceId')}
          />
          <TextField
            id="select-selectionNote"
            label="Selection note"
            required
            multiline
            hint="Why these materials are to be evaluated for this case."
            value={selectionNote}
            error={errorFor('selectionNote')}
            onChange={setSelectionNote}
          />
        </fieldset>
        <section
          className="chain-summary"
          aria-label="Chain to be pinned"
          data-testid="chain-summary"
        >
          <h2>Selected authority record to be pinned for this case</h2>
          <ol className="chain">
            <li>
              Case <strong>{caseRecord.intakeLabel}</strong>
            </li>
            <li>
              Route <RecordName kind="route" id={routeId} plain />
            </li>
            <li>
              Signer{' '}
              {signerId === '' ? (
                <span className="absent">not chosen</span>
              ) : (
                <RecordName kind="signer" id={signerId} plain />
              )}
            </li>
            {chosenCandidates.length === 0 ? (
              <li>
                Coverage <span className="absent">none chosen</span>
              </li>
            ) : (
              chosenCandidates.map((candidate) => (
                <li key={candidate.coverage.id}>
                  Coverage <strong>{candidate.coverage.coverageLabel}</strong> — version{' '}
                  {candidate.version.version} of {candidate.mandate.label}
                </li>
              ))
            )}
          </ol>
          <SelectionMeaning />
        </section>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Recording…' : 'Record selection for evaluation'}
          </button>
          <Link to={`/cases/${caseRecord.id}`}>Cancel</Link>
        </div>
      </form>
    </article>
  );
}

function CandidateItem({
  candidate,
  preferred,
  unavailable,
  scope,
  scopeError,
  onToggle,
  onScope,
}: {
  candidate: Candidate;
  preferred: boolean;
  unavailable: string | null;
  scope: string | undefined;
  scopeError: string | undefined;
  onToggle: (checked: boolean) => void;
  onScope: (value: string) => void;
}) {
  const { mandate, version, coverage, signers } = candidate;
  const checkboxId = `select-coverage-${coverage.id}`;
  const hintId = `${checkboxId}-hint`;
  const checked = scope !== undefined;
  return (
    <li data-testid="coverage-candidate">
      <div className="tree-node">
        <input
          type="checkbox"
          id={checkboxId}
          checked={checked}
          disabled={unavailable !== null && !checked}
          aria-describedby={hintId}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <label htmlFor={checkboxId}>
          <span className="tree-kind">Mandate</span> {mandate.label}{' '}
          <span aria-hidden="true">→</span> <span className="tree-kind">Version</span>{' '}
          {version.version} <VersionStamp state={version.versionState} />{' '}
          <span aria-hidden="true">→</span> <span className="tree-kind">Coverage</span>{' '}
          <strong>{coverage.coverageLabel}</strong>
        </label>
        {preferred && (
          <span className="tag tag-quiet" data-testid="preferred-coverage-note">
            The route’s preferred coverage — an operational default, not preselected
          </span>
        )}
      </div>
      <p id={hintId} className="tree-meta">
        Version effective <RecordedDate value={version.effectiveOn} />, expires{' '}
        <RecordedDate value={version.expiresOn} /> (as recorded) · coverage action scope as
        recorded: <ActionScopeText scope={coverage.actionScope} /> · signers recorded under it:{' '}
        {signers.length === 0 ? (
          <Absent />
        ) : (
          signers.map((signer, index) => (
            <span key={signer.id}>
              {index > 0 && ', '}
              <RecordName kind="signer" id={signer.signerId} plain />
            </span>
          ))
        )}
        {unavailable !== null && !checked && (
          <>
            {' '}
            · <strong>Not selectable:</strong> {unavailable}
          </>
        )}
      </p>
      {checked && (
        <TextField
          id={`select-scope-${coverage.id}`}
          label={`How “${coverage.coverageLabel}” applies to this case`}
          required
          multiline
          hint="The application scope of this coverage for this case, in your words. It is stored with the selection exactly as entered."
          value={scope}
          error={scopeError}
          onChange={onScope}
        />
      )}
    </li>
  );
}
