import { Link } from 'react-router';
import type { CaseRecord } from '@tb/contracts';
import { useDirectoryApi } from '../directory/hooks.js';
import { DirectoryList } from '../directory/list.js';
import { RecordName } from '../directory/lookup.js';

/** Navigation only: choosing a link opens the existing case-scoped workflow. */
export function ProductionPage() {
  const api = useDirectoryApi();
  return (
    <section className="production-page" data-testid="production-page">
      <DirectoryList<CaseRecord>
        title="Production"
        noun="cases"
        searchLabel="Search intake label or canonical case id"
        intro={
          <>
            Production work belongs to one case. Find a case below and open its records, context,
            prompts or candidates. No case or authority is selected automatically. A case existing
            does not mean it is ready; a source existing is not proof.
          </>
        }
        load={(query) => api.cases.list(query)}
        emptyText={
          <p>
            No cases yet. Start with <Link to="/cases">Cases</Link>.
          </p>
        }
        columns={[
          {
            header: 'Case',
            cell: (item) => (
              <>
                <Link to={`/cases/${item.id}`}>{item.intakeLabel}</Link>
                <p className="hint">{item.canonicalCaseId ?? 'No canonical case id'}</p>
                {item.archivedAt !== null && <p className="hint">Archived — read-only</p>}
                {item.routeId === null && <p className="hint">No route bound</p>}
              </>
            ),
          },
          { header: 'Agency', cell: (item) => <RecordName kind="agency" id={item.agencyId} /> },
          {
            header: 'Open workflow',
            cell: (item) => (
              <nav aria-label={`Production for ${item.intakeLabel}`}>
                <ul>
                  <li>
                    <Link to={`/cases/${item.id}/production-context`}>Production Context</Link>
                  </li>
                  <li>
                    <Link to={`/cases/${item.id}/prompts`}>Prompts</Link>
                  </li>
                  <li>
                    <Link to={`/cases/${item.id}/candidates`}>Candidates</Link>
                  </li>
                </ul>
              </nav>
            ),
          },
        ]}
      />
      <section aria-labelledby="production-flow">
        <h2 id="production-flow">From case records to unsigned handoff</h2>
        <ol>
          <li>Review the Case records.</li>
          <li>Read the Production Context for the task and scope you choose.</li>
          <li>Generate a Prompt Snapshot from the context you reviewed.</li>
          <li>Draft outside the application.</li>
          <li>Import Candidate, or import a revision, under that case.</li>
          <li>Run Technical Validation on the exact candidate artifact.</li>
          <li>Record the separate, attributable G1–G6 review.</li>
          <li>Evaluate current readiness.</li>
          <li>Prepare unsigned handoff, only when READY_FOR_SIGNER.</li>
        </ol>
        <p>
          Validation, G1–G6 review, current readiness and unsigned handoff are on the candidate
          detail page. Open Candidates, then explicitly choose the artifact to work on. Existing
          pages check their own prerequisites; these navigation links grant no eligibility. Archived
          cases remain read-only, with history available.
        </p>
        <p role="note" className="context-boundary">
          Technical PASS is not G1–G6 PASS. G6 reviews the exact artifact, traceability and
          whole-artifact consistency. READY_FOR_SIGNER means ready for authorized human signer
          review, not approval or permission to send. An application User is not a Signer. G7 —
          actual authorized human review, adoption, signature and sending — remains outside the
          application. This application never signs or sends notices.
        </p>
      </section>
    </section>
  );
}
