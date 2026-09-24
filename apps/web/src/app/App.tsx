import { useMemo } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import type { ApiClient } from './api/client.js';
import { createDirectoryApi } from './api/directory.js';
import { SessionProvider, useSession } from './auth/session.js';
import { SelectAuthorityPage } from './cases/authority-selection.js';
import { LinkCaseSourcePage } from './cases/case-sources.js';
import { CaseDetailPage, CaseListPage, EditCasePage, NewCasePage } from './cases/cases.js';
import {
  AgencyDetailPage,
  AgencyListPage,
  EditAgencyPage,
  NewAgencyPage,
} from './directory/agencies.js';
import { DirectoryLayout } from './directory/DirectoryLayout.js';
import { DirectoryApiProvider } from './directory/hooks.js';
import { LookupProvider } from './directory/lookup.js';
import {
  EditLegalSubjectPage,
  LegalSubjectDetailPage,
  LegalSubjectListPage,
  NewLegalSubjectPage,
} from './directory/legal-subjects.js';
import { OwnerSubjectDetailPage } from './directory/owner-subjects.js';
import { EditOwnerPage, NewOwnerPage, OwnerDetailPage, OwnerListPage } from './directory/owners.js';
import {
  EditSignerPage,
  NewSignerPage,
  SignerDetailPage,
  SignerListPage,
} from './directory/signers.js';
import { LoginPage } from './pages/LoginPage.js';
import {
  CoverageDetailPage,
  EditCoveragePage,
  NewCoveragePage,
  NewCoverageSignerPage,
} from './representation/coverages.js';
import { NewAuthorityEventPage } from './representation/events.js';
import {
  EditMandatePage,
  MandateDetailPage,
  MandateListPage,
  NewMandatePage,
} from './representation/mandates.js';
import { RepresentationLayout } from './representation/RepresentationLayout.js';
import {
  EditRoutePage,
  NewRoutePage,
  RouteDetailPage,
  RouteListPage,
} from './representation/routes.js';
import { EditVersionPage, NewVersionPage, VersionDetailPage } from './representation/versions.js';
import { SessionCheck } from './pages/SessionCheck.js';
import { AppShell } from './shell/AppShell.js';
import { HomePage } from './shell/HomePage.js';
import {
  NewSourcePage,
  ReviseSourcePage,
  SourceDetailPage,
  SourceListPage,
} from './sources/sources.js';

/**
 * Web app: Login, session check, the protected shell, the Directory, Sources, the Representation
 * pages (routes, mandates, versions, coverage, coverage signers and authority events) and Cases
 * (case records, linked sources and authority selected for evaluation).
 */
export function App({ api }: { api: ApiClient }) {
  const directory = useMemo(() => createDirectoryApi(api), [api]);
  return (
    <SessionProvider api={api}>
      <DirectoryApiProvider api={directory}>
        <LookupProvider>
          <Routes>
            <Route path="/login" element={<LoginRoute api={api} />} />
            <Route element={<RequireSession />}>
              <Route path="/" element={<AppShell api={api} />}>
                <Route index element={<HomePage />} />
                <Route path="directory" element={<DirectoryLayout />}>
                  <Route index element={<Navigate to="agencies" replace />} />
                  <Route path="agencies" element={<AgencyListPage />} />
                  <Route path="agencies/new" element={<NewAgencyPage />} />
                  <Route path="agencies/:id" element={<AgencyDetailPage />} />
                  <Route path="agencies/:id/edit" element={<EditAgencyPage />} />
                  <Route path="owners" element={<OwnerListPage />} />
                  <Route path="owners/new" element={<NewOwnerPage />} />
                  <Route path="owners/:id" element={<OwnerDetailPage />} />
                  <Route path="owners/:id/edit" element={<EditOwnerPage />} />
                  <Route path="legal-subjects" element={<LegalSubjectListPage />} />
                  <Route path="legal-subjects/new" element={<NewLegalSubjectPage />} />
                  <Route path="legal-subjects/:id" element={<LegalSubjectDetailPage />} />
                  <Route path="legal-subjects/:id/edit" element={<EditLegalSubjectPage />} />
                  <Route path="signers" element={<SignerListPage />} />
                  <Route path="signers/new" element={<NewSignerPage />} />
                  <Route path="signers/:id" element={<SignerDetailPage />} />
                  <Route path="signers/:id/edit" element={<EditSignerPage />} />
                  <Route path="owner-subjects/:id" element={<OwnerSubjectDetailPage />} />
                </Route>
                <Route path="sources" element={<SourceListPage />} />
                <Route path="sources/new" element={<NewSourcePage />} />
                <Route path="sources/:id" element={<SourceDetailPage />} />
                <Route path="sources/:id/revise" element={<ReviseSourcePage />} />
                <Route path="representation" element={<RepresentationLayout />}>
                  <Route index element={<Navigate to="routes" replace />} />
                  <Route path="routes" element={<RouteListPage />} />
                  <Route path="routes/new" element={<NewRoutePage />} />
                  <Route path="routes/:id" element={<RouteDetailPage />} />
                  <Route path="routes/:id/edit" element={<EditRoutePage />} />
                  <Route path="mandates" element={<MandateListPage />} />
                  <Route path="mandates/new" element={<NewMandatePage />} />
                  <Route path="mandates/:id" element={<MandateDetailPage />} />
                  <Route path="mandates/:id/edit" element={<EditMandatePage />} />
                  <Route path="mandates/:id/versions/new" element={<NewVersionPage />} />
                  <Route path="mandates/:id/events/new" element={<NewAuthorityEventPage />} />
                  <Route path="versions/:id" element={<VersionDetailPage />} />
                  <Route path="versions/:id/edit" element={<EditVersionPage />} />
                  <Route path="versions/:id/coverages/new" element={<NewCoveragePage />} />
                  <Route path="coverages/:id" element={<CoverageDetailPage />} />
                  <Route path="coverages/:id/edit" element={<EditCoveragePage />} />
                  <Route path="coverages/:id/signers/new" element={<NewCoverageSignerPage />} />
                </Route>
                <Route path="cases" element={<CaseListPage />} />
                <Route path="cases/new" element={<NewCasePage />} />
                <Route path="cases/:id" element={<CaseDetailPage />} />
                <Route path="cases/:id/edit" element={<EditCasePage />} />
                <Route path="cases/:id/sources/new" element={<LinkCaseSourcePage />} />
                <Route
                  path="cases/:id/authority-selections/new"
                  element={<SelectAuthorityPage />}
                />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </LookupProvider>
      </DirectoryApiProvider>
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
