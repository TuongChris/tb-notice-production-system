/** Shown while the initial GET /api/v1/auth/session is in flight. */
export function SessionCheck() {
  return (
    <main className="centered">
      <p role="status" data-testid="session-check">
        Checking your session…
      </p>
    </main>
  );
}
