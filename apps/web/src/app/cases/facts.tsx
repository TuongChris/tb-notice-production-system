// Case facts (P4B): explicit, structured, case-specific information recorded by an operator, each an
// immutable revision of its chain. A fact records what was stated or reviewed — its provenance and
// resolution state exactly as chosen, never upgraded or computed — and the application decides
// nothing about infringement, ownership, permission, exceptions, authority currentness, G1–G7 or
// readiness. Nothing is inferred from silence, similarity, an address or a source's existence.
// Facts are revised, never edited: only the current revision can be revised, keeping its type and
// scope, and every earlier revision stays readable exactly as it was (by id, or through the chain).
// The linked sources a revision names as support are stored with it, but no contracted operation
// returns them (the gap reported at R9), so the pages say so instead of showing them. Every page is
// keyed by the case and fact ids and reads a fact only under its own case: another case's fact is
// not found.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  CaseFact,
  CaseFactSummary,
  CaseRecord,
  CreateFact,
  FactSupport,
  UseMapping,
} from '@tb/contracts';
import { ApiError } from '../api/client.js';
import { useSession } from '../auth/session.js';
import { Time } from '../directory/agencies.js';
import { fieldIdFor, linesOf, SelectField, TextField } from '../directory/fields.js';
import {
  AV_FINDING_LABEL,
  CURRENTNESS_FINDING_LABEL,
  DUPLICATE_FINDING_LABEL,
  EXCEPTION_FINDING_LABEL,
  FACT_TYPE_LABEL,
  issuesOf,
  PERMISSION_FINDING_LABEL,
  PROVENANCE_LABEL,
  RESOLUTION_STATE_LABEL,
  RIGHTS_BASIS_LABEL,
  SCOPE_KIND_LABEL,
} from '../directory/format.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { RecordName } from '../directory/lookup.js';
import { useFlashMessage, useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  RecordHeader,
  Section,
  StateStamp,
  StatusNotice,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';
import { RecordedBy } from '../representation/authority-ui.js';
import {
  ArchivedStamp,
  CASE_ARCHIVED_READ_ONLY,
  FACT_HISTORY,
  FACT_MEANING,
  FACT_PROVENANCE,
  FACT_SUPPORT_GAP,
  instantInput,
  instantValue,
  mappingLabel,
  NO_READINESS,
  NotInThisCase,
  PERMISSION_SILENCE,
  reportedItemLabel,
} from './intake-ui.js';
import type { IntakeParties } from './mappings.js';

type FactType = CaseFact['factType'];
type ScopeKind = CaseFact['scopeKind'];
type Provenance = CaseFact['provenance'];
type Resolution = CaseFact['resolutionState'];
type TargetField = 'caseWorkId' | 'reportedItemId' | 'mappingId';

const FACT_TYPES = Object.keys(FACT_TYPE_LABEL) as FactType[];
const SCOPE_KINDS = Object.keys(SCOPE_KIND_LABEL) as ScopeKind[];
const PROVENANCES = Object.keys(PROVENANCE_LABEL) as Provenance[];
const RESOLUTIONS = Object.keys(RESOLUTION_STATE_LABEL) as Resolution[];

/** The record field a scope names (none for the whole case). */
const SCOPE_TARGET: Record<ScopeKind, TargetField | null> = {
  CASE: null,
  WORK: 'caseWorkId',
  REPORTED_ITEM: 'reportedItemId',
  USE: 'mappingId',
};

/** The intake records of one case a fact can be about. */
export interface FactParties extends IntakeParties {
  readonly mappings: readonly UseMapping[];
}

// value vocabulary ------------------------------------------------------------------------------

type ValueSpec =
  | { kind: 'enum'; name: string; label: string; options: Record<string, string> }
  | { kind: 'text'; name: string; label: string; hint?: string; optional?: boolean }
  | { kind: 'lines'; name: string; label: string; hint: string }
  | { kind: 'instant'; name: string; label: string; hint: string }
  | { kind: 'cases'; name: string; label: string };

/** The structured value of each fact type, field by field, in the contract's shape. */
const VALUE_SPECS: Record<FactType, readonly ValueSpec[]> = {
  RIGHTS_BASIS: [
    { kind: 'enum', name: 'basis', label: 'Basis as stated', options: RIGHTS_BASIS_LABEL },
    { kind: 'text', name: 'assertion', label: 'Assertion', hint: 'What the material states.' },
    { kind: 'text', name: 'limitations', label: 'Limitations of the value', optional: true },
  ],
  RIGHTS_SCOPE: [
    {
      kind: 'lines',
      name: 'exclusiveRights',
      label: 'Exclusive rights as stated',
      hint: 'One right per line, as the material names it (at most 30).',
    },
    { kind: 'text', name: 'protectedExpression', label: 'Protected expression' },
    { kind: 'text', name: 'thirdPartyExclusions', label: 'Third-party exclusions' },
    { kind: 'text', name: 'contraryRecords', label: 'Contrary records' },
  ],
  PERMISSION: [
    {
      kind: 'enum',
      name: 'finding',
      label: 'What was reported',
      options: PERMISSION_FINDING_LABEL,
    },
    { kind: 'text', name: 'assertion', label: 'Assertion' },
    {
      kind: 'text',
      name: 'reviewScope',
      label: 'Review scope',
      hint: 'What was checked, and how.',
    },
  ],
  AV_COMPARISON: [
    { kind: 'enum', name: 'finding', label: 'Comparison record', options: AV_FINDING_LABEL },
    { kind: 'text', name: 'method', label: 'Method' },
    { kind: 'text', name: 'assertion', label: 'Assertion' },
    { kind: 'text', name: 'limitations', label: 'Limitations of the comparison' },
  ],
  EXCEPTION_REVIEW: [
    { kind: 'enum', name: 'finding', label: 'Review record', options: EXCEPTION_FINDING_LABEL },
    { kind: 'text', name: 'reasoning', label: 'Reasoning' },
    { kind: 'text', name: 'jurisdictionScope', label: 'Jurisdiction scope' },
    { kind: 'text', name: 'limitations', label: 'Limitations of the review' },
  ],
  WORK_IDENTIFICATION: [
    { kind: 'text', name: 'description', label: 'Description' },
    { kind: 'text', name: 'limitations', label: 'Limitations of the description' },
  ],
  REPORTED_IDENTIFICATION: [
    { kind: 'text', name: 'description', label: 'Description' },
    { kind: 'text', name: 'limitations', label: 'Limitations of the description' },
  ],
  DUPLICATE_REVIEW: [
    { kind: 'enum', name: 'finding', label: 'Review record', options: DUPLICATE_FINDING_LABEL },
    { kind: 'text', name: 'coverageDescription', label: 'What was checked' },
    {
      kind: 'instant',
      name: 'observedThrough',
      label: 'Checked up to (optional)',
      hint: 'In your local time. Left unchanged on a revision, the recorded time is kept exactly.',
    },
    { kind: 'cases', name: 'relatedCaseIds', label: 'Related cases (optional)' },
    { kind: 'text', name: 'reasoning', label: 'Reasoning' },
  ],
  AUTHORITY_CURRENTNESS: [
    {
      kind: 'enum',
      name: 'finding',
      label: 'What the source reports',
      options: CURRENTNESS_FINDING_LABEL,
    },
    { kind: 'text', name: 'assertion', label: 'Assertion' },
    {
      kind: 'instant',
      name: 'asOf',
      label: 'As of (optional)',
      hint: 'In your local time. Left unchanged on a revision, the recorded time is kept exactly.',
    },
    { kind: 'text', name: 'limitations', label: 'Limitations' },
  ],
};

/** A note shown with the value of some fact types. */
const TYPE_NOTE: Partial<Record<FactType, string>> = {
  PERMISSION: PERMISSION_SILENCE,
  AV_COMPARISON:
    'A comparison records what was compared and how. Similarity alone is never infringement.',
  AUTHORITY_CURRENTNESS:
    'This records what a source reports about authority. The application never computes whether authority is current.',
  RIGHTS_BASIS: 'This records the basis the material states. It does not establish ownership.',
};

function valueEntries(fact: CaseFact): Record<string, unknown> {
  return fact.value as unknown as Record<string, unknown>;
}

function ValueText({ spec, value }: { spec: ValueSpec; value: unknown }): ReactNode {
  if (value === null || value === undefined || value === '') return null;
  switch (spec.kind) {
    case 'enum':
      return spec.options[String(value)] ?? String(value);
    case 'lines':
      return Array.isArray(value) && value.length > 0 ? (
        <ul className="plain-list">
          {value.map((line, index) => (
            <li key={index}>{String(line)}</li>
          ))}
        </ul>
      ) : null;
    case 'instant':
      return <Time iso={String(value)} />;
    case 'cases':
      return Array.isArray(value) && value.length > 0 ? (
        <ul className="plain-list">
          {value.map((id) => (
            <li key={String(id)}>
              <RecordName kind="case" id={String(id)} />
            </li>
          ))}
        </ul>
      ) : null;
    case 'text':
      return <p className="prose">{String(value)}</p>;
  }
}

/** The structured value of one fact revision, exactly as recorded. */
function FactValueDetails({ fact }: { fact: CaseFact }) {
  const value = valueEntries(fact);
  const note = TYPE_NOTE[fact.factType];
  return (
    <>
      <Details
        rows={VALUE_SPECS[fact.factType].map((spec) => [
          spec.label.replace(' (optional)', ''),
          <ValueText spec={spec} value={value[spec.name]} />,
        ])}
      />
      {note !== undefined && <p className="hint">{note}</p>}
    </>
  );
}

function ProvenanceText({ provenance }: { provenance: Provenance }) {
  return (
    <span className={`provenance provenance-${provenance.toLowerCase()}`}>
      {PROVENANCE_LABEL[provenance]}
    </span>
  );
}

/** The record a fact is about, loaded under the fact's own case. */
function ScopedRecord({
  caseId,
  fact,
}: {
  caseId: string;
  fact: Pick<CaseFact, 'scopeKind' | 'caseWorkId' | 'reportedItemId' | 'mappingId'>;
}) {
  const api = useDirectoryApi();
  const [state] = useLoad(
    `fact-scope:${caseId}:${fact.caseWorkId ?? ''}:${fact.reportedItemId ?? ''}:${fact.mappingId ?? ''}`,
    async (): Promise<{ label: string; to: string; archivedAt: string | null } | null> => {
      if (fact.caseWorkId !== null) {
        const work = (await api.cases.works.get(caseId, fact.caseWorkId)).data;
        return { label: work.title, to: `works/${work.id}`, archivedAt: work.archivedAt };
      }
      if (fact.reportedItemId !== null) {
        const item = (await api.cases.reportedItems.get(caseId, fact.reportedItemId)).data;
        return {
          label: reportedItemLabel(item),
          to: `reported-items/${item.id}`,
          archivedAt: item.archivedAt,
        };
      }
      if (fact.mappingId !== null) {
        const mapping = (await api.cases.mappings.get(caseId, fact.mappingId)).data;
        return {
          label: `Use mapping, occurrence ${mapping.occurrence}`,
          to: `mappings/${mapping.id}`,
          archivedAt: mapping.archivedAt,
        };
      }
      return null;
    },
  );
  if (fact.scopeKind === 'CASE') return <>The whole case</>;
  if (state.status === 'loading') return <span className="hint">Loading…</span>;
  if (state.status === 'error' || state.value === null) {
    return <span className="absent">Not available</span>;
  }
  return (
    <>
      <Link to={`/cases/${caseId}/${state.value.to}`}>{state.value.label}</Link>{' '}
      <ArchivedStamp archivedAt={state.value.archivedAt} />
    </>
  );
}

// case page section -------------------------------------------------------------------------------

function scopeLabel(fact: CaseFactSummary, parties: FactParties): string {
  if (fact.caseWorkId !== null) {
    return parties.works.find((work) => work.id === fact.caseWorkId)?.title ?? 'Work';
  }
  if (fact.reportedItemId !== null) {
    const item = parties.items.find((row) => row.id === fact.reportedItemId);
    return item ? reportedItemLabel(item) : 'Reported item';
  }
  if (fact.mappingId !== null) {
    const mapping = parties.mappings.find((row) => row.id === fact.mappingId);
    return mapping ? mappingLabel(mapping, parties.works, parties.items) : 'Use mapping';
  }
  return 'The whole case';
}

/** The current revision of each fact of one case, newest first, optionally of one fact type. */
export function FactsSection({
  caseRecord,
  parties,
}: {
  caseRecord: CaseRecord;
  parties: FactParties;
}) {
  const api = useDirectoryApi();
  const [factType, setFactType] = useState('');
  const [state, reload] = useLoad(
    `case-facts:${caseRecord.id}:${caseRecord.rowVersion}:${factType}`,
    () =>
      api.cases.facts.list(caseRecord.id, { limit: 100, ...(factType === '' ? {} : { factType }) }),
  );
  return (
    <Section
      title="Facts"
      actions={
        caseRecord.archivedAt !== null ? (
          <UnavailableAction label="Record a fact" reason={CASE_ARCHIVED_READ_ONLY} />
        ) : (
          <Link className="button" to={`/cases/${caseRecord.id}/facts/new`}>
            Record a fact
          </Link>
        )
      }
    >
      <p className="hint">{FACT_MEANING}</p>
      <p className="hint">
        {FACT_HISTORY} {NO_READINESS}
      </p>
      <label className="list-filter">
        Fact type
        <select value={factType} onChange={(event) => setFactType(event.target.value)}>
          <option value="">All fact types</option>
          {FACT_TYPES.map((type) => (
            <option key={type} value={type}>
              {FACT_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </label>
      {state.status === 'loading' && <LoadingNotice label="Loading facts…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} onRetry={reload} />}
      {state.status === 'ready' && state.value.items.length === 0 && (
        <p className="absent" data-testid="facts-empty">
          {factType === ''
            ? 'No fact is recorded for this case.'
            : 'No fact of this type is recorded for this case.'}
        </p>
      )}
      {state.status === 'ready' && state.value.items.length > 0 && (
        <div className="table-frame">
          <table className="records" data-testid="facts">
            <caption className="visually-hidden">Current fact revisions of this case</caption>
            <thead>
              <tr>
                <th scope="col">Fact type</th>
                <th scope="col">About</th>
                <th scope="col">Recorded provenance</th>
                <th scope="col">Resolution state (as recorded)</th>
                <th scope="col">Revision</th>
                <th scope="col">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {state.value.items.map((fact) => (
                <tr key={fact.id}>
                  <th scope="row">
                    <Link to={`/cases/${caseRecord.id}/facts/${fact.id}`}>
                      {FACT_TYPE_LABEL[fact.factType]}
                    </Link>
                  </th>
                  <td>
                    {SCOPE_KIND_LABEL[fact.scopeKind]}
                    {fact.scopeKind !== 'CASE' && `: ${scopeLabel(fact, parties)}`}
                  </td>
                  <td>
                    <ProvenanceText provenance={fact.provenance} />
                  </td>
                  <td>{RESOLUTION_STATE_LABEL[fact.resolutionState]}</td>
                  <td>{fact.revision}</td>
                  <td>
                    <Time iso={fact.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.status === 'ready' && state.value.nextCursor !== null && (
        <p className="hint">Only the newest 100 facts are listed here.</p>
      )}
    </Section>
  );
}

// detail and history ------------------------------------------------------------------------------

interface FactView {
  readonly caseRecord: CaseRecord;
  readonly fact: CaseFact;
  /** The chain's current revision (null only if the list could not find it). */
  readonly head: CaseFactSummary | null;
  /** Every revision of the chain, newest first. */
  readonly chain: readonly CaseFact[];
}

async function loadFactView(
  api: ReturnType<typeof useDirectoryApi>,
  caseId: string,
  factId: string,
): Promise<FactView> {
  const [caseResult, fact] = await Promise.all([
    api.cases.get(caseId),
    api.cases.facts.get(caseId, factId),
  ]);
  const heads = await api.cases.facts.list(caseId, { q: fact.factGroupId, limit: 100 });
  const head = heads.items.find((item) => item.factGroupId === fact.factGroupId) ?? null;
  const newest =
    head === null || head.id === fact.id ? fact : await api.cases.facts.get(caseId, head.id);
  const chain: CaseFact[] = [newest];
  let previous = newest.supersedesFactId;
  while (previous !== null && chain.length < 100) {
    const earlier = await api.cases.facts.get(caseId, previous);
    chain.push(earlier);
    previous = earlier.supersedesFactId;
  }
  return { caseRecord: caseResult.data, fact, head, chain };
}

export function FactDetailPage() {
  const { id = '', factId = '' } = useParams();
  return <FactDetail key={`${id}:${factId}`} caseId={id} factId={factId} />;
}

function FactDetail({ caseId, factId }: { caseId: string; factId: string }) {
  const api = useDirectoryApi();
  const flash = useFlashMessage();
  const { state: session } = useSession();
  const currentUserId = session.status === 'authenticated' ? session.session.user.id : '';
  const [state, reload] = useLoad(`fact:${caseId}:${factId}`, () =>
    loadFactView(api, caseId, factId),
  );
  if (state.status === 'loading') return <LoadingNotice label="Loading fact…" />;
  if (state.status === 'error') {
    const notFound = state.error instanceof ApiError && state.error.status === 404;
    return (
      <article className="sheet" data-testid="fact-detail">
        <Breadcrumbs
          trail={[
            ['Cases', '/cases'],
            ['Case', `/cases/${caseId}`],
            ['Fact', null],
          ]}
        />
        <h1>Case fact</h1>
        {notFound ? (
          <NotInThisCase caseId={caseId} noun="fact" testId="fact-not-found" />
        ) : (
          <ErrorNotice error={state.error} recordLabel="fact" onRetry={reload} />
        )}
      </article>
    );
  }
  const { caseRecord, fact, head, chain } = state.value;
  const current = head === null || head.id === fact.id;
  const revisable =
    caseRecord.archivedAt !== null
      ? CASE_ARCHIVED_READ_ONLY
      : !current
        ? 'Only the current revision of a fact can be revised.'
        : null;
  return (
    <article className="sheet" data-testid="fact-detail">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          [caseRecord.intakeLabel, `/cases/${caseId}`],
          [`${FACT_TYPE_LABEL[fact.factType]}, revision ${fact.revision}`, null],
        ]}
      />
      <RecordHeader
        name={FACT_TYPE_LABEL[fact.factType]}
        stamp={
          <StateStamp
            label={current ? 'Current revision' : 'Superseded revision'}
            tone={current ? 'draft' : 'ended'}
          />
        }
        facts={[`Revision ${fact.revision}`, SCOPE_KIND_LABEL[fact.scopeKind]]}
        boundary={FACT_MEANING}
      />
      <StatusNotice message={flash} />
      <div className="record-actions" role="group" aria-label="Actions for this fact">
        {revisable === null ? (
          <Link className="button" to={`/cases/${caseId}/facts/${fact.id}/revise`}>
            Record a new revision
          </Link>
        ) : (
          <UnavailableAction label="Record a new revision" reason={revisable} />
        )}
      </div>
      {!current && head !== null && (
        <p className="notice notice-quiet" data-testid="fact-superseded">
          This is an earlier revision, kept exactly as it was recorded. The current revision is{' '}
          <Link to={`/cases/${caseId}/facts/${head.id}`}>revision {head.revision}</Link>.
        </p>
      )}
      <Section title="Fact as recorded">
        <Details
          rows={[
            ['Fact type', FACT_TYPE_LABEL[fact.factType]],
            ['About', SCOPE_KIND_LABEL[fact.scopeKind]],
            ['Scoped record', <ScopedRecord caseId={caseId} fact={fact} />],
            ['What this fact covers', <p className="prose">{fact.scopeText}</p>],
            ['Limitations', fact.limitations && <p className="prose">{fact.limitations}</p>],
          ]}
        />
      </Section>
      <Section title="Value">
        <FactValueDetails fact={fact} />
      </Section>
      <Section title="Provenance and resolution">
        <Details
          rows={[
            ['Recorded provenance', <ProvenanceText provenance={fact.provenance} />],
            ['Provenance as stated', fact.rawProvenance],
            ['Resolution state (as recorded)', RESOLUTION_STATE_LABEL[fact.resolutionState]],
            ['Asserted by', fact.assertedByLabel],
            ['Asserted as of', fact.assertedAsOf && <Time iso={fact.assertedAsOf} />],
            ['Reason for this revision', <p className="prose">{fact.changeReason}</p>],
          ]}
        />
        <p className="hint">
          {FACT_PROVENANCE} {NO_READINESS}
        </p>
      </Section>
      <Section title="Supporting sources">
        <p className="notice notice-quiet" data-testid="fact-support-gap">
          {FACT_SUPPORT_GAP}
        </p>
      </Section>
      <Section title="Revision history">
        <ol className="revision-list" reversed data-testid="fact-history">
          {chain.map((revision) => (
            <li key={revision.id}>
              {revision.id === fact.id ? (
                <strong>Revision {revision.revision} (this page)</strong>
              ) : (
                <Link to={`/cases/${caseId}/facts/${revision.id}`}>
                  Revision {revision.revision}
                </Link>
              )}{' '}
              <span className="hint">
                {head !== null && revision.id === head.id ? 'current, ' : ''}recorded{' '}
                <Time iso={revision.createdAt} /> — {PROVENANCE_LABEL[revision.provenance]},{' '}
                {RESOLUTION_STATE_LABEL[revision.resolutionState].toLowerCase()}
              </span>
            </li>
          ))}
        </ol>
        <p className="hint">{FACT_HISTORY}</p>
      </Section>
      <Section title="Record">
        <Details
          rows={[
            ['Revision id', <code>{fact.id}</code>],
            ['Chain id', <code>{fact.factGroupId}</code>],
            ['Recorded', <Time iso={fact.createdAt} />],
            ['Recorded by', <RecordedBy userId={fact.createdById} currentUserId={currentUserId} />],
          ]}
        />
      </Section>
      <p>
        <Link to={`/cases/${caseId}`}>Back to the case</Link>
      </p>
    </article>
  );
}

// forms -------------------------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  factType: 'Fact type',
  scopeKind: 'About',
  caseWorkId: 'Work',
  reportedItemId: 'Reported item',
  mappingId: 'Use mapping',
  value: 'Value',
  provenance: 'Recorded provenance',
  rawProvenance: 'Provenance as stated',
  resolutionState: 'Resolution state',
  assertedByLabel: 'Asserted by',
  assertedAsOf: 'Asserted as of',
  scopeText: 'What this fact covers',
  limitations: 'Limitations',
  changeReason: 'Reason',
  sources: 'Supporting sources',
};

type ValueState = Readonly<Record<string, string>>;

function valueStateOf(type: FactType, fact: CaseFact | null): ValueState {
  const value = fact === null ? {} : valueEntries(fact);
  return Object.fromEntries(
    VALUE_SPECS[type].map((spec) => {
      const current = value[spec.name];
      switch (spec.kind) {
        case 'lines':
        case 'cases':
          return [spec.name, Array.isArray(current) ? current.map(String).join('\n') : ''];
        case 'instant':
          return [spec.name, instantInput(typeof current === 'string' ? current : null)];
        default:
          return [spec.name, typeof current === 'string' ? current : ''];
      }
    }),
  );
}

/** The typed value for the contract; an untouched recorded instant is sent back exactly. */
function valueOf(type: FactType, state: ValueState, initial: CaseFact | null): unknown {
  const recorded = initial !== null && initial.factType === type ? valueEntries(initial) : {};
  const value: Record<string, unknown> = {};
  for (const spec of VALUE_SPECS[type]) {
    const text = state[spec.name] ?? '';
    switch (spec.kind) {
      case 'enum':
        value[spec.name] = text;
        break;
      case 'text':
        if (!spec.optional || text.trim() !== '') value[spec.name] = text;
        break;
      case 'lines':
        value[spec.name] = linesOf(text);
        break;
      case 'cases':
        value[spec.name] = text === '' ? [] : text.split('\n');
        break;
      case 'instant': {
        const before = recorded[spec.name];
        value[spec.name] = instantValue(text, typeof before === 'string' ? before : null);
        break;
      }
    }
  }
  return value;
}

interface SupportRow {
  readonly caseSourceId: string;
  readonly supportRole: string;
  readonly supportedAssertion: string;
}

interface LinkOption {
  readonly id: string;
  readonly label: string;
  readonly reviewed: boolean;
}

interface FormContext {
  readonly caseResult: { readonly data: CaseRecord; readonly etag: string };
  readonly parties: FactParties;
  readonly links: readonly LinkOption[];
  readonly otherCases: ReadonlyArray<{ readonly id: string; readonly label: string }>;
}

async function loadFormContext(
  api: ReturnType<typeof useDirectoryApi>,
  caseId: string,
): Promise<FormContext> {
  const [caseResult, works, items, mappings, links, cases] = await Promise.all([
    api.cases.get(caseId),
    api.cases.works.list(caseId, { limit: 100 }),
    api.cases.reportedItems.list(caseId, { limit: 100 }),
    api.cases.mappings.list(caseId, { limit: 100 }),
    api.cases.sources.list(caseId, { limit: 100 }),
    api.cases.list({ limit: 100 }),
  ]);
  const linked = links.items.filter((link) => link.linkState === 'LINKED');
  const options = await Promise.all(
    linked.map(async (link) => {
      const source = await api.sources.get(link.sourceId);
      return {
        id: link.id,
        label: `${source.title} — revision ${source.revision}, ${link.useRole}, ${PROVENANCE_LABEL[
          source.reportedProvenance
        ].toLowerCase()}`,
        reviewed: source.reportedProvenance === 'DOCUMENT_REVIEWED',
      };
    }),
  );
  return {
    caseResult,
    parties: { works: works.items, items: items.items, mappings: mappings.items },
    links: options,
    otherCases: cases.items
      .filter((item) => item.id !== caseId)
      .map((item) => ({ id: item.id, label: item.intakeLabel })),
  };
}

function targetOptions(kind: ScopeKind, parties: FactParties) {
  switch (kind) {
    case 'WORK':
      return parties.works.map((work) => ({
        value: work.id,
        label: work.archivedAt === null ? work.title : `${work.title} (archived)`,
        disabled: work.archivedAt !== null,
      }));
    case 'REPORTED_ITEM':
      return parties.items.map((item) => ({
        value: item.id,
        label:
          item.archivedAt === null
            ? reportedItemLabel(item)
            : `${reportedItemLabel(item)} (archived)`,
        disabled: item.archivedAt !== null,
      }));
    case 'USE':
      return parties.mappings.map((mapping) => {
        const label = mappingLabel(mapping, parties.works, parties.items);
        return {
          value: mapping.id,
          label: mapping.archivedAt === null ? label : `${label} (archived)`,
          disabled: mapping.archivedAt !== null,
        };
      });
    case 'CASE':
      return [];
  }
}

/**
 * The fact form: a new fact, or a new revision of the current one (its type and scope fixed and
 * its recorded values as the starting point). Supports are entered for each revision.
 */
function FactForm({
  context,
  revising,
  onReload,
}: {
  context: FormContext;
  revising: CaseFact | null;
  onReload: () => void;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const caseRecord = context.caseResult.data;
  const caseId = caseRecord.id;
  const etag = context.caseResult.etag;
  const [factType, setFactType] = useState<FactType | ''>(revising?.factType ?? '');
  const [scopeKind, setScopeKind] = useState<ScopeKind | ''>(revising?.scopeKind ?? '');
  const [targetId, setTargetId] = useState(
    revising?.caseWorkId ?? revising?.reportedItemId ?? revising?.mappingId ?? '',
  );
  const [values, setValues] = useState<ValueState>(
    revising === null ? {} : valueStateOf(revising.factType, revising),
  );
  const [provenance, setProvenance] = useState<Provenance | ''>(revising?.provenance ?? '');
  const [rawProvenance, setRawProvenance] = useState(revising?.rawProvenance ?? '');
  const [resolution, setResolution] = useState<Resolution>(
    revising?.resolutionState ?? 'UNASSESSED',
  );
  const [assertedByLabel, setAssertedByLabel] = useState(revising?.assertedByLabel ?? '');
  const [assertedAsOf, setAssertedAsOf] = useState(instantInput(revising?.assertedAsOf ?? null));
  const [scopeText, setScopeText] = useState(revising?.scopeText ?? '');
  const [limitations, setLimitations] = useState(revising?.limitations ?? '');
  const [changeReason, setChangeReason] = useState('');
  const [supports, setSupports] = useState<SupportRow[]>([]);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  const targetField = scopeKind === '' ? null : SCOPE_TARGET[scopeKind];
  const reviewedSupport = supports.some(
    (row) => context.links.find((link) => link.id === row.caseSourceId)?.reviewed === true,
  );

  function chooseType(next: FactType | '') {
    setFactType(next);
    setValues(next === '' ? {} : valueStateOf(next, null));
  }

  function updateSupport(index: number, change: Partial<SupportRow>) {
    setSupports(supports.map((row, i) => (i === index ? { ...row, ...change } : row)));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (factType === '') problems['factType'] = 'Choose what kind of fact this is.';
    if (scopeKind === '') problems['scopeKind'] = 'Choose what this fact is about.';
    if (targetField !== null && targetId === '') {
      problems[targetField] = 'Choose the record of this case the fact is about.';
    }
    if (factType !== '') {
      for (const spec of VALUE_SPECS[factType]) {
        if (spec.kind === 'enum' && (values[spec.name] ?? '') === '') {
          problems[`value.${spec.name}`] = 'Choose one.';
        }
      }
    }
    if (provenance === '') problems['provenance'] = 'Choose the recorded provenance.';
    if (scopeText.trim() === '') problems['scopeText'] = 'Describe what this fact covers.';
    if (changeReason.trim() === '') {
      problems['changeReason'] =
        revising === null
          ? 'Enter why this fact is recorded.'
          : 'Enter why this revision is recorded.';
    }
    const seen = new Set<string>();
    supports.forEach((row, index) => {
      if (row.caseSourceId === '')
        problems[`sources.${index}.caseSourceId`] = 'Choose a linked source.';
      if (row.supportRole.trim() === '')
        problems[`sources.${index}.supportRole`] = 'Enter the support role.';
      if (row.supportedAssertion.trim() === '') {
        problems[`sources.${index}.supportedAssertion`] = 'Enter what this source supports.';
      }
      const key = `${row.caseSourceId}\u0000${row.supportRole.trim()}`;
      if (row.caseSourceId !== '' && seen.has(key)) {
        problems[`sources.${index}.supportRole`] =
          'Each linked source supports a fact once per role.';
      }
      seen.add(key);
    });
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined || factType === '' || scopeKind === '' || provenance === '') {
      document.getElementById(factFieldId(first ?? 'factType') ?? '')?.focus();
      return;
    }
    const asOf = instantValue(assertedAsOf, revising?.assertedAsOf ?? null);
    const sources: FactSupport[] = supports.map((row) => ({
      caseSourceId: row.caseSourceId,
      supportRole: row.supportRole.trim(),
      supportedAssertion: row.supportedAssertion,
    }));
    const body = {
      factType,
      scopeKind,
      ...(targetField === null ? {} : { [targetField]: targetId }),
      value: valueOf(factType, values, revising),
      provenance,
      ...(rawProvenance.trim() === '' ? {} : { rawProvenance: rawProvenance.trim() }),
      resolutionState: resolution,
      ...(assertedByLabel.trim() === '' ? {} : { assertedByLabel: assertedByLabel.trim() }),
      ...(asOf === null ? {} : { assertedAsOf: asOf }),
      scopeText,
      ...(limitations.trim() === '' ? {} : { limitations }),
      changeReason,
      sources,
    } as CreateFact;
    const outcome = await submission.submit(
      { caseId, etag, revising: revising?.id, body },
      (auth) =>
        revising === null
          ? api.cases.facts.create(caseId, body, etag, auth)
          : api.cases.facts.revise(caseId, revising.id, body, etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/cases/${caseId}/facts/${outcome.value.id}`, {
        state: {
          flash:
            revising === null ? 'Fact recorded.' : `Revision ${outcome.value.revision} recorded.`,
        } satisfies FlashState,
      });
    }
  }

  const fixed = revising !== null;
  return (
    <>
      {submission.conflict && <ConflictNotice recordLabel="case" onReload={onReload} />}
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
        fieldId={(path) => factFieldId(path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="fact" focusOnShow />
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>What the fact is about</legend>
          {fixed && (
            <p className="hint">
              A revision keeps the fact’s type and scope; a different type or scope needs a new
              fact.
            </p>
          )}
          <SelectField
            id="fact-factType"
            label="Fact type"
            required
            value={factType}
            placeholder={fixed ? undefined : 'Choose a fact type'}
            locked={fixed ? 'Fixed for every revision of this fact.' : null}
            options={FACT_TYPES.map((type) => ({ value: type, label: FACT_TYPE_LABEL[type] }))}
            error={errorFor('factType')}
            onChange={(value) => chooseType(value as FactType | '')}
          />
          <SelectField
            id="fact-scopeKind"
            label="About"
            required
            value={scopeKind}
            placeholder={fixed ? undefined : 'Choose what the fact is about'}
            locked={fixed ? 'Fixed for every revision of this fact.' : null}
            options={SCOPE_KINDS.map((kind) => ({ value: kind, label: SCOPE_KIND_LABEL[kind] }))}
            error={errorFor('scopeKind')}
            onChange={(value) => {
              setScopeKind(value as ScopeKind | '');
              setTargetId('');
            }}
          />
          {scopeKind !== '' && targetField !== null && (
            <SelectField
              id={`fact-${targetField}`}
              label={LABELS[targetField] ?? targetField}
              required
              value={targetId}
              placeholder={fixed ? undefined : 'Choose a record of this case'}
              locked={fixed ? 'Fixed for every revision of this fact.' : null}
              hint="Only this case’s own records are offered; archived ones take no new fact."
              options={targetOptions(scopeKind, context.parties)}
              error={errorFor(targetField)}
              onChange={setTargetId}
            />
          )}
        </fieldset>
        {factType !== '' && (
          <fieldset className="fieldset" data-testid="fact-value-fields">
            <legend>Value: {FACT_TYPE_LABEL[factType]}</legend>
            {TYPE_NOTE[factType] !== undefined && <p className="hint">{TYPE_NOTE[factType]}</p>}
            {VALUE_SPECS[factType].map((spec) => (
              <ValueField
                key={spec.name}
                spec={spec}
                value={values[spec.name] ?? ''}
                otherCases={context.otherCases}
                error={errorFor(`value.${spec.name}`)}
                onChange={(next) => setValues({ ...values, [spec.name]: next })}
              />
            ))}
          </fieldset>
        )}
        <fieldset className="fieldset">
          <legend>Provenance and resolution</legend>
          <p className="hint">{FACT_PROVENANCE}</p>
          <SelectField
            id="fact-provenance"
            label="Recorded provenance"
            required
            value={provenance}
            placeholder="Choose the provenance"
            options={PROVENANCES.map((value) => ({
              value,
              label:
                value === 'DOCUMENT_REVIEWED'
                  ? `${PROVENANCE_LABEL[value]} (needs a supporting source that records a review)`
                  : PROVENANCE_LABEL[value],
              disabled: value === 'DOCUMENT_REVIEWED' && !reviewedSupport && provenance !== value,
            }))}
            error={errorFor('provenance')}
            onChange={(value) => setProvenance(value as Provenance | '')}
          />
          <TextField
            id="fact-rawProvenance"
            label="Provenance as stated (optional)"
            hint="The material’s own wording of where this comes from, if any."
            value={rawProvenance}
            error={errorFor('rawProvenance')}
            onChange={setRawProvenance}
          />
          <SelectField
            id="fact-resolutionState"
            label="Resolution state"
            hint="A state you record; the application never sets it from sources, matching or completeness."
            value={resolution}
            options={RESOLUTIONS.map((value) => ({ value, label: RESOLUTION_STATE_LABEL[value] }))}
            error={errorFor('resolutionState')}
            onChange={(value) => setResolution(value as Resolution)}
          />
          <TextField
            id="fact-assertedByLabel"
            label="Asserted by (optional)"
            hint="Who states this, as the material names them."
            value={assertedByLabel}
            error={errorFor('assertedByLabel')}
            onChange={setAssertedByLabel}
          />
          <TextField
            id="fact-assertedAsOf"
            label="Asserted as of (optional)"
            type="datetime-local"
            hint="In your local time. Left unchanged on a revision, the recorded time is kept exactly."
            value={assertedAsOf}
            error={errorFor('assertedAsOf')}
            onChange={setAssertedAsOf}
          />
        </fieldset>
        <TextField
          id="fact-scopeText"
          label="What this fact covers"
          required
          multiline
          value={scopeText}
          error={errorFor('scopeText')}
          onChange={setScopeText}
        />
        <TextField
          id="fact-limitations"
          label="Limitations (optional)"
          multiline
          value={limitations}
          error={errorFor('limitations')}
          onChange={setLimitations}
        />
        <fieldset className="fieldset" data-testid="fact-supports">
          <legend>Supporting sources (optional)</legend>
          <p className="hint">
            Name the linked sources of this case that support this {fixed ? 'revision' : 'fact'}.
            Only sources linked to this case (and not paused or unlinked) can be named; the exact
            source revision of each link stays cited. A support never upgrades provenance.
            {fixed &&
              ' Supports are entered for each revision: the earlier revision’s supports cannot be read back through the current API, so they are not copied here.'}
          </p>
          {context.links.length === 0 && (
            <p className="absent">No source is linked to this case, so none can be named.</p>
          )}
          {supports.map((row, index) => (
            <div key={index} className="repeat-row">
              <SelectField
                id={`fact-sources-${index}-caseSourceId`}
                label={`Support ${index + 1}: linked source`}
                value={row.caseSourceId}
                placeholder="Choose a linked source"
                options={context.links.map((link) => ({ value: link.id, label: link.label }))}
                error={errorFor(`sources.${index}.caseSourceId`)}
                onChange={(caseSourceId) => updateSupport(index, { caseSourceId })}
              />
              <TextField
                id={`fact-sources-${index}-supportRole`}
                label="Support role"
                hint="A short label, for example PRIMARY or CORROBORATING."
                value={row.supportRole}
                error={errorFor(`sources.${index}.supportRole`)}
                onChange={(supportRole) => updateSupport(index, { supportRole })}
              />
              <TextField
                id={`fact-sources-${index}-supportedAssertion`}
                label="What it supports"
                multiline
                value={row.supportedAssertion}
                error={errorFor(`sources.${index}.supportedAssertion`)}
                onChange={(supportedAssertion) => updateSupport(index, { supportedAssertion })}
              />
              <button
                type="button"
                className="button-quiet"
                onClick={() => setSupports(supports.filter((_, i) => i !== index))}
              >
                Remove support {index + 1}
              </button>
            </div>
          ))}
          {context.links.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setSupports([
                  ...supports,
                  { caseSourceId: '', supportRole: '', supportedAssertion: '' },
                ])
              }
            >
              Add a supporting source
            </button>
          )}
        </fieldset>
        <TextField
          id="fact-changeReason"
          label={fixed ? 'Reason for this revision' : 'Reason for recording this fact'}
          required
          multiline
          hint="Kept with this revision."
          value={changeReason}
          error={errorFor('changeReason')}
          onChange={setChangeReason}
        />
        <p className="hint">{NO_READINESS}</p>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Recording…' : fixed ? 'Record revision' : 'Record fact'}
          </button>
          <Link to={fixed ? `/cases/${caseId}/facts/${revising.id}` : `/cases/${caseId}`}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}

function factFieldId(path: string): string | null {
  const [head, index, sub] = path.split('.');
  if (head === 'sources' && index !== undefined)
    return `fact-sources-${index}-${sub ?? 'caseSourceId'}`;
  if (head === 'value' && index !== undefined) return `fact-value-${index}`;
  return fieldIdFor('fact', path);
}

function ValueField({
  spec,
  value,
  otherCases,
  error,
  onChange,
}: {
  spec: ValueSpec;
  value: string;
  otherCases: FormContext['otherCases'];
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  const id = `fact-value-${spec.name}`;
  switch (spec.kind) {
    case 'enum':
      return (
        <SelectField
          id={id}
          label={spec.label}
          required
          value={value}
          placeholder="Choose one"
          options={Object.entries(spec.options).map(([option, label]) => ({
            value: option,
            label,
          }))}
          error={error}
          onChange={onChange}
        />
      );
    case 'text':
      return (
        <TextField
          id={id}
          label={spec.optional ? `${spec.label} (optional)` : spec.label}
          hint={spec.hint}
          multiline
          value={value}
          error={error}
          onChange={onChange}
        />
      );
    case 'lines':
      return (
        <TextField
          id={id}
          label={spec.label}
          hint={spec.hint}
          multiline
          value={value}
          error={error}
          onChange={onChange}
        />
      );
    case 'instant':
      return (
        <TextField
          id={id}
          label={spec.label}
          type="datetime-local"
          hint={spec.hint}
          value={value}
          error={error}
          onChange={onChange}
        />
      );
    case 'cases': {
      const chosen = value === '' ? [] : value.split('\n');
      return (
        <fieldset className="fieldset checkbox-list" id={id}>
          <legend>{spec.label}</legend>
          <p className="hint">
            Other cases this review names. Nothing of them is read, copied or changed.
          </p>
          {otherCases.length === 0 && <p className="absent">There is no other case to name.</p>}
          {otherCases.map((item) => (
            <label key={item.id} className="checkbox">
              <input
                type="checkbox"
                checked={chosen.includes(item.id)}
                onChange={(event) =>
                  onChange(
                    (event.target.checked
                      ? [...chosen, item.id]
                      : chosen.filter((other) => other !== item.id)
                    ).join('\n'),
                  )
                }
              />
              {item.label}
            </label>
          ))}
          {error && <p className="field-error">{error}</p>}
        </fieldset>
      );
    }
  }
}

export function NewFactPage() {
  const { id = '' } = useParams();
  return <NewFact key={id} caseId={id} />;
}

function NewFact({ caseId }: { caseId: string }) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`fact-new:${caseId}`, () => loadFormContext(api, caseId));
  if (state.status === 'loading') return <LoadingNotice label="Loading case…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="case" onRetry={reload} />;
  }
  const caseRecord = state.value.caseResult.data;
  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          [caseRecord.intakeLabel, `/cases/${caseId}`],
          ['New fact', null],
        ]}
      />
      <h1>New case fact</h1>
      <p className="page-intro">
        {FACT_MEANING} {NO_READINESS}
      </p>
      {caseRecord.archivedAt !== null ? (
        <p className="notice notice-quiet">
          This case is archived, so nothing can be added to it. Restore the case first.
        </p>
      ) : (
        <FactForm context={state.value} revising={null} onReload={reload} />
      )}
    </article>
  );
}

export function ReviseFactPage() {
  const { id = '', factId = '' } = useParams();
  return <ReviseFact key={`${id}:${factId}`} caseId={id} factId={factId} />;
}

function ReviseFact({ caseId, factId }: { caseId: string; factId: string }) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`fact-revise:${caseId}:${factId}`, async () => {
    const [context, view] = await Promise.all([
      loadFormContext(api, caseId),
      loadFactView(api, caseId, factId),
    ]);
    return { context, view };
  });
  if (state.status === 'loading') return <LoadingNotice label="Loading fact…" />;
  if (state.status === 'error') {
    if (state.error instanceof ApiError && state.error.status === 404) {
      return (
        <article className="sheet">
          <h1>Revise case fact</h1>
          <NotInThisCase caseId={caseId} noun="fact" testId="fact-not-found" />
        </article>
      );
    }
    return <ErrorNotice error={state.error} recordLabel="fact" onRetry={reload} />;
  }
  const { context, view } = state.value;
  const { fact, head } = view;
  const caseRecord = context.caseResult.data;
  const current = head === null || head.id === fact.id;
  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          [caseRecord.intakeLabel, `/cases/${caseId}`],
          [
            `${FACT_TYPE_LABEL[fact.factType]}, revision ${fact.revision}`,
            `/cases/${caseId}/facts/${fact.id}`,
          ],
          ['New revision', null],
        ]}
      />
      <h1>New revision of a case fact</h1>
      <p className="page-intro">
        {FACT_HISTORY} {NO_READINESS}
      </p>
      {caseRecord.archivedAt !== null ? (
        <p className="notice notice-quiet">
          This case is archived, so its facts are read-only. Restore the case first.
        </p>
      ) : !current && head !== null ? (
        <p className="notice notice-quiet" data-testid="fact-not-head">
          Only the current revision of a fact can be revised. This is revision {fact.revision}; the
          current one is{' '}
          <Link to={`/cases/${caseId}/facts/${head.id}/revise`}>revision {head.revision}</Link>.
        </p>
      ) : (
        <FactForm key={fact.id} context={context} revising={fact} onReload={reload} />
      )}
    </article>
  );
}
