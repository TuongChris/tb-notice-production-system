// One Owner ↔ LegalSubject link. The link is a recorded relationship: linking is not appointment
// and grants no authority; unlinking keeps the row and revokes nothing.
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { OwnerSubject } from '@tb/contracts';
import { RoutesOfLink } from '../representation/routes.js';
import { Absent, Time } from './agencies.js';
import { LINK_STATE_LABEL, LINK_STATE_TONE, SUBJECT_TYPE_LABEL } from './format.js';
import { useDirectoryApi, useIntentKey, useLoad, useWrite } from './hooks.js';
import { useRecordPage } from './record-page.js';
import { ApiError } from '../api/client.js';
import {
  Breadcrumbs,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  ReasonDialog,
  RecordHeader,
  Section,
  StateStamp,
  StatusNotice,
} from './ui.js';

type LinkState = OwnerSubject['linkState'];

export function OwnerSubjectDetailPage() {
  const { id = '' } = useParams();
  return <OwnerSubjectDetail key={id} id={id} />;
}

function OwnerSubjectDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const write = useWrite();
  const intent = useIntentKey();
  const page = useRecordPage(`owner-subject:${id}`, () => api.ownerSubjects.get(id));
  const association = page.state.status === 'ready' ? page.state.value.data : null;
  const [parties] = useLoad(`owner-subject-parties:${association?.ownerId ?? ''}`, async () => {
    if (association === null) return null;
    const [owner, subject] = await Promise.all([
      api.owners.get(association.ownerId),
      api.legalSubjects.get(association.legalSubjectId),
    ]);
    return { owner: owner.data, subject: subject.data };
  });
  const [target, setTarget] = useState<LinkState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (page.state.status === 'loading') return <LoadingNotice label="Loading link…" />;
  if (page.state.status === 'error') {
    return <ErrorNotice error={page.state.error} recordLabel="link" onRetry={page.reload} />;
  }
  const record = page.state.value;
  const link = record.data;
  const owner = parties.status === 'ready' ? parties.value?.owner : undefined;
  const subject = parties.status === 'ready' ? parties.value?.subject : undefined;
  const title = `${owner?.displayName ?? 'Owner'} and ${subject?.legalName ?? 'legal subject'}`;

  async function confirm(reason: string) {
    if (target === null) return;
    setPending(true);
    setError(null);
    try {
      const next = await write(
        intent.keyFor({ id: link.id, etag: record.etag, target, reason }),
        (auth) =>
          api.ownerSubjects.setLinkState(link.id, { state: target, reason }, record.etag, auth),
      );
      intent.done();
      setTarget(null);
      page.update(next, `Link ${LINK_STATE_LABEL[target].toLowerCase()}.`);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 412) {
        setTarget(null);
        page.raiseConflict();
      } else {
        setError(failure);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="sheet" data-testid="owner-subject-detail">
      <Breadcrumbs
        trail={[
          ['Directory', '/directory'],
          ['Owners', '/directory/owners'],
          [owner?.displayName ?? 'Owner', `/directory/owners/${link.ownerId}`],
          ['Link', null],
        ]}
      />
      <RecordHeader
        name={title}
        stamp={
          <StateStamp
            label={LINK_STATE_LABEL[link.linkState]}
            tone={LINK_STATE_TONE[link.linkState]}
          />
        }
        facts={[`Version ${link.rowVersion}`]}
        boundary="A recorded relationship between an owner namespace and an exact legal subject. It is not an appointment and grants no authority."
      />
      {page.conflict && <ConflictNotice recordLabel="link" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      <div className="record-actions" role="group" aria-label="Actions for this link">
        {(['LINKED', 'PAUSED', 'UNLINKED'] as const)
          .filter((state) => state !== link.linkState)
          .map((state) => (
            <button
              key={state}
              type="button"
              className={state === 'UNLINKED' ? 'button-danger-quiet' : undefined}
              onClick={() => {
                setError(null);
                setTarget(state);
              }}
            >
              {state === 'LINKED' ? 'Relink' : state === 'PAUSED' ? 'Pause link' : 'Unlink'}
            </button>
          ))}
      </div>
      <div className="sheet-columns">
        <Section title="Parties">
          <Details
            rows={[
              [
                'Owner',
                <Link key="owner" to={`/directory/owners/${link.ownerId}`}>
                  {owner?.displayName ?? 'Owner'}
                </Link>,
              ],
              [
                'Legal subject',
                <Link key="subject" to={`/directory/legal-subjects/${link.legalSubjectId}`}>
                  {subject?.legalName ?? 'Legal subject'}
                </Link>,
              ],
              ['Subject type', subject ? SUBJECT_TYPE_LABEL[subject.subjectType] : null],
              ['Relationship', link.relationshipLabel],
              ['Source reference', link.sourceId && <code>{link.sourceId}</code>],
            ]}
          />
        </Section>
        <Section title="Link state">
          <Details
            rows={[
              ['State', LINK_STATE_LABEL[link.linkState]],
              ['Linked since', <Time key="since" iso={link.createdAt} />],
              [
                'Unlinked at',
                link.unlinkedAt === null ? null : <Time key="unlinked" iso={link.unlinkedAt} />,
              ],
              [
                'Unlink reason',
                link.unlinkReason ?? (link.linkState === 'UNLINKED' ? <Absent /> : null),
              ],
              ['Last changed', <Time key="updated" iso={link.updatedAt} />],
            ]}
          />
          <p className="hint">Earlier states and their reasons are kept in the audit trail.</p>
        </Section>
      </div>
      <ReasonDialog
        open={target !== null}
        title={
          target === 'UNLINKED' ? 'Unlink' : target === 'PAUSED' ? 'Pause this link' : 'Relink'
        }
        description={
          <p>
            {target === 'UNLINKED'
              ? 'The link is kept for history and marked unlinked. Nothing is revoked, retracted or sent. It is refused while routes still use it.'
              : target === 'PAUSED'
                ? 'A paused link stays on record; nothing that already refers to it changes.'
                : 'The link becomes active again. Relinking does not revive any expired or revoked authority.'}
          </p>
        }
        confirmLabel={target === 'UNLINKED' ? 'Unlink' : target === 'PAUSED' ? 'Pause' : 'Relink'}
        danger={target === 'UNLINKED'}
        recordLabel="link"
        pending={pending}
        error={error}
        onCancel={() => setTarget(null)}
        onConfirm={(reason) => void confirm(reason)}
      />
      <RoutesOfLink link={link} />
    </article>
  );
}
