// Mandate version pages (P3B). A version is a snapshot of one mandate's documentary terms, pinned
// to the exact source revisions it cites. A draft is edited through the contracted fields only;
// freezing makes the system record immutable — its terms, coverage and coverage signers — and is
// not a signature, legal approval, owner confirmation, G1 decision or current authority. There is
// no unfreeze: a correction is a successor version. Nothing is inferred: no date from the capture
// or today, no review from a cited source, no currentness from a frozen state or a missing end date.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type {
  CreateMandateVersion,
  MandateVersion,
  PatchMandateVersion,
  SourceLink,
} from '@tb/contracts';
import type { Versioned } from '../api/directory.js';
import { Absent, Time } from '../directory/agencies.js';
import { fieldIdFor, SelectField, TextField, sameJson } from '../directory/fields.js';
import {
  CHANGE_KIND_LABEL,
  DOCUMENT_STATE_LABEL,
  EXCLUSIVITY_LABEL,
  issuesOf,
  REVIEW_STATE_LABEL,
  VALIDITY_MODEL_LABEL,
} from '../directory/format.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { RecordName } from '../directory/lookup.js';
import { useRecordOperation } from '../directory/record-actions.js';
import { useRecordPage, useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  ReasonDialog,
  RecordHeader,
  Section,
  StatusNotice,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';
import type { SourceTarget } from '../sources/scope.js';
import {
  ActionScopeText,
  FROZEN_MEANING,
  NO_CURRENTNESS,
  RecordedDate,
  SourceCitation,
  SourceSelect,
  VersionStamp,
} from './authority-ui.js';

type ChangeKind = MandateVersion['changeKind'];
type DocumentState = MandateVersion['documentState'];
type ReviewState = MandateVersion['sourceReviewState'];
type ValidityModel = MandateVersion['validityModel'];
type SignedDate = NonNullable<MandateVersion['signedDatesRaw']>[number];

const DRAFT_MEANING =
  'A draft snapshot of recorded terms. Complete or not, a draft is not adopted authority.';

const options = <K extends string>(labels: Readonly<Record<K, string>>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));

const LABELS: Record<string, string> = {
  changeKind: 'Change kind',
  predecessorId: 'Predecessor',
  primarySourceId: 'Primary source',
  additionalSourceRefs: 'Additional sources',
  documentState: 'Document state',
  sourceReviewState: 'Source review state',
  signedDatesRaw: 'Signed dates',
  validityModel: 'Validity model',
  effectiveOn: 'Effective on',
  expiresOn: 'Expires on',
  validityNotes: 'Validity notes',
  changeReason: 'Change reason',
};

function issueLabel(path: string): string {
  const [head, index, sub] = path.split('.');
  const base = LABELS[head ?? ''] ?? path;
  return index === undefined ? base : `${base} ${Number(index) + 1}${sub ? ` (${sub})` : ''}`;
}

function issueField(path: string): string | null {
  const [head, index, sub] = path.split('.');
  if (head === 'additionalSourceRefs' && index !== undefined) {
    return `version-additional-${sub ?? 'sourceId'}-${index}`;
  }
  if (head === 'signedDatesRaw' && index !== undefined) {
    return `version-signed-${sub ?? 'sourceId'}-${index}`;
  }
  return fieldIdFor('version', path);
}

interface Terms {
  readonly primarySourceId: string;
  readonly additional: SourceLink[];
  readonly documentState: DocumentState;
  readonly sourceReviewState: ReviewState;
  readonly signedDates: SignedDate[];
  readonly validityModel: ValidityModel;
  readonly effectiveOn: string;
  readonly expiresOn: string;
  readonly validityNotes: string;
  readonly changeReason: string;
}

function termsOf(version: MandateVersion | null): Terms {
  return {
    primarySourceId: version?.primarySourceId ?? '',
    additional: [...(version?.additionalSourceRefs ?? [])],
    documentState: version?.documentState ?? 'UNKNOWN',
    sourceReviewState: version?.sourceReviewState ?? 'UNREVIEWED',
    signedDates: [...(version?.signedDatesRaw ?? [])],
    validityModel: version?.validityModel ?? 'UNKNOWN',
    effectiveOn: version?.effectiveOn ?? '',
    expiresOn: version?.expiresOn ?? '',
    validityNotes: version?.validityNotes ?? '',
    changeReason: version?.changeReason ?? '',
  };
}

/** Client checks: required entries of the repeatable rows and the change reason. */
function termsProblems(terms: Terms): Record<string, string> {
  const problems: Record<string, string> = {};
  terms.additional.forEach((link, index) => {
    if (link.sourceId === '')
      problems[`additionalSourceRefs.${index}.sourceId`] = 'Choose the source.';
    if (link.role.trim() === '')
      problems[`additionalSourceRefs.${index}.role`] = 'Say what this source is for.';
    if (link.scopeText.trim() === '') {
      problems[`additionalSourceRefs.${index}.scopeText`] = 'Describe what it covers.';
    }
  });
  terms.signedDates.forEach((entry, index) => {
    if (entry.subjectLabel.trim() === '') {
      problems[`signedDatesRaw.${index}.subjectLabel`] =
        'Name who signed, as the document shows it.';
    }
    if (entry.dateRaw.trim() === '') {
      problems[`signedDatesRaw.${index}.dateRaw`] = 'Enter the date exactly as written.';
    }
    if (entry.sourceId === '') problems[`signedDatesRaw.${index}.sourceId`] = 'Choose the source.';
  });
  if (terms.changeReason.trim() === '')
    problems['changeReason'] = 'Say why this version is recorded.';
  return problems;
}

function cleanLinks(links: readonly SourceLink[]): SourceLink[] {
  return links.map((link) => ({
    sourceId: link.sourceId,
    role: link.role.trim(),
    scopeText: link.scopeText,
  }));
}

function cleanDates(entries: readonly SignedDate[]): SignedDate[] {
  return entries.map((entry) => ({
    subjectLabel: entry.subjectLabel.trim(),
    dateRaw: entry.dateRaw.trim(),
    sourceId: entry.sourceId,
  }));
}

/** The fields of a version's terms, shared by the create and edit forms. */
function TermsFields({
  terms,
  onChange,
  target,
  errorFor,
}: {
  terms: Terms;
  onChange: (terms: Terms) => void;
  target: SourceTarget;
  errorFor: (path: string) => string | undefined;
}) {
  const set = (change: Partial<Terms>) => onChange({ ...terms, ...change });
  return (
    <>
      <fieldset className="fieldset">
        <legend>Cited sources</legend>
        <p className="hint">
          A version cites exact source revisions and keeps citing them: it never follows a newer
          revision. Only sources whose recorded scope includes this mandate’s agency are offered.
        </p>
        <SourceSelect
          id="version-primarySourceId"
          label="Primary source"
          hint="The document this version records, if it exists."
          target={target}
          value={terms.primarySourceId}
          error={errorFor('primarySourceId')}
          onChange={(primarySourceId) => set({ primarySourceId })}
        />
        {terms.additional.map((link, index) => (
          <div key={index} className="repeat-row">
            <SourceSelect
              id={`version-additional-sourceId-${index}`}
              label={`Additional source ${index + 1}`}
              hint="Another document this version relies on."
              target={target}
              value={link.sourceId}
              noneLabel="Choose a source"
              error={errorFor(`additionalSourceRefs.${index}.sourceId`)}
              onChange={(sourceId) =>
                set({
                  additional: terms.additional.map((item, i) =>
                    i === index ? { ...item, sourceId } : item,
                  ),
                })
              }
            />
            <TextField
              id={`version-additional-role-${index}`}
              label="Role"
              hint="e.g. annex, power of attorney, registry extract."
              value={link.role}
              error={errorFor(`additionalSourceRefs.${index}.role`)}
              onChange={(role) =>
                set({
                  additional: terms.additional.map((item, i) =>
                    i === index ? { ...item, role } : item,
                  ),
                })
              }
            />
            <TextField
              id={`version-additional-scopeText-${index}`}
              label="What it covers"
              multiline
              value={link.scopeText}
              error={errorFor(`additionalSourceRefs.${index}.scopeText`)}
              onChange={(scopeText) =>
                set({
                  additional: terms.additional.map((item, i) =>
                    i === index ? { ...item, scopeText } : item,
                  ),
                })
              }
            />
            <button
              type="button"
              className="button-quiet"
              onClick={() => set({ additional: terms.additional.filter((_, i) => i !== index) })}
            >
              Remove additional source {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            set({ additional: [...terms.additional, { sourceId: '', role: '', scopeText: '' }] })
          }
        >
          Add additional source
        </button>
      </fieldset>
      <fieldset className="fieldset">
        <legend>Document and review</legend>
        <SelectField
          id="version-documentState"
          label="Document state"
          hint="“Draft document” and “Appears signed” describe a document, so they need the primary source. Use “Document missing” or “Unknown” truthfully when there is none."
          value={terms.documentState}
          options={options(DOCUMENT_STATE_LABEL)}
          error={errorFor('documentState')}
          onChange={(value) => set({ documentState: value as DocumentState })}
        />
        <SelectField
          id="version-sourceReviewState"
          label="Source review state"
          hint="“Reviewed with limits” needs a cited primary or additional source that records who reviewed the document. Citing a reviewed source never marks this version reviewed by itself."
          value={terms.sourceReviewState}
          options={options(REVIEW_STATE_LABEL)}
          error={errorFor('sourceReviewState')}
          onChange={(value) => set({ sourceReviewState: value as ReviewState })}
        />
        {terms.signedDates.map((entry, index) => (
          <div key={index} className="repeat-row">
            <TextField
              id={`version-signed-subjectLabel-${index}`}
              label={`Signed date ${index + 1}: who signed`}
              value={entry.subjectLabel}
              error={errorFor(`signedDatesRaw.${index}.subjectLabel`)}
              onChange={(subjectLabel) =>
                set({
                  signedDates: terms.signedDates.map((item, i) =>
                    i === index ? { ...item, subjectLabel } : item,
                  ),
                })
              }
            />
            <TextField
              id={`version-signed-dateRaw-${index}`}
              label="Date as written"
              hint="Exactly as the document writes it; it is not turned into a date."
              value={entry.dateRaw}
              error={errorFor(`signedDatesRaw.${index}.dateRaw`)}
              onChange={(dateRaw) =>
                set({
                  signedDates: terms.signedDates.map((item, i) =>
                    i === index ? { ...item, dateRaw } : item,
                  ),
                })
              }
            />
            <SourceSelect
              id={`version-signed-sourceId-${index}`}
              label="Source showing it"
              hint="The document on which the date appears."
              target={target}
              value={entry.sourceId}
              noneLabel="Choose a source"
              error={errorFor(`signedDatesRaw.${index}.sourceId`)}
              onChange={(sourceId) =>
                set({
                  signedDates: terms.signedDates.map((item, i) =>
                    i === index ? { ...item, sourceId } : item,
                  ),
                })
              }
            />
            <button
              type="button"
              className="button-quiet"
              onClick={() => set({ signedDates: terms.signedDates.filter((_, i) => i !== index) })}
            >
              Remove signed date {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            set({
              signedDates: [...terms.signedDates, { subjectLabel: '', dateRaw: '', sourceId: '' }],
            })
          }
        >
          Add signed date
        </button>
      </fieldset>
      <fieldset className="fieldset">
        <legend>Validity, only as the document states it</legend>
        <p className="hint">
          Leave dates empty when the document states none. A signature date is not a start date, and
          an empty end date does not mean “no end”. {NO_CURRENTNESS}
        </p>
        <SelectField
          id="version-validityModel"
          label="Validity model"
          value={terms.validityModel}
          options={options(VALIDITY_MODEL_LABEL)}
          error={errorFor('validityModel')}
          onChange={(value) => set({ validityModel: value as ValidityModel })}
        />
        <div className="field-grid">
          <TextField
            id="version-effectiveOn"
            label="Effective on"
            type="date"
            value={terms.effectiveOn}
            error={errorFor('effectiveOn')}
            onChange={(effectiveOn) => set({ effectiveOn })}
          />
          <TextField
            id="version-expiresOn"
            label="Expires on"
            type="date"
            value={terms.expiresOn}
            error={errorFor('expiresOn')}
            onChange={(expiresOn) => set({ expiresOn })}
          />
        </div>
        <TextField
          id="version-validityNotes"
          label="Validity notes"
          multiline
          hint="Record conflicts or limits in the wording here rather than choosing a convenient reading."
          value={terms.validityNotes}
          error={errorFor('validityNotes')}
          onChange={(validityNotes) => set({ validityNotes })}
        />
        <TextField
          id="version-changeReason"
          label="Change reason"
          required
          multiline
          value={terms.changeReason}
          error={errorFor('changeReason')}
          onChange={(changeReason) => set({ changeReason })}
        />
      </fieldset>
    </>
  );
}

export function NewVersionPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const [mandate, reloadMandate] = useLoad(`version-form:mandate:${id}`, () =>
    api.mandates.get(id),
  );
  const [versions] = useLoad(
    `version-form:versions:${id}`,
    async () => (await api.versions.list(id, { limit: 100 })).items,
  );
  const [changeKind, setChangeKind] = useState<ChangeKind | ''>('');
  const [predecessorId, setPredecessorId] = useState(params.get('predecessorId') ?? '');
  const [terms, setTerms] = useState<Terms>(termsOf(null));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  if (mandate.status === 'loading') return <LoadingNotice label="Loading mandate…" />;
  if (mandate.status === 'error') {
    return <ErrorNotice error={mandate.error} recordLabel="mandate" onRetry={reloadMandate} />;
  }
  const record = mandate.value;
  const all = versions.status === 'ready' ? versions.value : [];
  const succeeded = new Set(all.map((version) => version.predecessorId));
  const predecessors = all
    .filter((version) => version.versionState === 'FROZEN' && !succeeded.has(version.id))
    .sort((a, b) => b.version - a.version);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems = termsProblems(terms);
    if (changeKind === '')
      problems['changeKind'] = 'Choose what kind of change this version records.';
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined || changeKind === '') {
      if (first !== undefined) document.getElementById(issueField(first) ?? '')?.focus();
      return;
    }
    const body: CreateMandateVersion = {
      changeKind,
      changeReason: terms.changeReason,
      ...(predecessorId === '' ? {} : { predecessorId }),
      ...(terms.primarySourceId === '' ? {} : { primarySourceId: terms.primarySourceId }),
      ...(terms.additional.length === 0
        ? {}
        : { additionalSourceRefs: cleanLinks(terms.additional) }),
      ...(terms.documentState === 'UNKNOWN' ? {} : { documentState: terms.documentState }),
      ...(terms.sourceReviewState === 'UNREVIEWED'
        ? {}
        : { sourceReviewState: terms.sourceReviewState }),
      ...(terms.signedDates.length === 0 ? {} : { signedDatesRaw: cleanDates(terms.signedDates) }),
      ...(terms.validityModel === 'UNKNOWN' ? {} : { validityModel: terms.validityModel }),
      ...(terms.effectiveOn === '' ? {} : { effectiveOn: terms.effectiveOn }),
      ...(terms.expiresOn === '' ? {} : { expiresOn: terms.expiresOn }),
      ...(terms.validityNotes.trim() === '' ? {} : { validityNotes: terms.validityNotes }),
    };
    const outcome = await submission.submit({ mandate: record.etag, body }, (auth) =>
      api.mandates.createVersion(record.data.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/representation/versions/${outcome.value.data.id}`, {
        state: {
          flash: `Version ${outcome.value.data.version} recorded as a draft.`,
        } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Representation', '/representation'],
          ['Mandates', '/representation/mandates'],
          [record.data.label, `/representation/mandates/${record.data.id}`],
          ['New version', null],
        ]}
      />
      <h1>Record a version</h1>
      <p className="page-intro">
        A new draft snapshot of the documentary terms, with exactly what you enter. Nothing is
        copied from earlier versions and no coverage, signer or event is created with it.{' '}
        {DRAFT_MEANING}
      </p>
      {submission.conflict && (
        <ConflictNotice
          recordLabel="mandate"
          onReload={() => {
            submission.reset();
            reloadMandate();
          }}
        />
      )}
      <ValidationSummary issues={issues} label={issueLabel} fieldId={issueField} />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="version" focusOnShow />
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Version</legend>
          <SelectField
            id="version-changeKind"
            label="Change kind"
            required
            value={changeKind}
            placeholder="Choose the kind of change"
            options={options(CHANGE_KIND_LABEL)}
            error={errorFor('changeKind')}
            onChange={(value) => setChangeKind(value as ChangeKind | '')}
          />
          <SelectField
            id="version-predecessorId"
            label="Predecessor"
            hint="Optional. Only a frozen version of this mandate without a successor can be succeeded: a draft is edited instead, and a chain does not fork. A successor does not supersede anything by itself."
            value={predecessorId}
            options={[
              { value: '', label: 'No predecessor (an independent version)' },
              ...predecessors.map((version) => ({
                value: version.id,
                label: `Version ${version.version} (${CHANGE_KIND_LABEL[version.changeKind].toLowerCase()})`,
              })),
            ]}
            error={errorFor('predecessorId')}
            onChange={setPredecessorId}
          />
        </fieldset>
        <TermsFields
          terms={terms}
          onChange={setTerms}
          target={{ kind: 'Agency', agencyId: record.data.agencyId }}
          errorFor={errorFor}
        />
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Saving…' : 'Record draft version'}
          </button>
          <Link to={`/representation/mandates/${record.data.id}`}>Cancel</Link>
        </div>
      </form>
    </article>
  );
}

export function VersionDetailPage() {
  const { id = '' } = useParams();
  return <VersionDetail key={id} id={id} />;
}

function VersionDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const page = useRecordPage(`version:${id}`, () => api.versions.get(id));
  const mandateId = page.state.status === 'ready' ? page.state.value.data.mandateId : '';
  const rowVersion = page.state.status === 'ready' ? page.state.value.data.rowVersion : 0;
  const [mandate] = useLoad(`version-mandate:${mandateId}`, async () =>
    mandateId === '' ? null : (await api.mandates.get(mandateId)).data,
  );
  const [siblings] = useLoad(`version-siblings:${mandateId}:${rowVersion}`, async () =>
    mandateId === '' ? [] : (await api.versions.list(mandateId, { limit: 100 })).items,
  );
  const [coverages, reloadCoverages] = useLoad(
    `version-coverages:${id}:${rowVersion}`,
    async () => (await api.coverages.list(id, { limit: 100 })).items,
  );
  const trail = [
    ['Representation', '/representation'],
    ['Mandates', '/representation/mandates'],
  ] as const;
  if (page.state.status === 'loading') return <LoadingNotice label="Loading version…" />;
  if (page.state.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Version', null]]} />
        <ErrorNotice error={page.state.error} recordLabel="version" onRetry={page.reload} />
      </>
    );
  }
  const record = page.state.value;
  const version = record.data;
  const frozen = version.versionState === 'FROZEN';
  const mandateRecord = mandate.status === 'ready' ? mandate.value : null;
  const mandateArchived = mandateRecord !== null && mandateRecord.archivedAt !== null;
  const all = siblings.status === 'ready' ? siblings.value : [];
  const predecessor = all.find((item) => item.id === version.predecessorId) ?? null;
  const successor = all.find((item) => item.predecessorId === version.id) ?? null;
  const coverageItems = coverages.status === 'ready' ? coverages.value : [];
  return (
    <article className="sheet" data-testid="version-detail">
      <Breadcrumbs
        trail={[
          ...trail,
          [mandateRecord?.label ?? 'Mandate', `/representation/mandates/${version.mandateId}`],
          [`Version ${version.version}`, null],
        ]}
      />
      <RecordHeader
        name={`Version ${version.version}`}
        stamp={<VersionStamp state={version.versionState} />}
        facts={[
          <>
            Mandate: <RecordName kind="mandate" id={version.mandateId} />
          </>,
          CHANGE_KIND_LABEL[version.changeKind],
          `Record version ${version.rowVersion}`,
        ]}
        boundary={frozen ? FROZEN_MEANING : DRAFT_MEANING}
      />
      {page.conflict && <ConflictNotice recordLabel="version" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      {mandateArchived && (
        <p className="notice notice-quiet">
          The mandate is archived, so this version is read-only until the mandate is restored.
        </p>
      )}
      <VersionActions
        record={record}
        coverages={coverageItems.length}
        blocked={mandateArchived}
        hasSuccessor={successor !== null}
        onChanged={(next, message) => {
          page.update(next, message);
          reloadCoverages();
        }}
        onConflict={page.raiseConflict}
      />
      <div className="sheet-columns">
        <Section title="Recorded terms">
          <Details
            rows={[
              ['Document state', DOCUMENT_STATE_LABEL[version.documentState]],
              ['Source review state', REVIEW_STATE_LABEL[version.sourceReviewState]],
              ['Validity model', VALIDITY_MODEL_LABEL[version.validityModel]],
              ['Effective on', <RecordedDate value={version.effectiveOn} />],
              ['Expires on', <RecordedDate value={version.expiresOn} />],
              [
                'Validity notes',
                version.validityNotes && <p className="prose">{version.validityNotes}</p>,
              ],
              ['Change reason', <p className="prose">{version.changeReason}</p>],
            ]}
          />
          <p className="hint">
            Dates exactly as recorded. An empty end date does not mean “no end”. {NO_CURRENTNESS}
          </p>
        </Section>
        <Section title="Version chain">
          <Details
            rows={[
              [
                'Predecessor',
                version.predecessorId === null ? (
                  'None (an independent version)'
                ) : (
                  <Link to={`/representation/versions/${version.predecessorId}`}>
                    {predecessor ? `Version ${predecessor.version}` : 'Earlier version'}
                  </Link>
                ),
              ],
              [
                'Successor',
                successor === null ? (
                  'None recorded'
                ) : (
                  <Link to={`/representation/versions/${successor.id}`}>
                    Version {successor.version}
                  </Link>
                ),
              ],
            ]}
          />
          <p className="hint">
            A successor does not by itself supersede, revoke or end anything recorded earlier.
          </p>
        </Section>
      </div>
      <Section title="Cited sources">
        <Details
          rows={[
            ['Primary source', <SourceCitation sourceId={version.primarySourceId} />],
            [
              'Additional sources',
              version.additionalSourceRefs === null ||
              version.additionalSourceRefs.length === 0 ? null : (
                <ul className="plain-list">
                  {version.additionalSourceRefs.map((link, index) => (
                    <li key={`${link.sourceId}:${index}`}>
                      <strong>{link.role}</strong>: <SourceCitation sourceId={link.sourceId} />
                      <span className="hint"> Covers: {link.scopeText}</span>
                    </li>
                  ))}
                </ul>
              ),
            ],
            [
              'Signed dates (as written)',
              version.signedDatesRaw === null || version.signedDatesRaw.length === 0 ? null : (
                <ul className="plain-list">
                  {version.signedDatesRaw.map((entry, index) => (
                    <li key={`${entry.sourceId}:${index}`}>
                      {entry.subjectLabel}: “{entry.dateRaw}” —{' '}
                      <SourceCitation sourceId={entry.sourceId} />
                    </li>
                  ))}
                </ul>
              ),
            ],
          ]}
        />
        <p className="hint">
          Citations are pinned to the exact revisions shown; a newer revision of a source changes
          nothing here.
        </p>
      </Section>
      <Section
        title="Coverage"
        actions={
          !frozen && !mandateArchived ? (
            <Link className="button" to={`/representation/versions/${version.id}/coverages/new`}>
              Add coverage
            </Link>
          ) : undefined
        }
      >
        <p className="hint">
          Each coverage records the documented scope over one exact route. It is not a G1 decision.
        </p>
        {coverages.status === 'loading' && <LoadingNotice label="Loading coverage…" />}
        {coverages.status === 'error' && (
          <ErrorNotice error={coverages.error} onRetry={reloadCoverages} />
        )}
        {coverages.status === 'ready' &&
          (coverageItems.length === 0 ? (
            <p className="absent">No coverage recorded in this version.</p>
          ) : (
            <ul className="plain-list">
              {coverageItems.map((coverage) => (
                <li key={coverage.id}>
                  <Link to={`/representation/coverages/${coverage.id}`}>
                    {coverage.coverageLabel}
                  </Link>{' '}
                  <span className="hint">
                    route <RecordName kind="route" id={coverage.routeId} plain /> ·{' '}
                    {EXCLUSIVITY_LABEL[coverage.exclusivity].toLowerCase()} · actions:{' '}
                    <ActionScopeText scope={coverage.actionScope} />
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </Section>
      <Section title="Record">
        <Details
          rows={[
            ['Record id', <code>{version.id}</code>],
            ['Created', <Time iso={version.createdAt} />],
            ['Last changed', <Time iso={version.updatedAt} />],
            ['Frozen', version.frozenAt === null ? null : <Time iso={version.frozenAt} />],
            ['Record version', String(version.rowVersion)],
          ]}
        />
      </Section>
    </article>
  );
}

function VersionActions({
  record,
  coverages,
  blocked,
  hasSuccessor,
  onChanged,
  onConflict,
}: {
  record: Versioned<MandateVersion>;
  coverages: number;
  blocked: boolean;
  hasSuccessor: boolean;
  onChanged: (next: Versioned<MandateVersion>, message: string) => void;
  onConflict: () => void;
}) {
  const api = useDirectoryApi();
  const operation = useRecordOperation(record, onConflict);
  const version = record.data;
  if (blocked) return null;
  if (version.versionState === 'FROZEN') {
    return (
      <div className="record-actions" role="group" aria-label="Actions for this version">
        {hasSuccessor ? (
          <UnavailableAction
            label="Record a successor version"
            reason="This version already has a successor; a chain does not fork."
          />
        ) : (
          <Link
            className="button"
            to={`/representation/mandates/${version.mandateId}/versions/new?predecessorId=${version.id}`}
          >
            Record a successor version
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="record-actions" role="group" aria-label="Actions for this version">
      <Link className="button" to={`/representation/versions/${version.id}/edit`}>
        Edit draft
      </Link>
      <button type="button" onClick={() => operation.show('freeze')}>
        Freeze version
      </button>
      <ReasonDialog
        open={operation.open === 'freeze'}
        title={`Freeze version ${version.version}`}
        description={
          <>
            <p>
              <strong>Freezing makes this system record immutable.</strong> Its terms, its{' '}
              {coverages === 1 ? '1 coverage' : `${coverages} coverages`} and their coverage signers
              can no longer be changed; a correction needs a successor version.
            </p>
            <p>
              Freezing is <strong>not</strong> a signature, legal approval, owner confirmation, G1
              decision or notice adoption, and it does not make any authority current.
            </p>
          </>
        }
        confirmLabel="Freeze version"
        recordLabel="version"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'freeze',
            { reason },
            (auth) => api.versions.freeze(version.id, { reason }, record.etag, auth),
            (next) =>
              onChanged(next, `Version ${version.version} frozen: the record is now immutable.`),
          )
        }
      />
    </div>
  );
}

export function EditVersionPage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`version-edit:${id}`, () => api.versions.get(id));
  if (state.status === 'loading') return <LoadingNotice label="Loading version…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="version" onRetry={reload} />;
  }
  if (state.value.data.versionState === 'FROZEN') {
    return (
      <article className="sheet">
        <h1>Version {state.value.data.version} is frozen</h1>
        <p className="notice notice-quiet">
          A frozen version never changes. {FROZEN_MEANING} Record a successor version to correct it.
        </p>
        <Link to={`/representation/versions/${id}`}>Back to the version</Link>
      </article>
    );
  }
  return <VersionPatchForm key={state.value.etag} record={state.value} onReload={reload} />;
}

function VersionPatchForm({
  record,
  onReload,
}: {
  record: Versioned<MandateVersion>;
  onReload: () => void;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const version = record.data;
  const initial = termsOf(version);
  const [terms, setTerms] = useState<Terms>(initial);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [nothingToSave, setNothingToSave] = useState(false);
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNothingToSave(false);
    const problems = termsProblems(terms);
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(issueField(first) ?? '')?.focus();
      return;
    }
    const body: PatchMandateVersion = {};
    const primary = terms.primarySourceId === '' ? null : terms.primarySourceId;
    if (primary !== version.primarySourceId) body.primarySourceId = primary;
    const additional = terms.additional.length === 0 ? null : cleanLinks(terms.additional);
    if (!sameJson(additional, version.additionalSourceRefs)) body.additionalSourceRefs = additional;
    if (terms.documentState !== version.documentState) body.documentState = terms.documentState;
    if (terms.sourceReviewState !== version.sourceReviewState) {
      body.sourceReviewState = terms.sourceReviewState;
    }
    const signed = terms.signedDates.length === 0 ? null : cleanDates(terms.signedDates);
    if (!sameJson(signed, version.signedDatesRaw)) body.signedDatesRaw = signed;
    if (terms.validityModel !== version.validityModel) body.validityModel = terms.validityModel;
    const effectiveOn = terms.effectiveOn === '' ? null : terms.effectiveOn;
    if (effectiveOn !== version.effectiveOn) body.effectiveOn = effectiveOn;
    const expiresOn = terms.expiresOn === '' ? null : terms.expiresOn;
    if (expiresOn !== version.expiresOn) body.expiresOn = expiresOn;
    const notes = terms.validityNotes.trim() === '' ? null : terms.validityNotes;
    if (notes !== version.validityNotes) body.validityNotes = notes;
    if (terms.changeReason !== version.changeReason) body.changeReason = terms.changeReason;
    if (Object.keys(body).length === 0) {
      setNothingToSave(true);
      return;
    }
    const outcome = await submission.submit({ id: version.id, body }, (auth) =>
      api.versions.patch(version.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/representation/versions/${version.id}`, {
        state: { flash: 'Draft saved.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Representation', '/representation'],
          ['Mandates', '/representation/mandates'],
          ['Mandate', `/representation/mandates/${version.mandateId}`],
          [`Version ${version.version}`, `/representation/versions/${version.id}`],
          ['Edit draft', null],
        ]}
      />
      <h1>Edit draft version {version.version}</h1>
      <p className="page-intro">
        Only changed fields are sent. The change kind and predecessor are fixed when the version is
        recorded. {DRAFT_MEANING}
      </p>
      {submission.conflict && <ConflictNotice recordLabel="version" onReload={onReload} />}
      <ValidationSummary issues={issues} label={issueLabel} fieldId={issueField} />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="version" focusOnShow />
      )}
      {nothingToSave && (
        <p role="status" className="notice notice-quiet">
          Nothing to save: no field was changed.
        </p>
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Version (fixed)</legend>
          <Details
            rows={[
              ['Change kind', CHANGE_KIND_LABEL[version.changeKind]],
              [
                'Predecessor',
                version.predecessorId === null ? (
                  <Absent />
                ) : (
                  <RecordName kind="version" id={version.predecessorId} />
                ),
              ],
            ]}
          />
        </fieldset>
        <TermsFields
          terms={terms}
          onChange={setTerms}
          target={{ kind: 'Agency', agencyId: version.agencyId }}
          errorFor={errorFor}
        />
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Saving…' : 'Save draft'}
          </button>
          <Link to={`/representation/versions/${version.id}`}>Cancel</Link>
        </div>
      </form>
    </article>
  );
}
