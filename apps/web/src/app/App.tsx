import { lazy, useMemo, type ComponentType } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import type { ApiClient } from './api/client.js';
import { createDirectoryApi } from './api/directory.js';
import { SessionProvider, useSession } from './auth/session.js';
import { DirectoryLayout } from './directory/DirectoryLayout.js';
import { DirectoryApiProvider } from './directory/hooks.js';
import { LookupProvider } from './directory/lookup.js';
import { LoginPage } from './pages/LoginPage.js';
import { SessionCheck } from './pages/SessionCheck.js';
import { RepresentationLayout } from './representation/RepresentationLayout.js';
import { AppShell } from './shell/AppShell.js';
import { HomePage } from './shell/HomePage.js';

/**
 * Route-level code splitting: a page module is loaded the first time one of its pages is shown,
 * while the shell (or the section layout) shows a loading notice. Login, the session check, the
 * shell, the layouts and the API clients stay in the entry bundle.
 */
function pagesOf<M extends Record<string, unknown>>(load: () => Promise<M>) {
  return <K extends keyof M>(name: K) =>
    lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const agencies = pagesOf(() => import('./directory/agencies.js'));
const AgencyListPage = agencies('AgencyListPage');
const NewAgencyPage = agencies('NewAgencyPage');
const AgencyDetailPage = agencies('AgencyDetailPage');
const EditAgencyPage = agencies('EditAgencyPage');
const owners = pagesOf(() => import('./directory/owners.js'));
const OwnerListPage = owners('OwnerListPage');
const NewOwnerPage = owners('NewOwnerPage');
const OwnerDetailPage = owners('OwnerDetailPage');
const EditOwnerPage = owners('EditOwnerPage');
const legalSubjects = pagesOf(() => import('./directory/legal-subjects.js'));
const LegalSubjectListPage = legalSubjects('LegalSubjectListPage');
const NewLegalSubjectPage = legalSubjects('NewLegalSubjectPage');
const LegalSubjectDetailPage = legalSubjects('LegalSubjectDetailPage');
const EditLegalSubjectPage = legalSubjects('EditLegalSubjectPage');
const signers = pagesOf(() => import('./directory/signers.js'));
const SignerListPage = signers('SignerListPage');
const NewSignerPage = signers('NewSignerPage');
const SignerDetailPage = signers('SignerDetailPage');
const EditSignerPage = signers('EditSignerPage');
const OwnerSubjectDetailPage = pagesOf(() => import('./directory/owner-subjects.js'))(
  'OwnerSubjectDetailPage',
);
const sources = pagesOf(() => import('./sources/sources.js'));
const SourceListPage = sources('SourceListPage');
const NewSourcePage = sources('NewSourcePage');
const SourceDetailPage = sources('SourceDetailPage');
const ReviseSourcePage = sources('ReviseSourcePage');
const routes = pagesOf(() => import('./representation/routes.js'));
const RouteListPage = routes('RouteListPage');
const NewRoutePage = routes('NewRoutePage');
const RouteDetailPage = routes('RouteDetailPage');
const EditRoutePage = routes('EditRoutePage');
const mandates = pagesOf(() => import('./representation/mandates.js'));
const MandateListPage = mandates('MandateListPage');
const NewMandatePage = mandates('NewMandatePage');
const MandateDetailPage = mandates('MandateDetailPage');
const EditMandatePage = mandates('EditMandatePage');
const versions = pagesOf(() => import('./representation/versions.js'));
const NewVersionPage = versions('NewVersionPage');
const VersionDetailPage = versions('VersionDetailPage');
const EditVersionPage = versions('EditVersionPage');
const coverages = pagesOf(() => import('./representation/coverages.js'));
const NewCoveragePage = coverages('NewCoveragePage');
const CoverageDetailPage = coverages('CoverageDetailPage');
const EditCoveragePage = coverages('EditCoveragePage');
const NewCoverageSignerPage = coverages('NewCoverageSignerPage');
const NewAuthorityEventPage = pagesOf(() => import('./representation/events.js'))(
  'NewAuthorityEventPage',
);
const cases = pagesOf(() => import('./cases/cases.js'));
const CaseListPage = cases('CaseListPage');
const NewCasePage = cases('NewCasePage');
const CaseDetailPage = cases('CaseDetailPage');
const EditCasePage = cases('EditCasePage');
const LinkCaseSourcePage = pagesOf(() => import('./cases/case-sources.js'))('LinkCaseSourcePage');
const selections = pagesOf(() => import('./cases/authority-selection.js'));
const SelectAuthorityPage = selections('SelectAuthorityPage');
const SelectionDetailPage = selections('SelectionDetailPage');
const reportedItems = pagesOf(() => import('./cases/reported-items.js'));
const NewReportedItemPage = reportedItems('NewReportedItemPage');
const ReportedItemDetailPage = reportedItems('ReportedItemDetailPage');
const EditReportedItemPage = reportedItems('EditReportedItemPage');
const works = pagesOf(() => import('./cases/works.js'));
const NewWorkPage = works('NewWorkPage');
const WorkDetailPage = works('WorkDetailPage');
const EditWorkPage = works('EditWorkPage');
const mappings = pagesOf(() => import('./cases/mappings.js'));
const NewMappingPage = mappings('NewMappingPage');
const MappingDetailPage = mappings('MappingDetailPage');
const EditMappingPage = mappings('EditMappingPage');
const facts = pagesOf(() => import('./cases/facts.js'));
const NewFactPage = facts('NewFactPage');
const FactDetailPage = facts('FactDetailPage');
const ReviseFactPage = facts('ReviseFactPage');
const BindCorrespondencePage = pagesOf(() => import('./cases/case-correspondence.js'))(
  'BindCorrespondencePage',
);
const ProductionContextPage = pagesOf(() => import('./cases/production-context.js'))(
  'ProductionContextPage',
);
const prompts = pagesOf(() => import('./cases/prompts.js'));
const PromptHistoryPage = prompts('PromptHistoryPage');
const GeneratePromptPage = prompts('GeneratePromptPage');
const PromptDetailPage = prompts('PromptDetailPage');
const candidates = pagesOf(() => import('./cases/candidates.js'));
const CandidateHistoryPage = candidates('CandidateHistoryPage');
const ImportCandidatePage = candidates('ImportCandidatePage');
const CandidateDetailPage = candidates('CandidateDetailPage');
const ReviseCandidatePage = candidates('ReviseCandidatePage');
const correspondence = pagesOf(() => import('./correspondence/correspondence.js'));
const CorrespondenceListPage = correspondence('CorrespondenceListPage');
const NewCorrespondencePage = correspondence('NewCorrespondencePage');
const CorrespondenceDetailPage = correspondence('CorrespondenceDetailPage');

/**
 * Web app: Login, session check, the protected shell, the Directory, Sources, the Representation
 * pages (routes, mandates, versions, coverage, coverage signers and authority events), Cases (case
 * records, linked sources, authority selected for evaluation, the case intake — reported items,
 * works, use mappings and facts — correspondence bindings, the read-only production context of a
 * case, which determines nothing, its prompt snapshots: immutable prompts generated from one
 * reviewed context, never a notice, approval, readiness decision, signature or transmission, and
 * its notice candidates: unsigned draft artifacts imported exactly from outside the application,
 * never approved, signed, ready or sent) and Correspondence (captured messages; nothing is sent).
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
                <Route
                  path="cases/:id/authority-selections/:selectionId"
                  element={<SelectionDetailPage />}
                />
                <Route path="cases/:id/reported-items/new" element={<NewReportedItemPage />} />
                <Route
                  path="cases/:id/reported-items/:itemId"
                  element={<ReportedItemDetailPage />}
                />
                <Route
                  path="cases/:id/reported-items/:itemId/edit"
                  element={<EditReportedItemPage />}
                />
                <Route path="cases/:id/works/new" element={<NewWorkPage />} />
                <Route path="cases/:id/works/:workId" element={<WorkDetailPage />} />
                <Route path="cases/:id/works/:workId/edit" element={<EditWorkPage />} />
                <Route path="cases/:id/mappings/new" element={<NewMappingPage />} />
                <Route path="cases/:id/mappings/:mappingId" element={<MappingDetailPage />} />
                <Route path="cases/:id/mappings/:mappingId/edit" element={<EditMappingPage />} />
                <Route path="cases/:id/facts/new" element={<NewFactPage />} />
                <Route path="cases/:id/facts/:factId" element={<FactDetailPage />} />
                <Route path="cases/:id/facts/:factId/revise" element={<ReviseFactPage />} />
                <Route
                  path="cases/:id/correspondence-bindings/new"
                  element={<BindCorrespondencePage />}
                />
                <Route path="cases/:id/production-context" element={<ProductionContextPage />} />
                <Route path="cases/:id/prompts" element={<PromptHistoryPage />} />
                <Route path="cases/:id/prompts/new" element={<GeneratePromptPage />} />
                <Route path="cases/:id/prompts/:promptId" element={<PromptDetailPage />} />
                <Route path="cases/:id/candidates" element={<CandidateHistoryPage />} />
                <Route path="cases/:id/candidates/new" element={<ImportCandidatePage />} />
                <Route path="cases/:id/candidates/:candidateId" element={<CandidateDetailPage />} />
                <Route
                  path="cases/:id/candidates/:candidateId/revise"
                  element={<ReviseCandidatePage />}
                />
                <Route path="correspondence" element={<CorrespondenceListPage />} />
                <Route path="correspondence/new" element={<NewCorrespondencePage />} />
                <Route path="correspondence/:id" element={<CorrespondenceDetailPage />} />
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
