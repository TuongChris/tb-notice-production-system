// Case pages (P4A). A case is the boundary of every case-specific record and not a legal verdict:
// creating, binding, closing or archiving one establishes no ownership, infringement, permission,
// authority, G1–G7 decision, readiness, signature or external action. Nothing is inferred — the
// agency, owner hint and route are chosen explicitly, and no route, canonical id, source link or
// authority selection is filled in for the operator. Every page is keyed by the case id, so the
// state of one case (loaded records, open dialogs, entered text) never carries over to another.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type {
  CanonicalBindingRequest,
  CaseRecord,
  CaseWorkflowRequest,
  CreateCase,
  PatchCase,
  Route,
} from '@tb/contracts';
import { ApiError } from '../api/client.js';
import type { Versioned } from '../api/directory.js';
import { Absent, Time } from '../directory/agencies.js';
import { BindDialog } from '../directory/canonical-binding.js';
import { fieldIdFor, SelectField, TextField, text as textOf } from '../directory/fields.js';
import {
  CASE_CLASS_LABEL,
  issuesOf,
  LINK_STATE_LABEL,
  LINK_STATE_TONE,
  PLATFORM_LABEL,
  WORKFLOW_STATE_LABEL,
} from '../directory/format.js';
import { useDirectoryApi, useIntentKey, useLoad, useWrite } from '../directory/hooks.js';
import { DirectoryList } from '../directory/list.js';
import { RecordName, useLookup } from '../directory/lookup.js';
import { useRecordOperation } from '../directory/record-actions.js';
import { useRecordPage, useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConfirmDialog,
  ConflictNotice,
  Details,
  Dialog,
  ErrorNotice,
  LoadingNotice,
  ReasonDialog,
  RecordHeader,
  Section,
  StateStamp,
  StatusNotice,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';
import { SourceCitation, SourceSelect } from '../representation/authority-ui.js';
import type { SourceTarget } from '../sources/scope.js';
import { AuthoritySelectionSection } from './authority-selection.js';
import { CaseCorrespondenceSection } from './case-correspondence.js';
import { CaseIntakeSections } from './case-intake.js';
import { CaseSourcesSection } from './case-sources.js';
import {
  CANONICAL_CASE_MEANING,
  CASE_BOUNDARY,
  OWNER_HINT_MEANING,
  ROUTE_BINDING_MEANING,
  ROUTE_CORRECTION,
  useCaseTarget,
  WORKFLOW_MEANING,
  WorkflowStamp,
} from './case-ui.js';

type WorkflowState = CaseRecord['workflowState'];
type CaseClass = CaseRecord['caseClass'];

const WORKFLOW_STATES = Object.keys(WORKFLOW_STATE_LABEL) as WorkflowState[];

export function CaseListPage() {
  const api = useDirectoryApi();
  const [params, setParams] = useSearchParams();
  const agencyId = params.get('agencyId') ?? '';
  const workflowState = params.get('workflowState') ?? '';
  const [agencies] = useLoad('cases:agency-filter', () => api.agencies.list({ limit: 100 }));
  const agencyItems = agencies.status === 'ready' ? agencies.value.items : [];
  function setFilter(name: 'agencyId' | 'workflowState', value: string) {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(name);
    else next.set(name, value);
    setParams(next);
  }
  const filtered = agencyId !== '' || workflowState !== '';
  return (
    <DirectoryList<CaseRecord>
      title="Cases"
      noun="cases"
      intro="Each case holds its own records: its route binding, linked sources, the authority materials selected for evaluation, its intake (reported items, works, use mappings and facts) and its correspondence bindings. A case is not a legal verdict."
      searchLabel="Search intake label or canonical case id"
      newLabel="New case"
      newTo="/cases/new"
      filterKey={`${agencyId}\u0000${workflowState}`}
      filters={
        <>
          <label className="list-filter">
            Agency
            <select
              value={agencyId}
              onChange={(event) => setFilter('agencyId', event.target.value)}
            >
              <option value="">All agencies</option>
              {agencyItems.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="list-filter">
            Workflow
            <select
              value={workflowState}
              onChange={(event) => setFilter('workflowState', event.target.value)}
            >
              <option value="">All workflow states</option>
              {WORKFLOW_STATES.map((state) => (
                <option key={state} value={state}>
                  {WORKFLOW_STATE_LABEL[state]}
                </option>
              ))}
            </select>
          </label>
        </>
      }
      load={(query) =>
        api.cases.list({
          ...query,
          ...(agencyId ? { agencyId } : {}),
          ...(workflowState ? { workflowState } : {}),
        })
      }
      emptyText={
        filtered ? (
          <p>
            No cases match these filters.{' '}
            <button
              type="button"
              className="button-link"
              onClick={() => setParams(new URLSearchParams())}
            >
              Show all cases
            </button>
          </p>
        ) : (
          <p>
            No cases yet. <Link to="/cases/new">Create the first case</Link>.
          </p>
        )
      }
      columns={[
        {
          header: 'Intake label',
          cell: (item) => <Link to={`/cases/${item.id}`}>{item.intakeLabel}</Link>,
        },
        { header: 'Agency', cell: (item) => <RecordName kind="agency" id={item.agencyId} /> },
        {
          header: 'Route',
          cell: (item) =>
            item.routeId === null ? (
              <span className="absent">No route bound</span>
            ) : (
              <RecordName kind="route" id={item.routeId} />
            ),
        },
        {
          header: 'Workflow',
          cell: (item) => (
            <span className="stamps">
              <WorkflowStamp state={item.workflowState} />
              {item.archivedAt !== null && <StateStamp label="Archived" tone="archived" />}
            </span>
          ),
        },
        {
          header: 'Canonical case id',
          cell: (item) => item.canonicalCaseId ?? <span className="absent">None</span>,
        },
        { header: 'Updated', cell: (item) => <Time iso={item.updatedAt} /> },
      ]}
    />
  );
}

export function CaseDetailPage() {
  const { id = '' } = useParams();
  return <CaseDetail key={id} id={id} />;
}

function CaseDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const page = useRecordPage(`case:${id}`, () => api.cases.get(id));
  const loaded = page.state.status === 'ready' ? page.state.value.data : null;
  const target = useCaseTarget(loaded);
  const trail = [['Cases', '/cases']] as const;
  if (page.state.status === 'loading') return <LoadingNotice label="Loading case…" />;
  if (page.state.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Case', null]]} />
        <ErrorNotice error={page.state.error} recordLabel="case" onRetry={page.reload} />
      </>
    );
  }
  const record = page.state.value;
  const item = record.data;
  const archived = item.archivedAt !== null;
  return (
    <article className="sheet" data-testid="case-detail">
      <Breadcrumbs trail={[...trail, [item.intakeLabel, null]]} />
      <RecordHeader
        name={item.intakeLabel}
        stamp={
          <span className="stamps">
            <WorkflowStamp state={item.workflowState} />
            {archived && <StateStamp label="Archived" tone="archived" />}
          </span>
        }
        facts={[
          `Version ${item.rowVersion}`,
          `Context revision ${item.contextRevision}`,
          item.canonicalCaseId === null
            ? 'No canonical case id'
            : `Canonical case id ${item.canonicalCaseId}`,
        ]}
        boundary={CASE_BOUNDARY}
      />
      {page.conflict && <ConflictNotice recordLabel="case" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      <CaseActions
        record={record}
        onChanged={page.update}
        onConflict={page.raiseConflict}
        onDeleted={() =>
          void navigate('/cases', {
            state: { flash: 'Unused case deleted.' } satisfies FlashState,
          })
        }
      />
      {archived && (
        <p className="notice notice-quiet">
          Archived <Time iso={item.archivedAt} />. Reason: {item.archiveReason}. An archived case
          and everything under it are read-only until it is restored.
        </p>
      )}
      <div className="sheet-columns">
        <Section title="Case context">
          <Details
            rows={[
              ['Agency', <RecordName kind="agency" id={item.agencyId} />],
              ['Platform', PLATFORM_LABEL[item.platform]],
              ['Case class', CASE_CLASS_LABEL[item.caseClass]],
              [
                'Owner hint',
                item.ownerHintId === null ? null : (
                  <RecordName kind="owner" id={item.ownerHintId} />
                ),
              ],
              [
                'Drive folder',
                item.driveFolderUrl && (
                  <a href={item.driveFolderUrl} rel="noreferrer noopener" target="_blank">
                    {item.driveFolderUrl}
                  </a>
                ),
              ],
              [
                'Packet source',
                item.packetSourceId === null ? null : (
                  <SourceCitation sourceId={item.packetSourceId} />
                ),
              ],
            ]}
          />
          <p className="hint">{OWNER_HINT_MEANING}</p>
        </Section>
        <Section title="Workflow">
          <Details
            rows={[
              ['Workflow state', <WorkflowStamp state={item.workflowState} />],
              ['Closed', item.closedAt && <Time iso={item.closedAt} />],
              ['Close reason', item.closeReason],
            ]}
          />
          <p className="hint">{WORKFLOW_MEANING}</p>
        </Section>
      </div>
      <CaseRouteSection record={record} onChanged={page.update} onConflict={page.raiseConflict} />
      <CaseCanonicalSection
        record={record}
        target={target.status === 'ready' ? target.value : null}
        onChanged={page.update}
        onConflict={page.raiseConflict}
      />
      <CaseSourcesSection caseRecord={item} onCaseChanged={page.reloadWith} />
      <AuthoritySelectionSection caseRecord={item} />
      <CaseIntakeSections caseRecord={item} />
      <CaseCorrespondenceSection caseRecord={item} />
      <Section title="Production context">
        <p className="hint">
          Assembles this case’s recorded context for one task, to inspect what is recorded and what
          is missing. It does not determine G1–G7 or readiness, and reading it changes nothing.
        </p>
        <p>
          <Link to={`/cases/${item.id}/production-context`} data-testid="open-production-context">
            Open the production context
          </Link>
        </p>
      </Section>
      <Section title="Prompts">
        <p className="hint">
          Immutable prompt snapshots generated from one reviewed production context of this case, as
          input for drafting outside this application. None is a notice, approval, readiness
          decision, signature or transmission.
        </p>
        <p>
          <Link to={`/cases/${item.id}/prompts`} data-testid="open-prompts">
            Open the prompts of this case
          </Link>
        </p>
      </Section>
      <Section title="Candidates">
        <p className="hint">
          Unsigned draft artifacts drafted outside this application from a prompt snapshot of this
          case and imported exactly. None is an approval, signature, readiness decision or
          transmission.
        </p>
        <p>
          <Link to={`/cases/${item.id}/candidates`} data-testid="open-candidates">
            Open the candidates of this case
          </Link>
        </p>
      </Section>
      <Section title="Notes">
        {item.notes ? <p className="prose">{item.notes}</p> : <Absent />}
      </Section>
      <Section title="Record">
        <Details
          rows={[
            ['Record id', <code key="id">{item.id}</code>],
            ['Created', <Time key="created" iso={item.createdAt} />],
            ['Last changed', <Time key="updated" iso={item.updatedAt} />],
            ['Version', String(item.rowVersion)],
            ['Context revision', String(item.contextRevision)],
          ]}
        />
        <p className="hint">
          The context revision moves with every change to what the case relies on: its route,
          canonical id, linked sources, authority selection, owner hint, packet source and folder,
          its reported items, works, use mappings and facts, and its correspondence bindings.
        </p>
      </Section>
    </article>
  );
}

function CaseActions({
  record,
  onChanged,
  onConflict,
  onDeleted,
}: {
  record: Versioned<CaseRecord>;
  onChanged: (next: Versioned<CaseRecord>, message: string) => void;
  onConflict: () => void;
  onDeleted: () => void;
}) {
  const api = useDirectoryApi();
  const operation = useRecordOperation(record, onConflict);
  const item = record.data;
  const archived = item.archivedAt !== null;
  const others = WORKFLOW_STATES.filter((state) => state !== item.workflowState);
  const [nextState, setNextState] = useState<WorkflowState>(others[0] ?? 'PREPARING');
  const deleteBlocker = archived
    ? 'Archived cases are kept for history and are not deleted.'
    : item.canonicalCaseId !== null
      ? 'This case has a canonical binding, so it is not an unused case.'
      : null;
  return (
    <div className="record-actions" role="group" aria-label="Actions for this case">
      {!archived && (
        <Link className="button" to={`/cases/${item.id}/edit`}>
          Edit
        </Link>
      )}
      {!archived && (
        <button
          type="button"
          onClick={() => {
            setNextState(others[0] ?? 'PREPARING');
            operation.show('state');
          }}
        >
          Change workflow state
        </button>
      )}
      {!archived ? (
        <button type="button" onClick={() => operation.show('archive')}>
          Archive
        </button>
      ) : (
        <button type="button" onClick={() => operation.show('restore')}>
          Restore
        </button>
      )}
      {deleteBlocker === null ? (
        <button
          type="button"
          className="button-danger-quiet"
          onClick={() => operation.show('delete')}
        >
          Delete unused case
        </button>
      ) : (
        <UnavailableAction label="Delete unused case" reason={deleteBlocker} />
      )}

      <ReasonDialog
        open={operation.open === 'state'}
        title="Change workflow state"
        description={<p>{WORKFLOW_MEANING}</p>}
        confirmLabel="Change workflow state"
        recordLabel="case"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) => {
          const body: CaseWorkflowRequest = { state: nextState, reason };
          void operation.run(
            'state',
            body,
            (auth) => api.cases.setWorkflow(item.id, body, record.etag, auth),
            (next) =>
              onChanged(next, `Workflow state changed to ${WORKFLOW_STATE_LABEL[nextState]}.`),
          );
        }}
      >
        <SelectField
          id="case-next-workflow-state"
          label="New workflow state"
          value={nextState}
          options={others.map((state) => ({ value: state, label: WORKFLOW_STATE_LABEL[state] }))}
          onChange={(value) => setNextState(value as WorkflowState)}
        />
      </ReasonDialog>
      <ReasonDialog
        open={operation.open === 'archive'}
        title="Archive this case"
        description={
          <p>
            Archiving keeps the case, its route binding, linked sources, authority selections and
            intake records unchanged but makes all of them read-only. Nothing is revoked, deleted or
            sent.
          </p>
        }
        confirmLabel="Archive"
        recordLabel="case"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'archive',
            { reason },
            (auth) => api.cases.archive(item.id, { reason }, record.etag, auth),
            (next) => onChanged(next, 'Archived.'),
          )
        }
      />
      <ReasonDialog
        open={operation.open === 'restore'}
        title="Restore this case"
        description={
          <p>
            The case becomes editable again exactly as it was. It is not restored while its agency
            or its bound route is archived, and restoring revives no route, link or authority.
          </p>
        }
        confirmLabel="Restore"
        recordLabel="case"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'restore',
            { reason },
            (auth) => api.cases.restore(item.id, { reason }, record.etag, auth),
            (next) => onChanged(next, 'Restored.'),
          )
        }
      />
      <ConfirmDialog
        open={operation.open === 'delete'}
        title="Delete this unused case?"
        description={
          <p>
            Only a case that nothing refers to can be deleted, and deletion can’t be undone. If any
            source is linked, any authority selection or intake record was recorded or anything else
            refers to it, the server refuses and you can archive it instead.
          </p>
        }
        confirmLabel="Delete case"
        recordLabel="case"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={() =>
          void operation.run(
            'delete',
            null,
            (auth) => api.cases.remove(item.id, record.etag, auth),
            () => onDeleted(),
          )
        }
      />
    </div>
  );
}

/** The case's route shown as a path: agency — platform — owner — legal subject. */
function CaseRoutePath({ route }: { route: Route }) {
  const api = useDirectoryApi();
  const [link] = useLoad(
    `case-route-link:${route.ownerSubjectId}`,
    async () => (await api.ownerSubjects.get(route.ownerSubjectId)).data,
  );
  const association = link.status === 'ready' ? link.value : null;
  return (
    <div className="route-path" role="group" aria-label="Bound route">
      <div className="route-node">
        <span className="route-node-kind">Agency</span>
        <RecordName kind="agency" id={route.agencyId} />
      </div>
      <div className="route-edge" aria-hidden="true">
        <span>{PLATFORM_LABEL[route.platform]}</span>
      </div>
      <div className="route-node">
        <span className="route-node-kind">Owner</span>
        {association === null ? <Absent /> : <RecordName kind="owner" id={association.ownerId} />}
      </div>
      <div className="route-node">
        <span className="route-node-kind">Legal subject</span>
        {association === null ? (
          <Absent />
        ) : (
          <RecordName kind="legalSubject" id={association.legalSubjectId} />
        )}
      </div>
      <p className="visually-hidden">Platform: {PLATFORM_LABEL[route.platform]}.</p>
    </div>
  );
}

/** Why a route cannot take a case binding (null when it can). */
function routeUnavailable(route: Route): string | null {
  if (route.archivedAt !== null) return 'archived';
  if (route.linkState !== 'LINKED') return LINK_STATE_LABEL[route.linkState].toLowerCase();
  return null;
}

function CaseRouteSection({
  record,
  onChanged,
  onConflict,
}: {
  record: Versioned<CaseRecord>;
  onChanged: (next: Versioned<CaseRecord>, message: string) => void;
  onConflict: () => void;
}) {
  const api = useDirectoryApi();
  const item = record.data;
  const archived = item.archivedAt !== null;
  const [open, setOpen] = useState(false);
  const [route] = useLoad(`case-route:${item.id}:${item.routeId ?? ''}`, async () =>
    item.routeId === null ? null : (await api.routes.get(item.routeId)).data,
  );
  const bound = route.status === 'ready' ? route.value : null;
  const label = item.routeId === null ? 'Bind a route' : 'Correct the route binding';
  return (
    <Section title="Route">
      <p className="hint">{ROUTE_BINDING_MEANING}</p>
      {item.routeId === null ? (
        <p className="absent">No route bound to this case.</p>
      ) : route.status === 'loading' ? (
        <LoadingNotice label="Loading route…" />
      ) : route.status === 'error' ? (
        <ErrorNotice error={route.error} recordLabel="route" />
      ) : bound === null ? null : (
        <>
          <CaseRoutePath route={bound} />
          <p>
            <Link to={`/representation/routes/${bound.id}`}>Open the route</Link>{' '}
            <StateStamp
              label={LINK_STATE_LABEL[bound.linkState]}
              tone={LINK_STATE_TONE[bound.linkState]}
            />
            {bound.archivedAt !== null && <StateStamp label="Archived" tone="archived" />}
          </p>
        </>
      )}
      {archived ? (
        <UnavailableAction
          label={label}
          reason="Archived cases are read-only. Restore the case first."
        />
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          {label}
        </button>
      )}
      <p className="hint">{ROUTE_CORRECTION}</p>
      <RouteBindingDialog
        open={open}
        record={record}
        onCancel={() => setOpen(false)}
        onBound={(next) => {
          setOpen(false);
          onChanged(next, 'Route bound to this case.');
        }}
        onConflict={() => {
          setOpen(false);
          onConflict();
        }}
      />
    </Section>
  );
}

function RouteBindingDialog({
  open,
  record,
  onCancel,
  onBound,
  onConflict,
}: {
  open: boolean;
  record: Versioned<CaseRecord>;
  onCancel: () => void;
  onBound: (next: Versioned<CaseRecord>) => void;
  onConflict: () => void;
}) {
  const api = useDirectoryApi();
  const write = useWrite();
  const intent = useIntentKey();
  const item = record.data;
  const [routeId, setRouteId] = useState('');
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (open) {
      setRouteId('');
      setReason('');
      setProblems({});
      setError(null);
    }
  }, [open]);
  const [routes] = useLoad(
    `case-route-options:${open ? 'open' : 'closed'}:${item.id}:${item.agencyId}`,
    async () =>
      open ? (await api.routes.list({ agencyId: item.agencyId, limit: 100 })).items : [],
  );
  const options = routes.status === 'ready' ? routes.value : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (routeId === '') found['routeId'] = 'Choose the route this case uses.';
    if (reason.trim() === '') found['reason'] = 'Enter a reason. It is kept in the audit trail.';
    setProblems(found);
    const first = Object.keys(found)[0];
    if (first !== undefined) {
      document.getElementById(`case-route-${first}`)?.focus();
      return;
    }
    const body = { routeId, reason };
    setPending(true);
    setError(null);
    try {
      const next = await write(intent.keyFor({ id: item.id, etag: record.etag, body }), (auth) =>
        api.cases.bindRoute(item.id, body, record.etag, auth),
      );
      intent.done();
      onBound(next);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 412) onConflict();
      else setError(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={item.routeId === null ? 'Bind a route' : 'Correct the route binding'}
      busy={pending}
      onCancel={onCancel}
      description={
        <p>
          Choose one route of this case’s agency. {ROUTE_BINDING_MEANING} Nothing is chosen from
          matching names.
        </p>
      }
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="dialog-form">
        {routes.status === 'loading' && <p className="notice notice-quiet">Loading routes…</p>}
        {routes.status === 'error' && <ErrorNotice error={routes.error} recordLabel="route" />}
        {/* The dialog's first focus: the route options are loaded after it opens. */}
        <fieldset
          className="fieldset choice-list"
          aria-describedby="case-route-hint"
          tabIndex={-1}
          data-autofocus
        >
          <legend>Route of this case’s agency</legend>
          <p id="case-route-hint" className="hint">
            Only a linked, unarchived route can be bound. {ROUTE_CORRECTION}
          </p>
          {routes.status === 'ready' && options.length === 0 && (
            <p className="absent">
              This agency has no route yet.{' '}
              <Link to={`/representation/routes/new?agencyId=${item.agencyId}`}>
                Create a route
              </Link>{' '}
              first.
            </p>
          )}
          {options.map((option, index) => {
            const unavailable = routeUnavailable(option);
            const current = option.id === item.routeId;
            return (
              <label
                key={option.id}
                className={`choice${unavailable || current ? ' choice-disabled' : ''}`}
              >
                <input
                  type="radio"
                  name="case-route"
                  id={index === 0 ? 'case-route-routeId' : undefined}
                  value={option.id}
                  checked={routeId === option.id}
                  disabled={unavailable !== null || current}
                  onChange={() => setRouteId(option.id)}
                />
                <span className="choice-text">
                  <span className="choice-title">
                    <RecordName kind="route" id={option.id} plain />
                  </span>
                  <span className="choice-meta">
                    {current
                      ? 'The route this case is bound to now'
                      : unavailable === null
                        ? 'Linked'
                        : `Not available: ${unavailable}`}
                  </span>
                </span>
              </label>
            );
          })}
          {problems['routeId'] && <p className="field-error">{problems['routeId']}</p>}
        </fieldset>
        <TextField
          id="case-route-reason"
          label="Reason"
          required
          multiline
          hint="Kept in the audit trail."
          value={reason}
          error={problems['reason']}
          onChange={setReason}
        />
        {error !== null && <ErrorNotice error={error} recordLabel="case" />}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={pending}>
            {pending ? 'Binding…' : 'Bind route'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function CaseCanonicalSection({
  record,
  target,
  onChanged,
  onConflict,
}: {
  record: Versioned<CaseRecord>;
  target: SourceTarget | null;
  onChanged: (next: Versioned<CaseRecord>, message: string) => void;
  onConflict: () => void;
}) {
  const api = useDirectoryApi();
  const [open, setOpen] = useState(false);
  const item = record.data;
  const archived = item.archivedAt !== null;
  const bound = item.canonicalCaseId !== null || item.canonicalBindingSourceId !== null;
  return (
    <Section title="Canonical case id">
      <p className="hint">{CANONICAL_CASE_MEANING}</p>
      {bound ? (
        <>
          <Details
            rows={[
              ['Canonical case id', item.canonicalCaseId],
              [
                'Source',
                item.canonicalBindingSourceId === null ? null : (
                  <SourceCitation sourceId={item.canonicalBindingSourceId} />
                ),
              ],
            ]}
          />
          <p className="hint">
            A binding is not replaced here: correcting it needs a reconciliation workflow that isn’t
            available yet.
          </p>
        </>
      ) : (
        <>
          <p className="absent">No canonical case id: this case is local only.</p>
          {archived ? (
            <UnavailableAction
              label="Bind canonical source"
              reason="Archived cases are read-only. Restore the case first."
            />
          ) : target === null ? (
            <UnavailableAction label="Bind canonical source" reason="Loading the case’s scope…" />
          ) : (
            <button type="button" onClick={() => setOpen(true)}>
              Bind canonical source
            </button>
          )}
        </>
      )}
      {target !== null && (
        <BindDialog
          open={open}
          noun="case"
          record={record}
          target={target}
          bind={(body: CanonicalBindingRequest, ifMatch, auth) =>
            api.cases.bindCanonical(item.id, body, ifMatch, auth)
          }
          onCancel={() => setOpen(false)}
          onBound={(next) => {
            setOpen(false);
            onChanged(next, 'Canonical case id bound.');
          }}
          onConflict={() => {
            setOpen(false);
            onConflict();
          }}
        />
      )}
    </Section>
  );
}

// forms -----------------------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  agencyId: 'Agency',
  intakeLabel: 'Intake label',
  caseClass: 'Case class',
  ownerHintId: 'Owner hint',
  routeId: 'Route',
  packetSourceId: 'Packet source',
  driveFolderUrl: 'Drive folder',
  notes: 'Notes',
};

export function NewCasePage() {
  const api = useDirectoryApi();
  const lookup = useLookup();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const submission = useSubmission();
  const [agencyId, setAgencyId] = useState(params.get('agencyId') ?? '');
  const [intakeLabel, setIntakeLabel] = useState('');
  const [caseClass, setCaseClass] = useState<CaseClass>('WORKING_INTAKE');
  const [ownerHintId, setOwnerHintId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [notes, setNotes] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [agencies] = useLoad('case-form:agencies', () => api.agencies.list({ limit: 100 }));
  const [owners] = useLoad('case-form:owners', () => api.owners.list({ limit: 100 }));
  const [routes] = useLoad(`case-form:routes:${agencyId}`, async () => {
    if (agencyId === '') return [];
    const page = await api.routes.list({ agencyId, limit: 100 });
    return Promise.all(
      page.items.map(async (route) => {
        const name = await lookup.get('route', route.id);
        return { route, name: 'name' in name ? name.name : 'Route not available' };
      }),
    );
  });
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  const agencyItems = (agencies.status === 'ready' ? agencies.value.items : []).filter(
    (agency) => agency.recordState !== 'ARCHIVED',
  );
  const ownerItems = (owners.status === 'ready' ? owners.value.items : []).filter(
    (owner) => owner.recordState !== 'ARCHIVED',
  );
  const routeItems = routes.status === 'ready' ? routes.value : [];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (agencyId === '') problems['agencyId'] = 'Choose the agency this case belongs to.';
    if (intakeLabel.trim() === '') problems['intakeLabel'] = 'Enter an intake label.';
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(`case-${first}`)?.focus();
      return;
    }
    const body: CreateCase = {
      agencyId,
      intakeLabel: intakeLabel.trim(),
      caseClass,
      ...(ownerHintId === '' ? {} : { ownerHintId }),
      ...(routeId === '' ? {} : { routeId }),
      ...(notes.trim() === '' ? {} : { notes }),
    };
    const outcome = await submission.submit(body, (auth) => api.cases.create(body, auth));
    if (outcome.ok) {
      void navigate(`/cases/${outcome.value.data.id}`, {
        state: { flash: 'Case created.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          ['New case', null],
        ]}
      />
      <h1>New case</h1>
      <p className="page-intro">
        Enter only what you know; nothing is filled in for you. {CASE_BOUNDARY}
      </p>
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
        fieldId={(path) => fieldIdFor('case', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="case" focusOnShow />
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Case</legend>
          <SelectField
            id="case-agencyId"
            label="Agency"
            required
            hint="The agency is fixed once the case exists."
            value={agencyId}
            placeholder="Choose an agency"
            options={agencyItems.map((agency) => ({ value: agency.id, label: agency.displayName }))}
            error={errorFor('agencyId')}
            onChange={(value) => {
              setAgencyId(value);
              setRouteId('');
            }}
          />
          <TextField
            id="case-intakeLabel"
            label="Intake label"
            required
            hint="A working label for this case. It identifies nothing by itself."
            value={intakeLabel}
            error={errorFor('intakeLabel')}
            onChange={setIntakeLabel}
          />
          <SelectField
            id="case-caseClass"
            label="Case class"
            hint="Administrative classification; fixed once the case exists."
            value={caseClass}
            options={(Object.keys(CASE_CLASS_LABEL) as CaseClass[]).map((value) => ({
              value,
              label: CASE_CLASS_LABEL[value],
            }))}
            error={errorFor('caseClass')}
            onChange={(value) => setCaseClass(value as CaseClass)}
          />
          <p className="hint">Platform: {PLATFORM_LABEL.YOUTUBE}.</p>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Owner hint and route (optional)</legend>
          <SelectField
            id="case-ownerHintId"
            label="Owner hint"
            hint={OWNER_HINT_MEANING}
            value={ownerHintId}
            options={[
              { value: '', label: 'No owner hint' },
              ...ownerItems.map((owner) => ({ value: owner.id, label: owner.displayName })),
            ]}
            error={errorFor('ownerHintId')}
            onChange={setOwnerHintId}
          />
          <SelectField
            id="case-routeId"
            label="Route"
            hint={`Optional; a route can be bound later. ${ROUTE_BINDING_MEANING}`}
            value={routeId}
            options={[
              { value: '', label: agencyId === '' ? 'Choose the agency first' : 'No route yet' },
              ...routeItems.map(({ route, name }) => {
                const unavailable = routeUnavailable(route);
                return {
                  value: route.id,
                  label: `${name}${unavailable ? ` (not available: ${unavailable})` : ''}`,
                  disabled: unavailable !== null,
                };
              }),
            ]}
            error={errorFor('routeId')}
            onChange={setRouteId}
          />
        </fieldset>
        <TextField
          id="case-notes"
          label="Notes"
          multiline
          value={notes}
          error={errorFor('notes')}
          onChange={setNotes}
        />
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Creating…' : 'Create case'}
          </button>
          <Link to="/cases">Cancel</Link>
        </div>
      </form>
    </article>
  );
}

export function EditCasePage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`case-edit:${id}`, () => api.cases.get(id));
  if (state.status === 'loading') return <LoadingNotice label="Loading case…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="case" onRetry={reload} />;
  }
  return <CaseEditForm key={`${id}:${state.value.etag}`} record={state.value} onReload={reload} />;
}

function CaseEditForm({
  record,
  onReload,
}: {
  record: Versioned<CaseRecord>;
  onReload: () => void;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const item = record.data;
  const [intakeLabel, setIntakeLabel] = useState(item.intakeLabel);
  const [ownerHintId, setOwnerHintId] = useState(item.ownerHintId ?? '');
  const [packetSourceId, setPacketSourceId] = useState(item.packetSourceId ?? '');
  const [driveFolderUrl, setDriveFolderUrl] = useState(textOf(item.driveFolderUrl));
  const [notes, setNotes] = useState(textOf(item.notes));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [owners] = useLoad('case-edit:owners', () => api.owners.list({ limit: 100 }));
  const target = useCaseTarget(item);
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  const ownerItems = (owners.status === 'ready' ? owners.value.items : []).filter(
    (owner) => owner.recordState !== 'ARCHIVED' || owner.id === item.ownerHintId,
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (intakeLabel.trim() === '') problems['intakeLabel'] = 'Enter an intake label.';
    setClientErrors(problems);
    if (Object.keys(problems).length > 0) {
      document.getElementById('case-intakeLabel')?.focus();
      return;
    }
    const nextNotes = notes.trim() === '' ? null : notes;
    const nextFolder = driveFolderUrl.trim() === '' ? null : driveFolderUrl.trim();
    const body: PatchCase = {
      ...(intakeLabel.trim() === item.intakeLabel ? {} : { intakeLabel: intakeLabel.trim() }),
      ...((ownerHintId || null) === item.ownerHintId ? {} : { ownerHintId: ownerHintId || null }),
      ...((packetSourceId || null) === item.packetSourceId
        ? {}
        : { packetSourceId: packetSourceId || null }),
      ...(nextFolder === item.driveFolderUrl ? {} : { driveFolderUrl: nextFolder }),
      ...(nextNotes === item.notes ? {} : { notes: nextNotes }),
    };
    if (Object.keys(body).length === 0) {
      setClientErrors({ intakeLabel: 'Change at least one field before saving.' });
      return;
    }
    const outcome = await submission.submit({ id: item.id, etag: record.etag, body }, (auth) =>
      api.cases.patch(item.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/cases/${item.id}`, {
        state: { flash: 'Case updated.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          [item.intakeLabel, `/cases/${item.id}`],
          ['Edit', null],
        ]}
      />
      <h1>Edit case</h1>
      <p className="page-intro">
        The agency, platform, case class, route, canonical id, workflow state and authority
        selection change only through their own actions on the case page.
      </p>
      {submission.conflict && <ConflictNotice recordLabel="case" onReload={onReload} />}
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
        fieldId={(path) => fieldIdFor('case', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="case" focusOnShow />
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <TextField
          id="case-intakeLabel"
          label="Intake label"
          required
          value={intakeLabel}
          error={errorFor('intakeLabel')}
          onChange={setIntakeLabel}
        />
        <SelectField
          id="case-ownerHintId"
          label="Owner hint"
          hint={OWNER_HINT_MEANING}
          value={ownerHintId}
          options={[
            { value: '', label: 'No owner hint' },
            ...ownerItems.map((owner) => ({ value: owner.id, label: owner.displayName })),
          ]}
          error={errorFor('ownerHintId')}
          onChange={setOwnerHintId}
        />
        <SourceSelect
          id="case-packetSourceId"
          label="Packet source"
          hint="The source that holds this case’s working packet, if any. Only sources whose recorded scope includes this case are offered."
          target={target.status === 'ready' ? target.value : null}
          value={packetSourceId}
          onChange={setPacketSourceId}
          error={errorFor('packetSourceId')}
        />
        <TextField
          id="case-driveFolderUrl"
          label="Drive folder"
          type="url"
          hint="Full address of the case folder. It is stored as a pointer and never opened."
          value={driveFolderUrl}
          error={errorFor('driveFolderUrl')}
          onChange={setDriveFolderUrl}
        />
        <TextField
          id="case-notes"
          label="Notes"
          multiline
          value={notes}
          error={errorFor('notes')}
          onChange={setNotes}
        />
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Saving…' : 'Save changes'}
          </button>
          <Link to={`/cases/${item.id}`}>Cancel</Link>
        </div>
      </form>
    </article>
  );
}
