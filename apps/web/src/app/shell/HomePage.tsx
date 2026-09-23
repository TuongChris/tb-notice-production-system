import { useSession } from '../auth/session.js';

export function HomePage() {
  const { state } = useSession();
  if (state.status !== 'authenticated') return null;
  const endsAt = new Date(state.session.expiresAt);
  return (
    <section>
      <h1>Overview</h1>
      <p>
        This phase provides local sign-in and this protected shell only. Directory, representation,
        case and production features are not implemented yet.
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
