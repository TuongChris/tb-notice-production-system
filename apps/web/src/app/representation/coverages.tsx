// Coverage pages (P3B). A coverage records the documented scope of one mandate version over one
// exact route — covered works, territory, actions, exclusions, conditions, exclusivity, dates and
// the basis source — exactly as stated; nothing is derived from the agency, owner, subject,
// platform, names or an earlier coverage, and a coverage is not a G1 decision. Coverage signers are
// Signer records associated with one coverage ("recorded under this coverage"): an association is
// not signature authority, G7 or eligibility for any notice, and the signed-in User is never one.
// Coverage and coverage signers change only while their version is a draft.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  CoverageSigner,
  CreateCoverage,
  CreateCoverageSigner,
  MandateCoverage,
  PatchCoverage,
  Route,
} from '@tb/contracts';
import { etagOf, type Versioned } from '../api/directory.js';
import { Absent, Time } from '../directory/agencies.js';
import { createText, fieldIdFor, SelectField, TextField, sameJson } from '../directory/fields.js';
import { EXCLUSIVITY_LABEL, issuesOf, PLATFORM_LABEL } from '../directory/format.js';
import { useDirectoryApi, useLoad, useWrite, useIntentKey } from '../directory/hooks.js';
import { RecordName, useLookup } from '../directory/lookup.js';
import { useRecordPage, useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConfirmDialog,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  RecordHeader,
  Section,
  StatusNotice,
  ValidationSummary,
} from '../directory/ui.js';
import { ApiError } from '../api/client.js';
import type { SourceTarget } from '../sources/scope.js';
import {
  ActionScopeField,
  ActionScopeText,
  NO_CURRENTNESS,
  RecordedDate,
  SourceCitation,
  SourceSelect,
  VersionStamp,
  type ActionScope,
} from './authority-ui.js';
import { EventTimeline } from './events.js';

type Exclusivity = MandateCoverage['exclusivity'];

const BOUNDARY =
  'The documented scope of one version over one exact route. A coverage is not a G1 decision and adjudicates nothing; case authority is determined later.';
const SIGNER_MEANING =
  'Associated signers are recorded under this coverage only. An association is not signature authority, G7 clearance or eligibility for any notice, and it does not carry over to other coverages, routes or cases.';

const LABELS: Record<string, string> = {
  routeId: 'Route',
  coverageLabel: 'Coverage label',
  coveredWorksScope: 'Covered works',
  territorialScope: 'Territory',
  actionScope: 'Actions',
  exclusions: 'Exclusions',
  conditions: 'Conditions',
  exclusivity: 'Exclusivity',
  effectiveOn: 'Effective on',
  expiresOn: 'Expires on',
  basisSourceId: 'Basis source',
  predecessorCoverageId: 'Predecessor coverage',
  signerId: 'Signer',
  capacity: 'Capacity',
  sourceId: 'Source',
  endsOn: 'Ends on',
  limitations: 'Limitations',
};

const exclusivityOptions = (Object.keys(EXCLUSIVITY_LABEL) as Exclusivity[]).map((value) => ({
  value,
  label: EXCLUSIVITY_LABEL[value],
}));

/** The route of a coverage as a path: agency — platform — owner — legal subject. */
function CoverageRoute({
  route,
  ownerId,
  legalSubjectId,
}: {
  route: Route;
  ownerId: string | null;
  legalSubjectId: string | null;
}) {
  return (
    <div className="route-path" role="group" aria-label="Covered route">
      <div className="route-node">
        <span className="route-node-kind">Agency</span>
        <RecordName kind="agency" id={route.agencyId} />
      </div>
      <div className="route-edge" aria-hidden="true">
        <span>{PLATFORM_LABEL[route.platform]}</span>
      </div>
      <div className="route-node">
        <span className="route-node-kind">Owner</span>
        {ownerId === null ? <Absent /> : <RecordName kind="owner" id={ownerId} />}
      </div>
      <div className="route-node">
        <span className="route-node-kind">Legal subject</span>
        {legalSubjectId === null ? (
          <Absent />
        ) : (
          <RecordName kind="legalSubject" id={legalSubjectId} />
        )}
      </div>
      <p className="visually-hidden">Platform: {PLATFORM_LABEL[route.platform]}.</p>
    </div>
  );
}

interface ScopeText {
  readonly coverageLabel: string;
  readonly coveredWorksScope: string;
  readonly territorialScope: string;
  readonly exclusions: string;
  readonly conditions: string;
  readonly effectiveOn: string;
  readonly expiresOn: string;
}

function scopeTextOf(coverage: MandateCoverage | null): ScopeText {
  return {
    coverageLabel: coverage?.coverageLabel ?? '',
    coveredWorksScope: coverage?.coveredWorksScope ?? '',
    territorialScope: coverage?.territorialScope ?? '',
    exclusions: coverage?.exclusions ?? '',
    conditions: coverage?.conditions ?? '',
    effectiveOn: coverage?.effectiveOn ?? '',
    expiresOn: coverage?.expiresOn ?? '',
  };
}

function ScopeFields({
  value,
  onChange,
  actionScope,
  onActionScope,
  exclusivity,
  onExclusivity,
  errorFor,
}: {
  value: ScopeText;
  onChange: (value: ScopeText) => void;
  actionScope: ActionScope[];
  onActionScope: (value: ActionScope[]) => void;
  exclusivity: Exclusivity;
  onExclusivity: (value: Exclusivity) => void;
  errorFor: (path: string) => string | undefined;
}) {
  const set = (change: Partial<ScopeText>) => onChange({ ...value, ...change });
  return (
    <fieldset className="fieldset">
      <legend>Scope, exactly as the document states it</legend>
      <p className="hint">
        Leave a field empty when the document is silent: nothing is filled in from the agency, the
        owner, the route or another coverage. {NO_CURRENTNESS}
      </p>
      <TextField
        id="coverage-coverageLabel"
        label="Coverage label"
        required
        hint="A name for this coverage within its version; unique per route."
        value={value.coverageLabel}
        error={errorFor('coverageLabel')}
        onChange={(coverageLabel) => set({ coverageLabel })}
      />
      <TextField
        id="coverage-coveredWorksScope"
        label="Covered works"
        multiline
        value={value.coveredWorksScope}
        error={errorFor('coveredWorksScope')}
        onChange={(coveredWorksScope) => set({ coveredWorksScope })}
      />
      <TextField
        id="coverage-territorialScope"
        label="Territory"
        multiline
        value={value.territorialScope}
        error={errorFor('territorialScope')}
        onChange={(territorialScope) => set({ territorialScope })}
      />
      <ActionScopeField
        idPrefix="coverage-actionScope"
        legend="Actions the document names"
        hint="Recorded as stated. Naming an action grants nothing and performs nothing."
        value={actionScope}
        onChange={onActionScope}
      />
      <TextField
        id="coverage-exclusions"
        label="Exclusions"
        multiline
        value={value.exclusions}
        error={errorFor('exclusions')}
        onChange={(exclusions) => set({ exclusions })}
      />
      <TextField
        id="coverage-conditions"
        label="Conditions"
        multiline
        value={value.conditions}
        error={errorFor('conditions')}
        onChange={(conditions) => set({ conditions })}
      />
      <SelectField
        id="coverage-exclusivity"
        label="Exclusivity"
        value={exclusivity}
        options={exclusivityOptions}
        error={errorFor('exclusivity')}
        onChange={(next) => onExclusivity(next as Exclusivity)}
      />
      <div className="field-grid">
        <TextField
          id="coverage-effectiveOn"
          label="Effective on"
          type="date"
          value={value.effectiveOn}
          error={errorFor('effectiveOn')}
          onChange={(effectiveOn) => set({ effectiveOn })}
        />
        <TextField
          id="coverage-expiresOn"
          label="Expires on"
          type="date"
          value={value.expiresOn}
          error={errorFor('expiresOn')}
          onChange={(expiresOn) => set({ expiresOn })}
        />
      </div>
    </fieldset>
  );
}

/** Routes of an agency with their owner · subject names (unarchived only), and each subject id. */
function useAgencyRoutes(agencyId: string) {
  const api = useDirectoryApi();
  const lookup = useLookup();
  return useLoad(`coverage-routes:${agencyId}`, async () => {
    if (agencyId === '') return [];
    const routes = (await api.routes.list({ agencyId, limit: 100 })).items.filter(
      (route) => route.archivedAt === null,
    );
    return Promise.all(
      routes.map(async (route) => {
        const [name, link] = await Promise.all([
          lookup.get('ownerSubject', route.ownerSubjectId),
          lookup.ownerSubject(route.ownerSubjectId),
        ]);
        return {
          route,
          name: 'name' in name ? name.name : 'Route not available',
          legalSubjectId: link?.legalSubjectId ?? null,
        };
      }),
    );
  })[0];
}

export function NewCoveragePage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const [version, reloadVersion] = useLoad(`coverage-form:version:${id}`, () =>
    api.versions.get(id),
  );
  const agencyId = version.status === 'ready' ? version.value.data.agencyId : '';
  const mandateId = version.status === 'ready' ? version.value.data.mandateId : '';
  const routes = useAgencyRoutes(agencyId);
  const [routeId, setRouteId] = useState('');
  const [scope, setScope] = useState<ScopeText>(scopeTextOf(null));
  const [actionScope, setActionScope] = useState<ActionScope[]>([]);
  const [exclusivity, setExclusivity] = useState<Exclusivity>('UNKNOWN');
  const [basisSourceId, setBasisSourceId] = useState('');
  const [predecessorCoverageId, setPredecessorCoverageId] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [lineage] = useLoad(`coverage-form:lineage:${mandateId}:${routeId}`, async () => {
    if (mandateId === '' || routeId === '') return [];
    const frozen = (await api.versions.list(mandateId, { limit: 100 })).items.filter(
      (item) => item.versionState === 'FROZEN',
    );
    const lists = await Promise.all(
      frozen.map(async (item) =>
        (await api.coverages.list(item.id, { q: routeId, limit: 100 })).items
          .filter((coverage) => coverage.routeId === routeId)
          .map((coverage) => ({ coverage, version: item.version })),
      ),
    );
    return lists.flat();
  });
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  if (version.status === 'loading') return <LoadingNotice label="Loading version…" />;
  if (version.status === 'error') {
    return <ErrorNotice error={version.error} recordLabel="version" onRetry={reloadVersion} />;
  }
  const record = version.value;
  const routeItems = routes.status === 'ready' ? routes.value : [];
  const chosen = routeItems.find((item) => item.route.id === routeId) ?? null;
  const target: SourceTarget | null =
    chosen !== null && chosen.legalSubjectId !== null
      ? { kind: 'Route', agencyId, legalSubjectId: chosen.legalSubjectId }
      : null;
  const lineageItems = lineage.status === 'ready' ? lineage.value : [];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (routeId === '') problems['routeId'] = 'Choose the exact route this coverage names.';
    if (scope.coverageLabel.trim() === '') problems['coverageLabel'] = 'Enter a coverage label.';
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(`coverage-${first}`)?.focus();
      return;
    }
    const text = (value: string) => createText(value, true);
    const body: CreateCoverage = {
      routeId,
      coverageLabel: scope.coverageLabel.trim(),
      ...(text(scope.coveredWorksScope) === undefined
        ? {}
        : { coveredWorksScope: scope.coveredWorksScope }),
      ...(text(scope.territorialScope) === undefined
        ? {}
        : { territorialScope: scope.territorialScope }),
      ...(actionScope.length === 0 ? {} : { actionScope }),
      ...(text(scope.exclusions) === undefined ? {} : { exclusions: scope.exclusions }),
      ...(text(scope.conditions) === undefined ? {} : { conditions: scope.conditions }),
      ...(exclusivity === 'UNKNOWN' ? {} : { exclusivity }),
      ...(scope.effectiveOn === '' ? {} : { effectiveOn: scope.effectiveOn }),
      ...(scope.expiresOn === '' ? {} : { expiresOn: scope.expiresOn }),
      ...(basisSourceId === '' ? {} : { basisSourceId }),
      ...(predecessorCoverageId === '' ? {} : { predecessorCoverageId }),
    };
    const outcome = await submission.submit({ version: record.etag, body }, (auth) =>
      api.coverages.create(record.data.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/representation/coverages/${outcome.value.data.id}`, {
        state: { flash: 'Coverage recorded in the draft version.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Representation', '/representation'],
          ['Mandates', '/representation/mandates'],
          ['Mandate', `/representation/mandates/${record.data.mandateId}`],
          [`Version ${record.data.version}`, `/representation/versions/${record.data.id}`],
          ['New coverage', null],
        ]}
      />
      <h1>Add coverage to version {record.data.version}</h1>
      <p className="page-intro">
        One coverage names one exact route of this mandate’s agency. Choose it explicitly: coverage
        is never derived from the agency, owner, subject, platform, names or an earlier coverage.{' '}
        {BOUNDARY}
      </p>
      {submission.conflict && (
        <ConflictNotice
          recordLabel="version"
          onReload={() => {
            submission.reset();
            reloadVersion();
          }}
        />
      )}
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path] ?? path}
        fieldId={(path) => fieldIdFor('coverage', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="coverage" focusOnShow />
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Route</legend>
          <SelectField
            id="coverage-routeId"
            label="Route"
            required
            hint="Only unarchived routes of this mandate’s agency are offered. The route never changes afterwards."
            value={routeId}
            placeholder="Choose the exact route"
            options={routeItems.map((item) => ({
              value: item.route.id,
              label: `${item.name} (${PLATFORM_LABEL[item.route.platform]})`,
            }))}
            error={errorFor('routeId')}
            onChange={(value) => {
              setRouteId(value);
              setBasisSourceId('');
              setPredecessorCoverageId('');
            }}
          />
          <SelectField
            id="coverage-predecessorCoverageId"
            label="Predecessor coverage"
            hint="Optional lineage: a coverage of the same route in a frozen version of this mandate. Nothing is copied from it."
            value={predecessorCoverageId}
            options={[
              { value: '', label: 'No predecessor coverage' },
              ...lineageItems.map(({ coverage, version: number }) => ({
                value: coverage.id,
                label: `${coverage.coverageLabel} (version ${number})`,
              })),
            ]}
            error={errorFor('predecessorCoverageId')}
            onChange={setPredecessorCoverageId}
          />
        </fieldset>
        <ScopeFields
          value={scope}
          onChange={setScope}
          actionScope={actionScope}
          onActionScope={setActionScope}
          exclusivity={exclusivity}
          onExclusivity={setExclusivity}
          errorFor={errorFor}
        />
        <fieldset className="fieldset">
          <legend>Basis</legend>
          <SourceSelect
            id="coverage-basisSourceId"
            label="Basis source"
            hint="The document that states this scope. Only sources whose recorded scope includes the chosen route are offered; another owner’s material is refused by the server."
            target={target}
            value={basisSourceId}
            error={errorFor('basisSourceId')}
            onChange={setBasisSourceId}
          />
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Saving…' : 'Record coverage'}
          </button>
          <Link to={`/representation/versions/${record.data.id}`}>Cancel</Link>
        </div>
      </form>
    </article>
  );
}

export function CoverageDetailPage() {
  const { id = '' } = useParams();
  return <CoverageDetail key={id} id={id} />;
}

function CoverageDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const lookup = useLookup();
  const page = useRecordPage(`coverage:${id}`, () => api.coverages.get(id));
  const coverage = page.state.status === 'ready' ? page.state.value.data : null;
  const [context] = useLoad(
    `coverage-context:${coverage?.mandateVersionId ?? ''}:${coverage?.rowVersion ?? 0}`,
    async () => {
      if (coverage === null) return null;
      const version = (await api.versions.get(coverage.mandateVersionId)).data;
      const [mandate, route] = await Promise.all([
        api.mandates.get(version.mandateId),
        api.routes.get(coverage.routeId),
      ]);
      const link = await lookup.ownerSubject(route.data.ownerSubjectId);
      return { version, mandate: mandate.data, route: route.data, link };
    },
  );
  const trail = [
    ['Representation', '/representation'],
    ['Mandates', '/representation/mandates'],
  ] as const;
  if (page.state.status === 'loading') return <LoadingNotice label="Loading coverage…" />;
  if (page.state.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Coverage', null]]} />
        <ErrorNotice error={page.state.error} recordLabel="coverage" onRetry={page.reload} />
      </>
    );
  }
  const record = page.state.value;
  const data = record.data;
  const loaded = context.status === 'ready' ? context.value : null;
  const draft = loaded !== null && loaded.version.versionState === 'DRAFT';
  const editable = draft && loaded !== null && loaded.mandate.archivedAt === null;
  return (
    <article className="sheet" data-testid="coverage-detail">
      <Breadcrumbs
        trail={[
          ...trail,
          [
            loaded?.mandate.label ?? 'Mandate',
            loaded ? `/representation/mandates/${loaded.mandate.id}` : null,
          ],
          [
            loaded ? `Version ${loaded.version.version}` : 'Version',
            `/representation/versions/${data.mandateVersionId}`,
          ],
          [data.coverageLabel, null],
        ]}
      />
      <RecordHeader
        name={data.coverageLabel}
        stamp={loaded ? <VersionStamp state={loaded.version.versionState} /> : null}
        facts={[
          loaded
            ? `In version ${loaded.version.version} of ${loaded.mandate.label}`
            : 'Loading version…',
          `Record version ${data.rowVersion}`,
        ]}
        boundary={BOUNDARY}
      />
      {page.conflict && <ConflictNotice recordLabel="coverage" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      {loaded !== null && !draft && (
        <p className="notice notice-quiet">
          This coverage belongs to a frozen version: it and its coverage signers can no longer
          change.
        </p>
      )}
      {editable && (
        <div className="record-actions" role="group" aria-label="Actions for this coverage">
          <Link className="button" to={`/representation/coverages/${data.id}/edit`}>
            Edit coverage
          </Link>
          <Link className="button" to={`/representation/coverages/${data.id}/signers/new`}>
            Add coverage signer
          </Link>
        </div>
      )}
      {loaded !== null && (
        <CoverageRoute
          route={loaded.route}
          ownerId={loaded.link?.ownerId ?? null}
          legalSubjectId={loaded.link?.legalSubjectId ?? null}
        />
      )}
      <p className="hint">
        Route: <RecordName kind="route" id={data.routeId} />. This coverage names this route only;
        it does not extend to another route, subject or owner.
      </p>
      <div className="sheet-columns">
        <Section title="Recorded scope">
          <Details
            rows={[
              [
                'Covered works',
                data.coveredWorksScope && <p className="prose">{data.coveredWorksScope}</p>,
              ],
              [
                'Territory',
                data.territorialScope && <p className="prose">{data.territorialScope}</p>,
              ],
              ['Actions the document names', <ActionScopeText scope={data.actionScope} />],
              ['Exclusions', data.exclusions && <p className="prose">{data.exclusions}</p>],
              ['Conditions', data.conditions && <p className="prose">{data.conditions}</p>],
              ['Exclusivity', EXCLUSIVITY_LABEL[data.exclusivity]],
              ['Effective on', <RecordedDate value={data.effectiveOn} />],
              ['Expires on', <RecordedDate value={data.expiresOn} />],
            ]}
          />
        </Section>
        <Section title="Basis and lineage">
          <Details
            rows={[
              ['Basis source', <SourceCitation sourceId={data.basisSourceId} />],
              [
                'Predecessor coverage',
                data.predecessorCoverageId === null ? null : (
                  <RecordName kind="coverage" id={data.predecessorCoverageId} />
                ),
              ],
            ]}
          />
          <p className="hint">A predecessor is lineage only; nothing is inherited from it.</p>
        </Section>
      </div>
      <CoverageSigners
        coverage={record}
        editable={editable}
        onChanged={(message) => {
          // The coverage's row version moved with its signer set: show the current record.
          void api.coverages.get(data.id).then(
            (next) => page.update(next, message),
            () => page.reload(),
          );
        }}
      />
      {loaded !== null && (
        <Section title="Authority events for this coverage">
          <EventTimeline mandateId={loaded.mandate.id} coverageId={data.id} />
        </Section>
      )}
      <Section title="Record">
        <Details
          rows={[
            ['Record id', <code>{data.id}</code>],
            ['Created', <Time iso={data.createdAt} />],
            ['Last changed', <Time iso={data.updatedAt} />],
            ['Record version', String(data.rowVersion)],
          ]}
        />
      </Section>
    </article>
  );
}

/** Signers recorded under one coverage; removable only while the version is a draft. */
function CoverageSigners({
  coverage,
  editable,
  onChanged,
}: {
  coverage: Versioned<MandateCoverage>;
  editable: boolean;
  onChanged: (message: string) => void;
}) {
  const api = useDirectoryApi();
  const write = useWrite();
  const intent = useIntentKey();
  const [state, reload] = useLoad(
    `coverage-signers:${coverage.data.id}:${coverage.data.rowVersion}`,
    async () => (await api.coverageSigners.list(coverage.data.id, { limit: 100 })).items,
  );
  const [removing, setRemoving] = useState<CoverageSigner | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState(false);

  async function remove(row: CoverageSigner) {
    setPending(true);
    setError(null);
    try {
      const etag = etagOf('CoverageSigner', row);
      await write(intent.keyFor({ remove: row.id, etag }), (auth) =>
        api.coverageSigners.remove(row.id, etag, auth),
      );
      intent.done();
      setRemoving(null);
      onChanged('Coverage signer removed from the draft.');
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 412) {
        setRemoving(null);
        setConflict(true);
      } else {
        setError(failure);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Section title="Coverage signers">
      <p className="hint">{SIGNER_MEANING}</p>
      {conflict && (
        <ConflictNotice
          recordLabel="coverage signer"
          onReload={() => {
            setConflict(false);
            reload();
          }}
        />
      )}
      {state.status === 'loading' && <LoadingNotice label="Loading coverage signers…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} onRetry={reload} />}
      {state.status === 'ready' &&
        (state.value.length === 0 ? (
          <p className="absent">No signer recorded under this coverage.</p>
        ) : (
          <ul className="plain-list signer-list">
            {state.value.map((row) => (
              <li key={row.id} data-testid="coverage-signer">
                <div>
                  <span className="tree-kind">Associated signer</span>{' '}
                  <RecordName kind="signer" id={row.signerId} /> — {row.capacity}
                </div>
                <Details
                  rows={[
                    ['Actions the document names', <ActionScopeText scope={row.actionScope} />],
                    ['Effective on', <RecordedDate value={row.effectiveOn} />],
                    ['Ends on', <RecordedDate value={row.endsOn} />],
                    ['Source', <SourceCitation sourceId={row.sourceId} />],
                    ['Limitations', row.limitations && <p className="prose">{row.limitations}</p>],
                  ]}
                />
                {editable && (
                  <button
                    type="button"
                    className="button-danger-quiet"
                    onClick={() => {
                      setError(null);
                      setRemoving(row);
                    }}
                  >
                    Remove from this draft
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
      <ConfirmDialog
        open={removing !== null}
        title="Remove this coverage signer?"
        description={
          <p>
            The association is removed from the draft version only; the Signer record is unchanged
            and the audit trail keeps what was recorded.
          </p>
        }
        confirmLabel="Remove signer"
        recordLabel="coverage signer"
        pending={pending}
        error={error}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing !== null) void remove(removing);
        }}
      />
    </Section>
  );
}

export function EditCoveragePage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`coverage-edit:${id}`, () => api.coverages.get(id));
  const versionId = state.status === 'ready' ? state.value.data.mandateVersionId : '';
  const [version] = useLoad(`coverage-edit-version:${versionId}`, async () =>
    versionId === '' ? null : (await api.versions.get(versionId)).data,
  );
  if (state.status === 'loading' || version.status === 'loading') {
    return <LoadingNotice label="Loading coverage…" />;
  }
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="coverage" onRetry={reload} />;
  }
  if (version.status === 'ready' && version.value?.versionState === 'FROZEN') {
    return (
      <article className="sheet">
        <h1>This coverage belongs to a frozen version</h1>
        <p className="notice notice-quiet">
          A frozen version and its coverage never change. Record a successor version to correct it.
        </p>
        <Link to={`/representation/coverages/${id}`}>Back to the coverage</Link>
      </article>
    );
  }
  return <CoveragePatchForm key={state.value.etag} record={state.value} onReload={reload} />;
}

function CoveragePatchForm({
  record,
  onReload,
}: {
  record: Versioned<MandateCoverage>;
  onReload: () => void;
}) {
  const api = useDirectoryApi();
  const lookup = useLookup();
  const navigate = useNavigate();
  const submission = useSubmission();
  const coverage = record.data;
  const [scope, setScope] = useState<ScopeText>(scopeTextOf(coverage));
  const [actionScope, setActionScope] = useState<ActionScope[]>([...(coverage.actionScope ?? [])]);
  const [exclusivity, setExclusivity] = useState<Exclusivity>(coverage.exclusivity);
  const [basisSourceId, setBasisSourceId] = useState(coverage.basisSourceId ?? '');
  const [nothingToSave, setNothingToSave] = useState(false);
  const [subject] = useLoad(`coverage-edit-subject:${coverage.routeId}`, async () => {
    const route = (await api.routes.get(coverage.routeId)).data;
    return (await lookup.ownerSubject(route.ownerSubjectId))?.legalSubjectId ?? null;
  });
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) => issues.find((issue) => issue.path === path)?.message;
  const target: SourceTarget | null =
    subject.status === 'ready' && subject.value !== null
      ? { kind: 'Route', agencyId: coverage.agencyId, legalSubjectId: subject.value }
      : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNothingToSave(false);
    const body: PatchCoverage = {};
    const text = (value: string) => (value.trim() === '' ? null : value);
    if (
      scope.coverageLabel.trim() !== coverage.coverageLabel &&
      scope.coverageLabel.trim() !== ''
    ) {
      body.coverageLabel = scope.coverageLabel.trim();
    }
    for (const field of [
      'coveredWorksScope',
      'territorialScope',
      'exclusions',
      'conditions',
    ] as const) {
      const value = text(scope[field]);
      if (value !== coverage[field]) body[field] = value;
    }
    const actions = actionScope.length === 0 ? null : actionScope;
    if (!sameJson(actions, coverage.actionScope)) body.actionScope = actions;
    if (exclusivity !== coverage.exclusivity) body.exclusivity = exclusivity;
    const effectiveOn = scope.effectiveOn === '' ? null : scope.effectiveOn;
    if (effectiveOn !== coverage.effectiveOn) body.effectiveOn = effectiveOn;
    const expiresOn = scope.expiresOn === '' ? null : scope.expiresOn;
    if (expiresOn !== coverage.expiresOn) body.expiresOn = expiresOn;
    const basis = basisSourceId === '' ? null : basisSourceId;
    if (basis !== coverage.basisSourceId) body.basisSourceId = basis;
    if (Object.keys(body).length === 0) {
      setNothingToSave(true);
      return;
    }
    const outcome = await submission.submit({ id: coverage.id, body }, (auth) =>
      api.coverages.patch(coverage.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/representation/coverages/${coverage.id}`, {
        state: { flash: 'Coverage saved.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Representation', '/representation'],
          ['Mandates', '/representation/mandates'],
          ['Version', `/representation/versions/${coverage.mandateVersionId}`],
          [coverage.coverageLabel, `/representation/coverages/${coverage.id}`],
          ['Edit', null],
        ]}
      />
      <h1>Edit coverage</h1>
      <p className="page-intro">
        Only changed fields are sent. The route and the lineage never change; a different route is a
        different coverage.
      </p>
      {submission.conflict && <ConflictNotice recordLabel="coverage" onReload={onReload} />}
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path] ?? path}
        fieldId={(path) => fieldIdFor('coverage', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="coverage" focusOnShow />
      )}
      {nothingToSave && (
        <p role="status" className="notice notice-quiet">
          Nothing to save: no field was changed.
        </p>
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Route (fixed)</legend>
          <Details
            rows={[
              ['Route', <RecordName kind="route" id={coverage.routeId} />],
              [
                'Predecessor coverage',
                coverage.predecessorCoverageId === null ? null : (
                  <RecordName kind="coverage" id={coverage.predecessorCoverageId} />
                ),
              ],
            ]}
          />
        </fieldset>
        <ScopeFields
          value={scope}
          onChange={setScope}
          actionScope={actionScope}
          onActionScope={setActionScope}
          exclusivity={exclusivity}
          onExclusivity={setExclusivity}
          errorFor={errorFor}
        />
        <fieldset className="fieldset">
          <legend>Basis</legend>
          <SourceSelect
            id="coverage-basisSourceId"
            label="Basis source"
            hint="Only sources whose recorded scope includes this route are offered."
            target={target}
            value={basisSourceId}
            error={errorFor('basisSourceId')}
            onChange={setBasisSourceId}
          />
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Saving…' : 'Save coverage'}
          </button>
          <Link to={`/representation/coverages/${coverage.id}`}>Cancel</Link>
        </div>
      </form>
    </article>
  );
}

export function NewCoverageSignerPage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const lookup = useLookup();
  const navigate = useNavigate();
  const submission = useSubmission();
  const [coverage, reloadCoverage] = useLoad(`signer-form:coverage:${id}`, () =>
    api.coverages.get(id),
  );
  const agencyId = coverage.status === 'ready' ? coverage.value.data.agencyId : '';
  const routeId = coverage.status === 'ready' ? coverage.value.data.routeId : '';
  const [signers] = useLoad(`signer-form:signers:${agencyId}`, async () =>
    agencyId === '' ? [] : (await api.signers.list({ agencyId, limit: 100 })).items,
  );
  const [subject] = useLoad(`signer-form:subject:${routeId}`, async () => {
    if (routeId === '') return null;
    const route = (await api.routes.get(routeId)).data;
    return (await lookup.ownerSubject(route.ownerSubjectId))?.legalSubjectId ?? null;
  });
  const [signerId, setSignerId] = useState('');
  const [capacity, setCapacity] = useState('');
  const [actionScope, setActionScope] = useState<ActionScope[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [effectiveOn, setEffectiveOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [limitations, setLimitations] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  if (coverage.status === 'loading') return <LoadingNotice label="Loading coverage…" />;
  if (coverage.status === 'error') {
    return <ErrorNotice error={coverage.error} recordLabel="coverage" onRetry={reloadCoverage} />;
  }
  const record = coverage.value;
  const offered = (signers.status === 'ready' ? signers.value : []).filter(
    (signer) => signer.archivedAt === null && signer.operationalState !== 'ENDED',
  );
  const target: SourceTarget | null =
    subject.status === 'ready' && subject.value !== null
      ? { kind: 'Route', agencyId, legalSubjectId: subject.value }
      : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (signerId === '') problems['signerId'] = 'Choose the signer the document names.';
    if (capacity.trim() === '') problems['capacity'] = 'Enter the capacity the document states.';
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(`coverage-signer-${first}`)?.focus();
      return;
    }
    const limitationText = createText(limitations, true);
    const body: CreateCoverageSigner = {
      signerId,
      capacity: capacity.trim(),
      ...(actionScope.length === 0 ? {} : { actionScope }),
      ...(sourceId === '' ? {} : { sourceId }),
      ...(effectiveOn === '' ? {} : { effectiveOn }),
      ...(endsOn === '' ? {} : { endsOn }),
      ...(limitationText === undefined ? {} : { limitations: limitationText }),
    };
    const outcome = await submission.submit({ coverage: record.etag, body }, (auth) =>
      api.coverageSigners.create(record.data.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/representation/coverages/${record.data.id}`, {
        state: { flash: 'Signer recorded under this coverage.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Representation', '/representation'],
          ['Mandates', '/representation/mandates'],
          ['Version', `/representation/versions/${record.data.mandateVersionId}`],
          [record.data.coverageLabel, `/representation/coverages/${record.data.id}`],
          ['Add coverage signer', null],
        ]}
      />
      <h1>Add coverage signer</h1>
      <p className="page-intro">
        Record a Signer the document names for this coverage. {SIGNER_MEANING} The signed-in
        application user is never a signer.
      </p>
      {submission.conflict && (
        <ConflictNotice
          recordLabel="coverage"
          onReload={() => {
            submission.reset();
            reloadCoverage();
          }}
        />
      )}
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path] ?? path}
        fieldId={(path) => fieldIdFor('coverage-signer', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="coverage signer" focusOnShow />
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Signer</legend>
          <SelectField
            id="coverage-signer-signerId"
            label="Signer"
            required
            hint="Only signers of this coverage’s agency that are neither archived nor ended are offered. Nothing is inferred from the route’s default signer or from names."
            value={signerId}
            placeholder="Choose a signer"
            options={offered.map((signer) => ({ value: signer.id, label: signer.fullLegalName }))}
            error={errorFor('signerId')}
            onChange={setSignerId}
          />
          <TextField
            id="coverage-signer-capacity"
            label="Capacity"
            required
            hint="As the document states it, e.g. director or attorney-in-fact."
            value={capacity}
            error={errorFor('capacity')}
            onChange={setCapacity}
          />
          <ActionScopeField
            idPrefix="coverage-signer-actionScope"
            legend="Actions the document names for this signer"
            hint="Recorded as stated. Naming an action grants nothing and performs nothing."
            value={actionScope}
            onChange={setActionScope}
          />
          <SourceSelect
            id="coverage-signer-sourceId"
            label="Source"
            hint="Only sources whose recorded scope includes this coverage’s route are offered."
            target={target}
            value={sourceId}
            error={errorFor('sourceId')}
            onChange={setSourceId}
          />
          <div className="field-grid">
            <TextField
              id="coverage-signer-effectiveOn"
              label="Effective on"
              type="date"
              value={effectiveOn}
              error={errorFor('effectiveOn')}
              onChange={setEffectiveOn}
            />
            <TextField
              id="coverage-signer-endsOn"
              label="Ends on"
              type="date"
              value={endsOn}
              error={errorFor('endsOn')}
              onChange={setEndsOn}
            />
          </div>
          <TextField
            id="coverage-signer-limitations"
            label="Limitations"
            multiline
            value={limitations}
            error={errorFor('limitations')}
            onChange={setLimitations}
          />
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Saving…' : 'Record coverage signer'}
          </button>
          <Link to={`/representation/coverages/${record.data.id}`}>Cancel</Link>
        </div>
      </form>
    </article>
  );
}
