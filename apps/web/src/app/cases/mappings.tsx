// Use mappings (P4B): which part of one work of a case is reported to appear in which part of one
// reported item of the same case, recorded exactly as entered — shown as recorded, not as an
// infringement verdict (similarity alone is never infringement). Times are whole milliseconds kept
// as exact decimal strings (never floating point), next to the timecode text as the source states
// it; a clock time the operator typed is turned into milliseconds only when they choose to. The
// work, reported item and occurrence are fixed once recorded. Provenance is stored as chosen and
// never upgraded: "Document reviewed" needs a basis source that records a review. Archiving is
// administrative and cascades to nothing. Every page is keyed by the case and mapping ids and reads
// the mapping only under its own case: another case's mapping is not found.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  CaseRecord,
  CaseWork,
  CreateUseMapping,
  PatchUseMapping,
  RawTimecodes,
  ReportedItem,
  UseMapping,
} from '@tb/contracts';
import { ApiError } from '../api/client.js';
import type { Page, Versioned } from '../api/directory.js';
import { Time } from '../directory/agencies.js';
import {
  fieldIdFor,
  patchText,
  SelectField,
  TextField,
  text as textOf,
} from '../directory/fields.js';
import {
  BOUNDARY_CONVENTION_LABEL,
  FACT_TYPE_LABEL,
  issuesOf,
  PROVENANCE_LABEL,
} from '../directory/format.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { useRecordPage, useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  RecordHeader,
  Section,
  StatusNotice,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';
import { SourceCitation, SourceSelect } from '../representation/authority-ui.js';
import { useCaseTarget } from './case-ui.js';
import {
  ARCHIVE_NO_CASCADE,
  ArchivedStamp,
  CASE_ARCHIVED_READ_ONLY,
  clockToMs,
  IntakeActions,
  MAPPING_MEANING,
  MAX_MILLISECONDS,
  Milliseconds,
  NotInThisCase,
  reportedItemLabel,
} from './intake-ui.js';

type Provenance = UseMapping['provenance'];
type Boundary = 'sourceStart' | 'sourceEnd' | 'reportedStart' | 'reportedEnd';

const BOUNDARIES: ReadonlyArray<{
  readonly name: Boundary;
  readonly field: 'sourceStartMs' | 'sourceEndMs' | 'reportedStartMs' | 'reportedEndMs';
  readonly label: string;
}> = [
  { name: 'sourceStart', field: 'sourceStartMs', label: 'Start in the work' },
  { name: 'sourceEnd', field: 'sourceEndMs', label: 'End in the work' },
  { name: 'reportedStart', field: 'reportedStartMs', label: 'Start in the reported item' },
  { name: 'reportedEnd', field: 'reportedEndMs', label: 'End in the reported item' },
];

const PROVENANCES = Object.keys(PROVENANCE_LABEL) as Provenance[];
const CONVENTIONS = Object.keys(BOUNDARY_CONVENTION_LABEL);
const MILLISECONDS = /^(0|[1-9][0-9]{0,15})$/;

/** The records a mapping names, loaded once for the case page and the mapping pages. */
export interface IntakeParties {
  readonly works: readonly CaseWork[];
  readonly items: readonly ReportedItem[];
}

function PartyLinks({
  caseId,
  mapping,
  parties,
}: {
  caseId: string;
  mapping: Pick<UseMapping, 'caseWorkId' | 'reportedItemId'>;
  parties: IntakeParties;
}) {
  const work = parties.works.find((row) => row.id === mapping.caseWorkId);
  const item = parties.items.find((row) => row.id === mapping.reportedItemId);
  return (
    <>
      <Link to={`/cases/${caseId}/works/${mapping.caseWorkId}`}>{work?.title ?? 'Work'}</Link>
      {' → '}
      <Link to={`/cases/${caseId}/reported-items/${mapping.reportedItemId}`}>
        {item ? reportedItemLabel(item) : 'Reported item'}
      </Link>
    </>
  );
}

function Span({ start, end }: { start: string | null; end: string | null }) {
  return (
    <span>
      <Milliseconds value={start} /> – <Milliseconds value={end} />
    </span>
  );
}

/** The use mappings of one case, archived ones included, newest first — as recorded. */
export function MappingsSection({
  caseRecord,
  mappings,
  parties,
}: {
  caseRecord: CaseRecord;
  mappings: Page<UseMapping> | null;
  parties: IntakeParties;
}) {
  const unavailable =
    caseRecord.archivedAt !== null
      ? CASE_ARCHIVED_READ_ONLY
      : !parties.works.some((work) => work.archivedAt === null) ||
          !parties.items.some((item) => item.archivedAt === null)
        ? 'Record a work and a reported item of this case first.'
        : null;
  return (
    <Section
      title="Use mappings"
      actions={
        unavailable === null ? (
          <Link className="button" to={`/cases/${caseRecord.id}/mappings/new`}>
            Add a use mapping
          </Link>
        ) : (
          <UnavailableAction label="Add a use mapping" reason={unavailable} />
        )
      }
    >
      <p className="hint">{MAPPING_MEANING}</p>
      {mappings !== null && mappings.items.length === 0 && (
        <p className="absent" data-testid="mappings-empty">
          No use mapping is recorded for this case.
        </p>
      )}
      {mappings !== null && mappings.items.length > 0 && (
        <div className="table-frame">
          <table className="records" data-testid="mappings">
            <caption className="visually-hidden">Use mappings of this case, as recorded</caption>
            <thead>
              <tr>
                <th scope="col">Work → reported item (as recorded)</th>
                <th scope="col">Occurrence</th>
                <th scope="col">In the work</th>
                <th scope="col">In the reported item</th>
                <th scope="col">Recorded provenance</th>
                <th scope="col">Mapping</th>
              </tr>
            </thead>
            <tbody>
              {mappings.items.map((mapping) => (
                <tr key={mapping.id}>
                  <th scope="row">
                    <PartyLinks caseId={caseRecord.id} mapping={mapping} parties={parties} />
                  </th>
                  <td>{mapping.occurrence}</td>
                  <td>
                    <Span start={mapping.sourceStartMs} end={mapping.sourceEndMs} />
                  </td>
                  <td>
                    <Span start={mapping.reportedStartMs} end={mapping.reportedEndMs} />
                  </td>
                  <td>{PROVENANCE_LABEL[mapping.provenance]}</td>
                  <td>
                    <Link to={`/cases/${caseRecord.id}/mappings/${mapping.id}`}>Open</Link>{' '}
                    <ArchivedStamp archivedAt={mapping.archivedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mappings?.nextCursor != null && (
        <p className="hint">Only the newest 100 use mappings are listed here.</p>
      )}
    </Section>
  );
}

async function loadParties(
  api: ReturnType<typeof useDirectoryApi>,
  caseId: string,
): Promise<IntakeParties> {
  const [works, items] = await Promise.all([
    api.cases.works.list(caseId, { limit: 100 }),
    api.cases.reportedItems.list(caseId, { limit: 100 }),
  ]);
  return { works: works.items, items: items.items };
}

export function MappingDetailPage() {
  const { id = '', mappingId = '' } = useParams();
  return <MappingDetail key={`${id}:${mappingId}`} caseId={id} mappingId={mappingId} />;
}

function MappingDetail({ caseId, mappingId }: { caseId: string; mappingId: string }) {
  const api = useDirectoryApi();
  const page = useRecordPage(`mapping:${caseId}:${mappingId}`, () =>
    api.cases.mappings.get(caseId, mappingId),
  );
  const [context] = useLoad(`mapping-context:${caseId}`, async () => {
    const [caseResult, parties] = await Promise.all([
      api.cases.get(caseId),
      loadParties(api, caseId),
    ]);
    return { caseRecord: caseResult.data, parties };
  });
  const loaded = context.status === 'ready' ? context.value : null;
  const trail = [
    ['Cases', '/cases'],
    [loaded?.caseRecord.intakeLabel ?? 'Case', `/cases/${caseId}`],
  ] as const;
  if (page.state.status === 'loading') return <LoadingNotice label="Loading use mapping…" />;
  if (page.state.status === 'error') {
    const notFound = page.state.error instanceof ApiError && page.state.error.status === 404;
    return (
      <article className="sheet" data-testid="mapping-detail">
        <Breadcrumbs trail={[...trail, ['Use mapping', null]]} />
        <h1>Use mapping</h1>
        {notFound ? (
          <NotInThisCase caseId={caseId} noun="use mapping" testId="mapping-not-found" />
        ) : (
          <ErrorNotice error={page.state.error} recordLabel="use mapping" onRetry={page.reload} />
        )}
      </article>
    );
  }
  const record = page.state.value;
  const mapping = record.data;
  const parties = loaded?.parties ?? { works: [], items: [] };
  const raw = mapping.rawTimecodes ?? {};
  return (
    <article className="sheet" data-testid="mapping-detail">
      <Breadcrumbs trail={[...trail, [`Use mapping, occurrence ${mapping.occurrence}`, null]]} />
      <RecordHeader
        name={`Use mapping, occurrence ${mapping.occurrence}`}
        stamp={<ArchivedStamp archivedAt={mapping.archivedAt} />}
        facts={[
          `Version ${mapping.rowVersion}`,
          `Recorded provenance: ${PROVENANCE_LABEL[mapping.provenance]}`,
        ]}
        boundary={MAPPING_MEANING}
      />
      {page.conflict && <ConflictNotice recordLabel="use mapping" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      <IntakeActions
        record={record}
        noun="use mapping"
        editTo={`/cases/${caseId}/mappings/${mapping.id}/edit`}
        caseArchived={loaded === null ? null : loaded.caseRecord.archivedAt !== null}
        archive={(body, etag, auth) =>
          api.cases.mappings.archive(caseId, mapping.id, body, etag, auth)
        }
        restore={(body, etag, auth) =>
          api.cases.mappings.restore(caseId, mapping.id, body, etag, auth)
        }
        onChanged={page.update}
        onConflict={page.raiseConflict}
      />
      {mapping.archivedAt !== null && (
        <p className="notice notice-quiet">
          Archived <Time iso={mapping.archivedAt} />. Reason: {mapping.archiveReason}.{' '}
          {ARCHIVE_NO_CASCADE}
        </p>
      )}
      <Section title="Mapping as recorded">
        <Details
          rows={[
            [
              'Work → reported item',
              <PartyLinks caseId={caseId} mapping={mapping} parties={parties} />,
            ],
            ['Occurrence', String(mapping.occurrence)],
            [
              'Boundary convention',
              BOUNDARY_CONVENTION_LABEL[mapping.boundaryConvention] ?? mapping.boundaryConvention,
            ],
          ]}
        />
      </Section>
      <Section title="Times as recorded">
        <Details
          rows={BOUNDARIES.map(({ name, field, label }) => [
            label,
            <span data-testid={`mapping-${name}`}>
              <Milliseconds value={mapping[field]} />
              {raw[name] != null && <span className="hint"> — as stated: “{raw[name]}”</span>}
            </span>,
          ])}
        />
        <p className="hint">
          Milliseconds are kept exactly as entered; the clock reading is shown for convenience only.
          An unknown time stays unknown.
        </p>
      </Section>
      <Section title="Provenance">
        <Details
          rows={[
            ['Recorded provenance', PROVENANCE_LABEL[mapping.provenance]],
            [
              'Basis source',
              mapping.basisSourceId === null ? null : (
                <SourceCitation sourceId={mapping.basisSourceId} />
              ),
            ],
            ['Limitations', mapping.limitations && <p className="prose">{mapping.limitations}</p>],
          ]}
        />
      </Section>
      <MappingFacts caseId={caseId} mappingId={mapping.id} version={mapping.rowVersion} />
      <Section title="Record">
        <Details
          rows={[
            ['Record id', <code>{mapping.id}</code>],
            ['Created', <Time iso={mapping.createdAt} />],
            ['Last changed', <Time iso={mapping.updatedAt} />],
            ['Version', String(mapping.rowVersion)],
          ]}
        />
      </Section>
      <p>
        <Link to={`/cases/${caseId}`}>Back to the case</Link>
      </p>
    </article>
  );
}

function MappingFacts({
  caseId,
  mappingId,
  version,
}: {
  caseId: string;
  mappingId: string;
  version: number;
}) {
  const api = useDirectoryApi();
  const [state] = useLoad(`mapping-facts:${caseId}:${mappingId}:${version}`, async () =>
    (await api.cases.facts.list(caseId, { q: mappingId, limit: 100 })).items.filter(
      (fact) => fact.mappingId === mappingId,
    ),
  );
  return (
    <Section title="Facts about this use mapping">
      {state.status === 'loading' && <LoadingNotice label="Loading…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} />}
      {state.status === 'ready' &&
        (state.value.length === 0 ? (
          <p className="absent">No fact of this case is scoped to this use mapping.</p>
        ) : (
          <ul className="plain-list">
            {state.value.map((fact) => (
              <li key={fact.id}>
                <Link to={`/cases/${caseId}/facts/${fact.id}`}>
                  {FACT_TYPE_LABEL[fact.factType]} (revision {fact.revision})
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </Section>
  );
}

// forms -----------------------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  caseWorkId: 'Work',
  reportedItemId: 'Reported item',
  occurrence: 'Occurrence',
  sourceStartMs: 'Start in the work',
  sourceEndMs: 'End in the work',
  reportedStartMs: 'Start in the reported item',
  reportedEndMs: 'End in the reported item',
  rawTimecodes: 'Times as stated',
  boundaryConvention: 'Boundary convention',
  provenance: 'Recorded provenance',
  basisSourceId: 'Basis source',
  limitations: 'Limitations',
};

interface TimeText {
  readonly ms: string;
  readonly raw: string;
}
type Times = Readonly<Record<Boundary, TimeText>>;

function timesOf(mapping: UseMapping | null): Times {
  const raw = mapping?.rawTimecodes ?? {};
  const entry = (name: Boundary, field: (typeof BOUNDARIES)[number]['field']): TimeText => ({
    ms: mapping?.[field] ?? '',
    raw: raw[name] ?? '',
  });
  return {
    sourceStart: entry('sourceStart', 'sourceStartMs'),
    sourceEnd: entry('sourceEnd', 'sourceEndMs'),
    reportedStart: entry('reportedStart', 'reportedStartMs'),
    reportedEnd: entry('reportedEnd', 'reportedEndMs'),
  };
}

/** The timecode text as stated, in a fixed order; null when nothing was entered. */
function rawOf(times: Times): RawTimecodes | null {
  const entries = BOUNDARIES.map(({ name }) => [name, times[name].raw.trim()] as const).filter(
    ([, value]) => value !== '',
  );
  return entries.length === 0 ? null : (Object.fromEntries(entries) as RawTimecodes);
}

/** Client checks mirroring the server: whole milliseconds within the contract bound, end > start. */
function timeProblems(times: Times): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const { name, field } of BOUNDARIES) {
    const value = times[name].ms.trim();
    if (value === '') continue;
    if (!MILLISECONDS.test(value) || BigInt(value) > MAX_MILLISECONDS) {
      problems[field] =
        'Enter whole milliseconds: digits only, no separators, at most 9007199254740991.';
    }
  }
  const order = (start: Boundary, end: Boundary, field: string) => {
    const a = times[start].ms.trim();
    const b = times[end].ms.trim();
    if (a === '' || b === '' || problems[field] !== undefined) return;
    if (MILLISECONDS.test(a) && MILLISECONDS.test(b) && BigInt(b) <= BigInt(a)) {
      problems[field] = 'A known end must be after its start.';
    }
  };
  order('sourceStart', 'sourceEnd', 'sourceEndMs');
  order('reportedStart', 'reportedEnd', 'reportedEndMs');
  return problems;
}

function TimeFields({
  times,
  onChange,
  errorFor,
}: {
  times: Times;
  onChange: (times: Times) => void;
  errorFor: (path: string) => string | undefined;
}) {
  return (
    <fieldset className="fieldset">
      <legend>Times (optional)</legend>
      <p className="hint">
        Enter each time as the source states it and, where known, as whole milliseconds. A clock
        time such as 1:02:03.500 can be turned into milliseconds with the button next to it. An
        empty time is recorded as unknown.
      </p>
      {BOUNDARIES.map(({ name, field, label }) => {
        const entry = times[name];
        const parsed = clockToMs(entry.raw);
        const set = (change: Partial<TimeText>) =>
          onChange({ ...times, [name]: { ...entry, ...change } });
        return (
          <div key={name} className="repeat-row">
            <TextField
              id={`mapping-raw-${name}`}
              label={`${label}: as stated`}
              value={entry.raw}
              error={errorFor(`rawTimecodes.${name}`)}
              onChange={(raw) => set({ raw })}
            />
            <TextField
              id={`mapping-${field}`}
              label={`${label}: milliseconds`}
              hint="Whole milliseconds, e.g. 3723500 for 1:02:03.500."
              value={entry.ms}
              error={errorFor(field)}
              onChange={(ms) => set({ ms })}
            />
            {parsed !== null && parsed !== entry.ms.trim() && (
              <button type="button" className="button-quiet" onClick={() => set({ ms: parsed })}>
                Use {parsed} ms for “{entry.raw.trim()}”
              </button>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

function ProvenanceFields({
  provenance,
  onProvenance,
  basisSourceId,
  onBasis,
  limitations,
  onLimitations,
  target,
  errorFor,
}: {
  provenance: Provenance;
  onProvenance: (value: Provenance) => void;
  basisSourceId: string;
  onBasis: (value: string) => void;
  limitations: string;
  onLimitations: (value: string) => void;
  target: Parameters<typeof SourceSelect>[0]['target'];
  errorFor: (path: string) => string | undefined;
}) {
  return (
    <fieldset className="fieldset">
      <legend>Provenance</legend>
      <SelectField
        id="mapping-provenance"
        label="Recorded provenance"
        hint="Where this mapping comes from, stored exactly as chosen and never upgraded. “Document reviewed” needs a basis source that itself records who reviewed the document."
        value={provenance}
        options={PROVENANCES.map((value) => ({
          value,
          label:
            value === 'DOCUMENT_REVIEWED'
              ? `${PROVENANCE_LABEL[value]} (needs a basis source that records a review)`
              : PROVENANCE_LABEL[value],
          disabled: value === 'DOCUMENT_REVIEWED' && basisSourceId === '' && provenance !== value,
        }))}
        error={errorFor('provenance')}
        onChange={(value) => onProvenance(value as Provenance)}
      />
      <SourceSelect
        id="mapping-basisSourceId"
        label="Basis source (optional)"
        hint="The source this mapping is based on. Only sources whose recorded scope includes this case are offered; the exact revision chosen stays cited."
        target={target}
        value={basisSourceId}
        onChange={onBasis}
        error={errorFor('basisSourceId')}
      />
      <TextField
        id="mapping-limitations"
        label="Limitations (optional)"
        multiline
        hint="What this mapping does not cover or what is uncertain about it."
        value={limitations}
        error={errorFor('limitations')}
        onChange={onLimitations}
      />
    </fieldset>
  );
}

export function NewMappingPage() {
  const { id = '' } = useParams();
  return <NewMapping key={id} caseId={id} />;
}

function NewMapping({ caseId }: { caseId: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const [state, reload] = useLoad(`mapping-new:${caseId}`, async () => {
    const [caseResult, parties] = await Promise.all([
      api.cases.get(caseId),
      loadParties(api, caseId),
    ]);
    return { caseResult, parties };
  });
  const target = useCaseTarget(state.status === 'ready' ? state.value.caseResult.data : null);
  const [caseWorkId, setCaseWorkId] = useState('');
  const [reportedItemId, setReportedItemId] = useState('');
  const [occurrence, setOccurrence] = useState('1');
  const [times, setTimes] = useState<Times>(timesOf(null));
  const [boundaryConvention, setBoundaryConvention] = useState('UNKNOWN');
  const [provenance, setProvenance] = useState<Provenance>('MISSING');
  const [basisSourceId, setBasisSourceId] = useState('');
  const [limitations, setLimitations] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  if (state.status === 'loading') return <LoadingNotice label="Loading case…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="case" onRetry={reload} />;
  }
  const caseRecord = state.value.caseResult.data;
  const etag = state.value.caseResult.etag;
  const { works, items } = state.value.parties;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = { ...timeProblems(times) };
    if (caseWorkId === '') problems['caseWorkId'] = 'Choose the work of this case.';
    if (reportedItemId === '')
      problems['reportedItemId'] = 'Choose the reported item of this case.';
    if (!/^[1-9][0-9]{0,9}$/.test(occurrence.trim()) || Number(occurrence) > 4294967295) {
      problems['occurrence'] =
        'Enter a whole number from 1: the first, second, … use of the work in the item.';
    }
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(fieldIdFor('mapping', first) ?? '')?.focus();
      return;
    }
    const raw = rawOf(times);
    const body: CreateUseMapping = {
      caseWorkId,
      reportedItemId,
      occurrence: Number(occurrence.trim()),
      ...Object.fromEntries(
        BOUNDARIES.filter(({ name }) => times[name].ms.trim() !== '').map(({ name, field }) => [
          field,
          times[name].ms.trim(),
        ]),
      ),
      ...(raw === null ? {} : { rawTimecodes: raw }),
      boundaryConvention,
      provenance,
      ...(basisSourceId === '' ? {} : { basisSourceId }),
      ...(limitations.trim() === '' ? {} : { limitations }),
    };
    const outcome = await submission.submit({ caseId, etag, body }, (auth) =>
      api.cases.mappings.create(caseId, body, etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/cases/${caseId}/mappings/${outcome.value.data.id}`, {
        state: { flash: 'Use mapping recorded.' } satisfies FlashState,
      });
    }
  }

  const refusal = submission.error instanceof ApiError ? submission.error : null;
  const duplicateId =
    refusal?.code === 'DUPLICATE_USE_MAPPING' && typeof refusal.details['useMappingId'] === 'string'
      ? refusal.details['useMappingId']
      : null;
  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          [caseRecord.intakeLabel, `/cases/${caseId}`],
          ['New use mapping', null],
        ]}
      />
      <h1>New use mapping</h1>
      <p className="page-intro">{MAPPING_MEANING}</p>
      {caseRecord.archivedAt !== null ? (
        <p className="notice notice-quiet">
          This case is archived, so nothing can be added to it. Restore the case first.
        </p>
      ) : (
        <>
          {submission.conflict && <ConflictNotice recordLabel="case" onReload={reload} />}
          <ValidationSummary
            issues={issues}
            label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
            fieldId={(path) => mappingFieldId(path)}
          />
          {submission.error !== null && issues.length === 0 && (
            <ErrorNotice error={submission.error} recordLabel="case" focusOnShow />
          )}
          {duplicateId !== null && (
            <p className="notice notice-quiet">
              <Link to={`/cases/${caseId}/mappings/${duplicateId}`}>Open the existing mapping</Link>
            </p>
          )}
          <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
            <fieldset className="fieldset">
              <legend>What is mapped</legend>
              <p className="hint">
                Only this case’s own works and reported items are offered; archived ones cannot be
                mapped. These choices are fixed once the mapping is recorded.
              </p>
              <SelectField
                id="mapping-caseWorkId"
                label="Work"
                required
                value={caseWorkId}
                placeholder="Choose a work of this case"
                options={works.map((work) => ({
                  value: work.id,
                  label: work.archivedAt === null ? work.title : `${work.title} (archived)`,
                  disabled: work.archivedAt !== null,
                }))}
                error={errorFor('caseWorkId')}
                onChange={setCaseWorkId}
              />
              <SelectField
                id="mapping-reportedItemId"
                label="Reported item"
                required
                value={reportedItemId}
                placeholder="Choose a reported item of this case"
                options={items.map((item) => ({
                  value: item.id,
                  label:
                    item.archivedAt === null
                      ? reportedItemLabel(item)
                      : `${reportedItemLabel(item)} (archived)`,
                  disabled: item.archivedAt !== null,
                }))}
                error={errorFor('reportedItemId')}
                onChange={setReportedItemId}
              />
              <TextField
                id="mapping-occurrence"
                label="Occurrence"
                required
                hint="Which use of the work in this reported item: 1 for the first, 2 for the second, …"
                value={occurrence}
                error={errorFor('occurrence')}
                onChange={setOccurrence}
              />
            </fieldset>
            <TimeFields times={times} onChange={setTimes} errorFor={errorFor} />
            <SelectField
              id="mapping-boundaryConvention"
              label="Boundary convention"
              hint="How the source means its start and end times; unknown unless it says."
              value={boundaryConvention}
              options={CONVENTIONS.map((value) => ({
                value,
                label: BOUNDARY_CONVENTION_LABEL[value] ?? value,
              }))}
              error={errorFor('boundaryConvention')}
              onChange={setBoundaryConvention}
            />
            <ProvenanceFields
              provenance={provenance}
              onProvenance={setProvenance}
              basisSourceId={basisSourceId}
              onBasis={setBasisSourceId}
              limitations={limitations}
              onLimitations={setLimitations}
              target={target.status === 'ready' ? target.value : null}
              errorFor={errorFor}
            />
            <div className="form-actions">
              <button type="submit" className="button-primary" disabled={submission.pending}>
                {submission.pending ? 'Recording…' : 'Record use mapping'}
              </button>
              <Link to={`/cases/${caseId}`}>Cancel</Link>
            </div>
          </form>
        </>
      )}
    </article>
  );
}

function mappingFieldId(path: string): string | null {
  const [head, sub] = path.split('.');
  if (head === 'rawTimecodes' && sub !== undefined) return `mapping-raw-${sub}`;
  return fieldIdFor('mapping', path);
}

export function EditMappingPage() {
  const { id = '', mappingId = '' } = useParams();
  return <EditMapping key={`${id}:${mappingId}`} caseId={id} mappingId={mappingId} />;
}

function EditMapping({ caseId, mappingId }: { caseId: string; mappingId: string }) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`mapping-edit:${caseId}:${mappingId}`, async () => {
    const [caseResult, mapping, parties] = await Promise.all([
      api.cases.get(caseId),
      api.cases.mappings.get(caseId, mappingId),
      loadParties(api, caseId),
    ]);
    return { caseRecord: caseResult.data, mapping, parties };
  });
  if (state.status === 'loading') return <LoadingNotice label="Loading use mapping…" />;
  if (state.status === 'error') {
    if (state.error instanceof ApiError && state.error.status === 404) {
      return (
        <article className="sheet">
          <h1>Edit use mapping</h1>
          <NotInThisCase caseId={caseId} noun="use mapping" testId="mapping-not-found" />
        </article>
      );
    }
    return <ErrorNotice error={state.error} recordLabel="use mapping" onRetry={reload} />;
  }
  return (
    <MappingEditForm
      key={state.value.mapping.etag}
      caseRecord={state.value.caseRecord}
      record={state.value.mapping}
      parties={state.value.parties}
      onReload={reload}
    />
  );
}

function MappingEditForm({
  caseRecord,
  record,
  parties,
  onReload,
}: {
  caseRecord: CaseRecord;
  record: Versioned<UseMapping>;
  parties: IntakeParties;
  onReload: () => void;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const mapping = record.data;
  const caseId = caseRecord.id;
  const target = useCaseTarget(caseRecord);
  const initialTimes = timesOf(mapping);
  const [times, setTimes] = useState<Times>(initialTimes);
  const [boundaryConvention, setBoundaryConvention] = useState(mapping.boundaryConvention);
  const [provenance, setProvenance] = useState<Provenance>(mapping.provenance);
  const [basisSourceId, setBasisSourceId] = useState(mapping.basisSourceId ?? '');
  const [limitations, setLimitations] = useState(textOf(mapping.limitations));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  const readOnly =
    caseRecord.archivedAt !== null
      ? 'This case is archived, so its use mappings are read-only.'
      : mapping.archivedAt !== null
        ? 'This use mapping is archived. Restore it before editing.'
        : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems = timeProblems(times);
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(fieldIdFor('mapping', first) ?? '')?.focus();
      return;
    }
    const nextRaw = rawOf(times);
    const nextLimitations = patchText(limitations, mapping.limitations, true);
    const body: PatchUseMapping = {
      ...Object.fromEntries(
        BOUNDARIES.map(({ name, field }) => [field, times[name].ms.trim() || null] as const).filter(
          ([field, value]) => value !== mapping[field],
        ),
      ),
      ...(JSON.stringify(nextRaw) === JSON.stringify(rawOf(initialTimes))
        ? {}
        : { rawTimecodes: nextRaw }),
      ...(boundaryConvention === mapping.boundaryConvention ? {} : { boundaryConvention }),
      ...(provenance === mapping.provenance ? {} : { provenance }),
      ...((basisSourceId || null) === mapping.basisSourceId
        ? {}
        : { basisSourceId: basisSourceId || null }),
      ...(nextLimitations === undefined ? {} : { limitations: nextLimitations }),
    };
    if (Object.keys(body).length === 0) {
      setClientErrors({ boundaryConvention: 'Change at least one field before saving.' });
      document.getElementById('mapping-boundaryConvention')?.focus();
      return;
    }
    const outcome = await submission.submit({ id: mapping.id, etag: record.etag, body }, (auth) =>
      api.cases.mappings.patch(caseId, mapping.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/cases/${caseId}/mappings/${mapping.id}`, {
        state: { flash: 'Use mapping updated.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          [caseRecord.intakeLabel, `/cases/${caseId}`],
          [
            `Use mapping, occurrence ${mapping.occurrence}`,
            `/cases/${caseId}/mappings/${mapping.id}`,
          ],
          ['Edit', null],
        ]}
      />
      <h1>Edit use mapping</h1>
      <p className="page-intro">
        The work, reported item and occurrence are fixed once recorded; a different combination
        needs a new mapping. {MAPPING_MEANING}
      </p>
      {readOnly !== null ? (
        <p className="notice notice-quiet">{readOnly}</p>
      ) : (
        <>
          {submission.conflict && <ConflictNotice recordLabel="use mapping" onReload={onReload} />}
          <ValidationSummary
            issues={issues}
            label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
            fieldId={(path) => mappingFieldId(path)}
          />
          {submission.error !== null && issues.length === 0 && (
            <ErrorNotice error={submission.error} recordLabel="use mapping" focusOnShow />
          )}
          <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
            <Details
              rows={[
                [
                  'Work → reported item',
                  <PartyLinks caseId={caseId} mapping={mapping} parties={parties} />,
                ],
                ['Occurrence', String(mapping.occurrence)],
              ]}
            />
            <TimeFields times={times} onChange={setTimes} errorFor={errorFor} />
            <SelectField
              id="mapping-boundaryConvention"
              label="Boundary convention"
              value={boundaryConvention}
              options={[
                ...CONVENTIONS.map((value) => ({
                  value,
                  label: BOUNDARY_CONVENTION_LABEL[value] ?? value,
                })),
                ...(CONVENTIONS.includes(mapping.boundaryConvention)
                  ? []
                  : [{ value: mapping.boundaryConvention, label: mapping.boundaryConvention }]),
              ]}
              error={errorFor('boundaryConvention')}
              onChange={setBoundaryConvention}
            />
            <ProvenanceFields
              provenance={provenance}
              onProvenance={setProvenance}
              basisSourceId={basisSourceId}
              onBasis={setBasisSourceId}
              limitations={limitations}
              onLimitations={setLimitations}
              target={target.status === 'ready' ? target.value : null}
              errorFor={errorFor}
            />
            <div className="form-actions">
              <button type="submit" className="button-primary" disabled={submission.pending}>
                {submission.pending ? 'Saving…' : 'Save changes'}
              </button>
              <Link to={`/cases/${caseId}/mappings/${mapping.id}`}>Cancel</Link>
            </div>
          </form>
        </>
      )}
    </article>
  );
}
