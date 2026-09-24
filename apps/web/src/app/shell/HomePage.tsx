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
        agency to an owner’s legal subject — which grant no authority. Mandates, cases and
        production are not implemented yet.
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
