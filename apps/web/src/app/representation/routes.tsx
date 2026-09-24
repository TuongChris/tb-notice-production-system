// Route pages (P3A; preferred coverage P3B). A route is the operational path Agency + owner–subject
// link + platform. It is a relationship record: creating, pausing, unlinking, relinking or binding
// it establishes no mandate, coverage, copyright ownership, representation authority or signer
// eligibility, and it is never shown as authorized, ready or eligible. The path (agency, link,
// platform) never changes; a different path is a different route. Nothing is inferred: the agency,
// owner and exact legal subject link are chosen explicitly. A preferred coverage — a frozen
// coverage of this exact route — is an operational default only; case authority is determined
// later.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { CreateRoute, LinkStateRequest, OwnerSubject, PatchRoute, Route } from '@tb/contracts';
import { ApiError } from '../api/client.js';
import type { Versioned } from '../api/directory.js';
import { Absent, RecordFacts, Time } from '../directory/agencies.js';
import { CanonicalBindingSection, isBound } from '../directory/canonical-binding.js';
import { fieldIdFor, SelectField, TextField, text as textOf } from '../directory/fields.js';
import {
  BINDING_STATE_LABEL,
  issuesOf,
  LINK_STATE_LABEL,
  LINK_STATE_TONE,
  PLATFORM_LABEL,
} from '../directory/format.js';
import { PREFERRED_COVERAGE_MEANING } from './authority-ui.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { DirectoryList } from '../directory/list.js';
import { RecordName, useLookup } from '../directory/lookup.js';
import { useRecordOperation } from '../directory/record-actions.js';
import { useRecordPage, useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConfirmDialog,
  ConflictNotice,
  Details,
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

type LinkState = Route['linkState'];

const BOUNDARY =
  'An operational path only: it creates no mandate, coverage, authority or signer eligibility.';
const NEW_ROUTE_COVERAGE =
  'A new route has no coverage yet. A preferred coverage can be chosen once a frozen coverage names this route.';

export function RouteListPage() {
  const api = useDirectoryApi();
  const [params, setParams] = useSearchParams();
  const agencyId = params.get('agencyId') ?? '';
  const [agencies] = useLoad('routes:agency-filter', () => api.agencies.list({ limit: 100 }));
  const agencyItems = agencies.status === 'ready' ? agencies.value.items : [];
  function setAgency(value: string) {
    const next = new URLSearchParams(params);
    if (value === '') next.delete('agencyId');
    else next.set('agencyId', value);
    setParams(next);
  }
  return (
    <DirectoryList<Route>
      title="Routes"
      noun="routes"
      intro="Operational paths from an agency to an owner’s exact legal subject on a platform. A route is a relationship record, not authority."
      searchLabel="Search owner, subject, agency, prefix or code"
      newLabel="New route"
      newTo="/representation/routes/new"
      filterKey={agencyId}
      filters={
        <label className="list-filter">
          Agency
          <select value={agencyId} onChange={(event) => setAgency(event.target.value)}>
            <option value="">All agencies</option>
            {agencyItems.map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.displayName}
              </option>
            ))}
          </select>
        </label>
      }
      load={(query) => api.routes.list({ ...query, ...(agencyId ? { agencyId } : {}) })}
      emptyText={
        agencyId ? (
          <p>
            No routes for this agency.{' '}
            <button type="button" className="button-link" onClick={() => setAgency('')}>
              Show all agencies
            </button>
          </p>
        ) : (
          <p>
            No routes yet. <Link to="/representation/routes/new">Create the first route</Link>.
          </p>
        )
      }
      columns={[
        {
          header: 'Owner · legal subject',
          cell: (route) => (
            <Link to={`/representation/routes/${route.id}`}>
              <RecordName kind="ownerSubject" id={route.ownerSubjectId} plain />
            </Link>
          ),
        },
        { header: 'Agency', cell: (route) => <RecordName kind="agency" id={route.agencyId} /> },
        { header: 'Platform', cell: (route) => PLATFORM_LABEL[route.platform] },
        {
          header: 'Link',
          cell: (route) => (
            <span className="stamps">
              <StateStamp
                label={LINK_STATE_LABEL[route.linkState]}
                tone={LINK_STATE_TONE[route.linkState]}
              />
              {route.archivedAt !== null && <StateStamp label="Archived" tone="archived" />}
            </span>
          ),
        },
        {
          header: 'Canonical code',
          cell: (route) => route.canonicalCode ?? BINDING_STATE_LABEL[route.bindingState],
        },
        { header: 'Updated', cell: (route) => <Time iso={route.updatedAt} /> },
      ]}
    />
  );
}

/** The route's path as a small diagram: agency — platform — owner · legal subject. */
function RoutePath({ route, link }: { route: Route; link: OwnerSubject | null }) {
  return (
    <div className="route-path" role="group" aria-label="Route path">
      <div className="route-node">
        <span className="route-node-kind">Agency</span>
        <RecordName kind="agency" id={route.agencyId} />
      </div>
      <div className="route-edge" aria-hidden="true">
        <span>{PLATFORM_LABEL[route.platform]}</span>
      </div>
      <div className="route-node">
        <span className="route-node-kind">Owner</span>
        {link === null ? <Absent /> : <RecordName kind="owner" id={link.ownerId} />}
      </div>
      <div className="route-node">
        <span className="route-node-kind">Legal subject</span>
        {link === null ? <Absent /> : <RecordName kind="legalSubject" id={link.legalSubjectId} />}
      </div>
      <p className="visually-hidden">Platform: {PLATFORM_LABEL[route.platform]}.</p>
    </div>
  );
}

export function RouteDetailPage() {
  const { id = '' } = useParams();
  return <RouteDetail key={id} id={id} />;
}

function RouteDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const page = useRecordPage(`route:${id}`, () => api.routes.get(id));
  const ownerSubjectId = page.state.status === 'ready' ? page.state.value.data.ownerSubjectId : '';
  const [link] = useLoad(`route-link:${ownerSubjectId}`, async () =>
    ownerSubjectId === '' ? null : (await api.ownerSubjects.get(ownerSubjectId)).data,
  );
  const trail = [
    ['Representation', '/representation'],
    ['Routes', '/representation/routes'],
  ] as const;
  if (page.state.status === 'loading') return <LoadingNotice label="Loading route…" />;
  if (page.state.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Route', null]]} />
        <ErrorNotice error={page.state.error} recordLabel="route" onRetry={page.reload} />
      </>
    );
  }
  const record = page.state.value;
  const route = record.data;
  const association = link.status === 'ready' ? link.value : null;
  const archived = route.archivedAt !== null;
  return (
    <article className="sheet" data-testid="route-detail">
      <Breadcrumbs trail={[...trail, ['Route', null]]} />
      <RecordHeader
        name={`Route on ${PLATFORM_LABEL[route.platform]}`}
        stamp={
          <span className="stamps">
            <StateStamp
              label={LINK_STATE_LABEL[route.linkState]}
              tone={LINK_STATE_TONE[route.linkState]}
            />
            {archived && <StateStamp label="Archived" tone="archived" />}
          </span>
        }
        facts={[
          `Version ${route.rowVersion}`,
          route.canonicalCode === null
            ? 'No canonical code (local only)'
            : `Canonical code ${route.canonicalCode}`,
        ]}
        boundary={BOUNDARY}
      />
      <RoutePath route={route} link={association} />
      {page.conflict && <ConflictNotice recordLabel="route" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      <RouteActions
        record={record}
        onChanged={page.update}
        onConflict={page.raiseConflict}
        onDeleted={() =>
          void navigate('/representation/routes', {
            state: { flash: 'Unused route deleted.' } satisfies FlashState,
          })
        }
      />
      {archived && (
        <p className="notice notice-quiet">
          Archived <Time iso={route.archivedAt} />. Reason: {route.archiveReason}
        </p>
      )}
      <div className="sheet-columns">
        <Section title="Relationship">
          <Details
            rows={[
              ['Agency', <RecordName kind="agency" id={route.agencyId} />],
              [
                'Owner–subject link',
                association === null ? null : (
                  <>
                    <Link to={`/directory/owner-subjects/${association.id}`}>
                      <RecordName kind="ownerSubject" id={association.id} plain />
                    </Link>{' '}
                    <StateStamp
                      label={LINK_STATE_LABEL[association.linkState]}
                      tone={LINK_STATE_TONE[association.linkState]}
                    />
                  </>
                ),
              ],
              ['Platform', PLATFORM_LABEL[route.platform]],
            ]}
          />
          <p className="hint">The path never changes; a different path is a different route.</p>
        </Section>
        <Section title="Defaults">
          <Details
            rows={[
              [
                'Default signer',
                route.defaultSignerId === null ? null : (
                  <RecordName kind="signer" id={route.defaultSignerId} />
                ),
              ],
              [
                'Preferred coverage',
                route.preferredCoverageId === null ? (
                  <span className="absent">No preferred coverage</span>
                ) : (
                  <RecordName kind="coverage" id={route.preferredCoverageId} />
                ),
              ],
            ]}
          />
          <p className="hint">
            A default signer is a suggestion for future selections only; it confers nothing.{' '}
            {PREFERRED_COVERAGE_MEANING}
          </p>
        </Section>
      </div>
      <Section title="Details">
        <Details
          rows={[
            ['Case prefix hint', route.casePrefixHint],
            ['Last state reason', route.stateReason],
            ['Unlinked', route.unlinkedAt && <Time iso={route.unlinkedAt} />],
          ]}
        />
      </Section>
      {association !== null && (
        <CanonicalBindingSection
          noun="route"
          record={record}
          archived={archived}
          target={{
            kind: 'Route',
            agencyId: route.agencyId,
            legalSubjectId: association.legalSubjectId,
          }}
          bind={(body, ifMatch, auth) => api.routes.bindCanonical(route.id, body, ifMatch, auth)}
          onBound={page.update}
          onConflict={page.raiseConflict}
        />
      )}
      <Section title="Notes">
        {route.notes ? <p className="prose">{route.notes}</p> : <Absent />}
      </Section>
      <RecordFacts record={route} />
    </article>
  );
}

function RouteActions({
  record,
  onChanged,
  onConflict,
  onDeleted,
}: {
  record: Versioned<Route>;
  onChanged: (next: Versioned<Route>, message: string) => void;
  onConflict: () => void;
  onDeleted: () => void;
}) {
  const api = useDirectoryApi();
  const operation = useRecordOperation(record, onConflict);
  const route = record.data;
  const archived = route.archivedAt !== null;
  const others = (Object.keys(LINK_STATE_LABEL) as LinkState[]).filter(
    (state) => state !== route.linkState,
  );
  const [nextState, setNextState] = useState<LinkState>(others[0] ?? 'PAUSED');
  const deleteBlocker = archived
    ? 'Archived routes are kept for history and are not deleted.'
    : isBound(route)
      ? 'This route has a canonical binding, so it is not an unused route.'
      : null;
  return (
    <div className="record-actions" role="group" aria-label="Actions for this route">
      {!archived && (
        <Link className="button" to={`/representation/routes/${route.id}/edit`}>
          Edit
        </Link>
      )}
      {!archived && (
        <button
          type="button"
          onClick={() => {
            setNextState(others[0] ?? 'PAUSED');
            operation.show('link-state');
          }}
        >
          Change link state
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
          Delete unused route
        </button>
      ) : (
        <UnavailableAction label="Delete unused route" reason={deleteBlocker} />
      )}

      <ReasonDialog
        open={operation.open === 'link-state'}
        title="Change link state"
        description={
          <p>
            A link state is administrative. Pausing or unlinking keeps the route and its history and
            revokes nothing; returning to linked needs a linked owner–subject link and no archived
            agency, owner or subject. No state grants authority.
          </p>
        }
        confirmLabel="Change link state"
        recordLabel="route"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) => {
          const body: LinkStateRequest = { state: nextState, reason };
          void operation.run(
            'link-state',
            body,
            (auth) => api.routes.setLinkState(route.id, body, record.etag, auth),
            (next) => onChanged(next, `Link state changed to ${LINK_STATE_LABEL[nextState]}.`),
          );
        }}
      >
        <SelectField
          id="route-next-state"
          label="New link state"
          value={nextState}
          options={others.map((state) => ({ value: state, label: LINK_STATE_LABEL[state] }))}
          onChange={(value) => setNextState(value as LinkState)}
        />
      </ReasonDialog>
      <ReasonDialog
        open={operation.open === 'archive'}
        title="Archive this route"
        description={
          <p>
            Archiving keeps the route and its history but makes it read-only. Its link state is
            kept; nothing is revoked or sent.
          </p>
        }
        confirmLabel="Archive"
        recordLabel="route"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'archive',
            { reason },
            (auth) => api.routes.archive(route.id, { reason }, record.etag, auth),
            (next) => onChanged(next, 'Archived.'),
          )
        }
      />
      <ReasonDialog
        open={operation.open === 'restore'}
        title="Restore this route"
        description={
          <p>
            The route becomes editable again with its link state unchanged. It is not restored while
            its agency, owner or subject is archived.
          </p>
        }
        confirmLabel="Restore"
        recordLabel="route"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'restore',
            { reason },
            (auth) => api.routes.restore(route.id, { reason }, record.etag, auth),
            (next) => onChanged(next, 'Restored.'),
          )
        }
      />
      <ConfirmDialog
        open={operation.open === 'delete'}
        title="Delete this unused route?"
        description={
          <p>
            Only a route that nothing uses can be deleted, and deletion can’t be undone. If anything
            refers to it, the server refuses and you can archive it instead.
          </p>
        }
        confirmLabel="Delete route"
        recordLabel="route"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={() =>
          void operation.run(
            'delete',
            null,
            (auth) => api.routes.remove(route.id, record.etag, auth),
            () => onDeleted(),
          )
        }
      />
    </div>
  );
}

export function NewRoutePage() {
  return <RouteCreateForm />;
}

const LABELS: Record<string, string> = {
  agencyId: 'Agency',
  ownerSubjectId: 'Legal subject link',
  defaultSignerId: 'Default signer',
  preferredCoverageId: 'Preferred coverage',
  casePrefixHint: 'Case prefix hint',
  notes: 'Notes',
};

function RouteCreateForm() {
  const api = useDirectoryApi();
  const lookup = useLookup();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const submission = useSubmission();
  const [agencyId, setAgencyId] = useState(params.get('agencyId') ?? '');
  const [ownerId, setOwnerId] = useState(params.get('ownerId') ?? '');
  const [ownerSubjectId, setOwnerSubjectId] = useState(params.get('ownerSubjectId') ?? '');
  const [defaultSignerId, setDefaultSignerId] = useState('');
  const [casePrefixHint, setCasePrefixHint] = useState('');
  const [notes, setNotes] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [agencies] = useLoad('route-form:agencies', () => api.agencies.list({ limit: 100 }));
  const [owners] = useLoad('route-form:owners', () => api.owners.list({ limit: 100 }));
  const [links] = useLoad(`route-form:links:${ownerId}`, async () => {
    if (ownerId === '') return [];
    const page = await api.ownerSubjects.list(ownerId, { limit: 100 });
    return Promise.all(
      page.items.map(async (item) => {
        const name = await lookup.get('legalSubject', item.legalSubjectId);
        return { item, name: 'name' in name ? name.name : 'Legal subject not available' };
      }),
    );
  });
  const [signers] = useLoad(`route-form:signers:${agencyId}`, async () =>
    agencyId === '' ? [] : (await api.signers.list({ agencyId, limit: 100 })).items,
  );
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  const agencyItems = (agencies.status === 'ready' ? agencies.value.items : []).filter(
    (agency) => agency.recordState !== 'ARCHIVED',
  );
  const ownerItems = (owners.status === 'ready' ? owners.value.items : []).filter(
    (owner) => owner.recordState !== 'ARCHIVED',
  );
  const linkItems = links.status === 'ready' ? links.value : [];
  const signerItems = (signers.status === 'ready' ? signers.value : []).filter(
    (signer) => signer.archivedAt === null && signer.operationalState !== 'ENDED',
  );
  const duplicate =
    submission.error instanceof ApiError && submission.error.code === 'DUPLICATE_ROUTE'
      ? submission.error.details['routeId']
      : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (agencyId === '') problems['agencyId'] = 'Choose the agency.';
    if (ownerSubjectId === '') problems['ownerSubjectId'] = 'Choose the exact legal subject link.';
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(`route-${first}`)?.focus();
      return;
    }
    const body: CreateRoute = {
      agencyId,
      ownerSubjectId,
      platform: 'YOUTUBE',
      ...(defaultSignerId === '' ? {} : { defaultSignerId }),
      ...(casePrefixHint.trim() === '' ? {} : { casePrefixHint: casePrefixHint.trim() }),
      ...(notes.trim() === '' ? {} : { notes }),
    };
    const outcome = await submission.submit(body, (auth) => api.routes.create(body, auth));
    if (outcome.ok) {
      void navigate(`/representation/routes/${outcome.value.data.id}`, {
        state: { flash: 'Route created (linked).' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Representation', '/representation'],
          ['Routes', '/representation/routes'],
          ['New route', null],
        ]}
      />
      <h1>New route</h1>
      <p className="page-intro">
        Choose the agency, the owner and the exact legal subject link explicitly — nothing is
        matched from names. {BOUNDARY}
      </p>
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path] ?? path}
        fieldId={(path) => fieldIdFor('route', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="route" focusOnShow />
      )}
      {typeof duplicate === 'string' && (
        <p className="notice notice-quiet">
          <Link to={`/representation/routes/${duplicate}`}>Open the existing route</Link>
        </p>
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Path</legend>
          <SelectField
            id="route-agencyId"
            label="Agency"
            required
            value={agencyId}
            placeholder="Choose an agency"
            options={agencyItems.map((agency) => ({ value: agency.id, label: agency.displayName }))}
            error={errorFor('agencyId')}
            onChange={(value) => {
              setAgencyId(value);
              setDefaultSignerId('');
            }}
          />
          <SelectField
            id="route-ownerId"
            label="Owner"
            required
            value={ownerId}
            placeholder="Choose an owner"
            options={ownerItems.map((owner) => ({ value: owner.id, label: owner.displayName }))}
            onChange={(value) => {
              setOwnerId(value);
              setOwnerSubjectId('');
            }}
          />
          <SelectField
            id="route-ownerSubjectId"
            label="Legal subject link"
            required
            hint="Only linked owner–subject links can start a route. Links are managed on the owner’s page."
            value={ownerSubjectId}
            placeholder={
              ownerId === '' ? 'Choose an owner first' : 'Choose the exact legal subject'
            }
            options={linkItems.map(({ item, name }) => ({
              value: item.id,
              label:
                item.linkState === 'LINKED'
                  ? name
                  : `${name} (${LINK_STATE_LABEL[item.linkState].toLowerCase()})`,
              disabled: item.linkState !== 'LINKED',
            }))}
            error={errorFor('ownerSubjectId')}
            onChange={setOwnerSubjectId}
          />
          <p className="field-static">
            <span className="field-static-label">Platform</span> YouTube
            <span className="hint"> The only platform in this release.</span>
          </p>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Defaults</legend>
          <SelectField
            id="route-defaultSignerId"
            label="Default signer"
            hint="Optional. A suggestion for future selections only — it confers no authority. Only signers of the chosen agency that are neither archived nor ended are offered."
            value={defaultSignerId}
            options={[
              { value: '', label: 'No default signer' },
              ...signerItems.map((signer) => ({ value: signer.id, label: signer.fullLegalName })),
            ]}
            error={errorFor('defaultSignerId')}
            onChange={setDefaultSignerId}
          />
          <p className="field-static">
            <span className="field-static-label">Preferred coverage</span>{' '}
            <span className="hint">{NEW_ROUTE_COVERAGE}</span>
          </p>
          <TextField
            id="route-casePrefixHint"
            label="Case prefix hint"
            hint="A hint only; the app never allocates case numbers."
            value={casePrefixHint}
            error={errorFor('casePrefixHint')}
            onChange={setCasePrefixHint}
          />
          <TextField
            id="route-notes"
            label="Notes"
            multiline
            value={notes}
            error={errorFor('notes')}
            onChange={setNotes}
          />
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Saving…' : 'Create route'}
          </button>
          <Link to="/representation/routes">Cancel</Link>
        </div>
      </form>
    </article>
  );
}

export function EditRoutePage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`route-edit:${id}`, () => api.routes.get(id));
  if (state.status === 'loading') return <LoadingNotice label="Loading route…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="route" onRetry={reload} />;
  }
  return <RoutePatchForm key={state.value.etag} record={state.value} onReload={reload} />;
}

function RoutePatchForm({ record, onReload }: { record: Versioned<Route>; onReload: () => void }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const route = record.data;
  const [defaultSignerId, setDefaultSignerId] = useState(route.defaultSignerId ?? '');
  const [preferredCoverageId, setPreferredCoverageId] = useState(route.preferredCoverageId ?? '');
  const [casePrefixHint, setCasePrefixHint] = useState(textOf(route.casePrefixHint));
  const [notes, setNotes] = useState(textOf(route.notes));
  const [nothingToSave, setNothingToSave] = useState(false);
  const [signers] = useLoad(
    `route-edit:signers:${route.agencyId}`,
    async () => (await api.signers.list({ agencyId: route.agencyId, limit: 100 })).items,
  );
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) => issues.find((issue) => issue.path === path)?.message;
  const eligible = (signers.status === 'ready' ? signers.value : []).filter(
    (signer) => signer.archivedAt === null && signer.operationalState !== 'ENDED',
  );
  const currentMissing =
    route.defaultSignerId !== null && !eligible.some((s) => s.id === route.defaultSignerId);
  // Frozen coverage of exactly this route in unarchived mandates of the route's agency.
  const [coverages] = useLoad(`route-edit:coverages:${route.id}`, async () => {
    const mandates = (
      await api.mandates.list({ agencyId: route.agencyId, limit: 100 })
    ).items.filter((mandate) => mandate.archivedAt === null);
    const lists = await Promise.all(
      mandates.map(async (mandate) => {
        const frozen = (await api.versions.list(mandate.id, { limit: 100 })).items.filter(
          (version) => version.versionState === 'FROZEN',
        );
        const inner = await Promise.all(
          frozen.map(async (version) =>
            (await api.coverages.list(version.id, { q: route.id, limit: 100 })).items
              .filter((coverage) => coverage.routeId === route.id)
              .map((coverage) => ({ coverage, mandate, version: version.version })),
          ),
        );
        return inner.flat();
      }),
    );
    return lists.flat();
  });
  const coverageItems = coverages.status === 'ready' ? coverages.value : [];
  const preferredMissing =
    route.preferredCoverageId !== null &&
    !coverageItems.some((item) => item.coverage.id === route.preferredCoverageId);
  const noCoverage =
    coverages.status === 'ready' &&
    coverageItems.length === 0 &&
    route.preferredCoverageId === null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNothingToSave(false);
    const body: PatchRoute = {};
    const signer = defaultSignerId === '' ? null : defaultSignerId;
    if (signer !== route.defaultSignerId) body.defaultSignerId = signer;
    const preferred = preferredCoverageId === '' ? null : preferredCoverageId;
    if (preferred !== route.preferredCoverageId) body.preferredCoverageId = preferred;
    const prefix = casePrefixHint.trim() === '' ? null : casePrefixHint.trim();
    if (prefix !== route.casePrefixHint) body.casePrefixHint = prefix;
    const noteValue = notes.trim() === '' ? null : notes;
    if (noteValue !== route.notes) body.notes = noteValue;
    if (Object.keys(body).length === 0) {
      setNothingToSave(true);
      return;
    }
    const outcome = await submission.submit({ id: route.id, body }, (auth) =>
      api.routes.patch(route.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/representation/routes/${route.id}`, {
        state: { flash: 'Changes saved.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Representation', '/representation'],
          ['Routes', '/representation/routes'],
          ['Route', `/representation/routes/${route.id}`],
          ['Edit', null],
        ]}
      />
      <h1>Edit route</h1>
      <p className="page-intro">
        Only changed fields are sent. The path — agency, owner–subject link and platform — never
        changes; a different path is a different route.
      </p>
      {submission.conflict && <ConflictNotice recordLabel="route" onReload={onReload} />}
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path] ?? path}
        fieldId={(path) => fieldIdFor('route', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="route" focusOnShow />
      )}
      {nothingToSave && (
        <p role="status" className="notice notice-quiet">
          Nothing to save: no field was changed.
        </p>
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Path (fixed)</legend>
          <Details
            rows={[
              ['Agency', <RecordName kind="agency" id={route.agencyId} />],
              [
                'Owner · legal subject',
                <RecordName kind="ownerSubject" id={route.ownerSubjectId} />,
              ],
              ['Platform', PLATFORM_LABEL[route.platform]],
            ]}
          />
        </fieldset>
        <fieldset className="fieldset">
          <legend>Defaults and details</legend>
          <SelectField
            id="route-defaultSignerId"
            label="Default signer"
            hint="A suggestion for future selections only. Signers that are archived or ended are not offered."
            value={defaultSignerId}
            options={[
              { value: '', label: 'No default signer' },
              ...(currentMissing && route.defaultSignerId !== null
                ? [
                    {
                      value: route.defaultSignerId,
                      label: 'Current default signer (archived or ended)',
                      disabled: true,
                    },
                  ]
                : []),
              ...eligible.map((signer) => ({ value: signer.id, label: signer.fullLegalName })),
            ]}
            error={errorFor('defaultSignerId')}
            onChange={setDefaultSignerId}
          />
          <SelectField
            id="route-preferredCoverageId"
            label="Preferred coverage"
            hint={`${PREFERRED_COVERAGE_MEANING} Only frozen coverage of this exact route, in a mandate of its agency that is not archived, is offered.`}
            locked={
              noCoverage
                ? 'No usable coverage names this route: only coverage of a frozen version, in a mandate that is not archived, can be preferred. Record and freeze a version with coverage for this route first.'
                : null
            }
            value={preferredCoverageId}
            options={[
              { value: '', label: 'No preferred coverage' },
              ...(preferredMissing && route.preferredCoverageId !== null
                ? [
                    {
                      value: route.preferredCoverageId,
                      label: 'Current preferred coverage (no longer offered)',
                      disabled: true,
                    },
                  ]
                : []),
              ...coverageItems.map(({ coverage, mandate, version }) => ({
                value: coverage.id,
                label: `${coverage.coverageLabel} — ${mandate.label}, version ${version}`,
              })),
            ]}
            error={errorFor('preferredCoverageId')}
            onChange={setPreferredCoverageId}
          />
          <TextField
            id="route-casePrefixHint"
            label="Case prefix hint"
            value={casePrefixHint}
            error={errorFor('casePrefixHint')}
            onChange={setCasePrefixHint}
          />
          <TextField
            id="route-notes"
            label="Notes"
            multiline
            value={notes}
            error={errorFor('notes')}
            onChange={setNotes}
          />
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Saving…' : 'Save changes'}
          </button>
          <Link to={`/representation/routes/${route.id}`}>Cancel</Link>
        </div>
      </form>
    </article>
  );
}

/** Routes of one owner–subject link (shown on the link's page). */
export function RoutesOfLink({ link }: { link: OwnerSubject }) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`link-routes:${link.id}`, () =>
    api.routes.list({ q: link.id, limit: 100 }),
  );
  const create = `/representation/routes/new?ownerId=${link.ownerId}&ownerSubjectId=${link.id}`;
  return (
    <Section
      title="Routes"
      actions={
        link.linkState === 'LINKED' ? (
          <Link className="button" to={create}>
            Create a route
          </Link>
        ) : undefined
      }
    >
      <p className="hint">
        Routes that use this link. A route is an operational path, not authority.
      </p>
      {state.status === 'loading' && <LoadingNotice label="Loading routes…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} onRetry={reload} />}
      {state.status === 'ready' &&
        (state.value.items.length === 0 ? (
          <p className="absent">No route uses this link.</p>
        ) : (
          <ul className="plain-list">
            {state.value.items.map((route) => (
              <li key={route.id}>
                <Link to={`/representation/routes/${route.id}`}>
                  <RecordName kind="agency" id={route.agencyId} plain /> ·{' '}
                  {PLATFORM_LABEL[route.platform]}
                </Link>{' '}
                <StateStamp
                  label={LINK_STATE_LABEL[route.linkState]}
                  tone={LINK_STATE_TONE[route.linkState]}
                />
              </li>
            ))}
          </ul>
        ))}
    </Section>
  );
}
