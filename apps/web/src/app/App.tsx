import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import type { ApiClient } from './api/client.js';
import { SessionProvider, useSession } from './auth/session.js';
import { LoginPage } from './pages/LoginPage.js';
import { SessionCheck } from './pages/SessionCheck.js';
import { AppShell } from './shell/AppShell.js';
import { HomePage } from './shell/HomePage.js';

/** P1 web shell: Login, session check, and the protected shell. No business pages yet. */
export function App({ api }: { api: ApiClient }) {
  return (
    <SessionProvider api={api}>
      <Routes>
        <Route path="/login" element={<LoginRoute api={api} />} />
        <Route element={<RequireSession />}>
          <Route path="/" element={<AppShell api={api} />}>
            <Route index element={<HomePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProvider>
  );
}

function RequireSession() {
  const { state } = useSession();
  const location = useLocation();
  if (state.status === 'checking') return <SessionCheck />;
  if (state.status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function LoginRoute({ api }: { api: ApiClient }) {
  const { state } = useSession();
  if (state.status === 'checking') return <SessionCheck />;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return <LoginPage api={api} notice={state.notice} />;
}
