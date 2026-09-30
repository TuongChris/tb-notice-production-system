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
        nothing.
      </p>
      <p>
        <Link to="/production">Production</Link> opens the existing workflow for a case: read its
        Production Context, generate an immutable Prompt Snapshot, draft outside the application,
        then import a NoticeCandidate or a revision. On the candidate page, run Technical
        Validation, record separate G1–G6 reviews and evaluate current Derived Readiness. Prepare an
        Unsigned Export only when the current result is READY_FOR_SIGNER — ready for authorized
        human signer review, not approval or permission to send. Technical PASS is not G1–G6 PASS.
        An application User is not a Signer. G7 remains authorized-human-only and outside the
        application; this application never signs or sends notices.
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
