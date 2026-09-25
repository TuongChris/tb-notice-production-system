import { Link } from 'react-router';
import { useSession } from '../auth/session.js';

export function HomePage() {
  const { state } = useSession();
  if (state.status !== 'authenticated') return null;
  const endsAt = new Date(state.session.expiresAt);
  return (
    <section>
      <h1>Overview</h1>
      <p>
        The <Link to="/directory">directory</Link> holds agencies, owners, legal subjects, the links
        between owners and legal subjects, and signers. Directory records are administrative: they
        grant no authority and make nothing ready to send.
      </p>
      <p>
        <Link to="/sources">Sources</Link> records pointers to documents kept elsewhere, usually in
        Google Drive; a source record is not the evidence and proves nothing by existing.{' '}
        <Link to="/representation">Representation</Link> holds routes — operational paths from an
        agency to an owner’s legal subject — and mandates with their versions, coverage, coverage
        signers and authority events. These record what cited sources are reported to support: none
        of them is authority by existing, a G1–G7 decision or a signature.
      </p>
      <p>
        <Link to="/cases">Cases</Link> hold case-specific records: a case’s route binding, the
        sources linked to it and the authority materials selected for its evaluation. A case is not
        a legal verdict, a linked source is not proof, and a selection records only what will be
        evaluated — it is not a G1 decision. <Link to="/correspondence">Correspondence</Link>{' '}
        records captured messages exactly as entered and, on each case, explicit bindings of what a
        message is recorded as for that case. Capturing or binding sends, replies to and contacts
        nothing. Each case also has a production context: a read-only view of its recorded context
        for one task. It determines nothing — no G1–G7 decision and no readiness. Prompts, notice
        candidates and the rest of production are not implemented yet.
      </p>
      <dl>
        <dt>Session</dt>
        <dd data-testid="session-expiry">
          Ends at {endsAt.toLocaleString()} at the latest; about 30 minutes without activity also
          ends it.
        </dd>
      </dl>
    </section>
  );
}
