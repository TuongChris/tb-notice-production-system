// The case intake sections of the case page (P4B): reported items, works, use mappings and facts,
// each shown as recorded for this case only. The case's works, reported items and mappings are
// loaded once per case version and shared by the sections that name them; nothing here is loaded
// from, or carried over to, another case.
import type { CaseRecord } from '@tb/contracts';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { ErrorNotice, LoadingNotice } from '../directory/ui.js';
import { FactsSection } from './facts.js';
import { MappingsSection } from './mappings.js';
import { ReportedItemsSection } from './reported-items.js';
import { WorksSection } from './works.js';

export function CaseIntakeSections({ caseRecord }: { caseRecord: CaseRecord }) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad(
    `case-intake:${caseRecord.id}:${caseRecord.rowVersion}`,
    async () => {
      const [items, works, mappings] = await Promise.all([
        api.cases.reportedItems.list(caseRecord.id, { limit: 100 }),
        api.cases.works.list(caseRecord.id, { limit: 100 }),
        api.cases.mappings.list(caseRecord.id, { limit: 100 }),
      ]);
      return { items, works, mappings };
    },
  );
  if (state.status === 'loading') return <LoadingNotice label="Loading case intake…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="case" onRetry={reload} />;
  }
  const { items, works, mappings } = state.value;
  const parties = { works: works.items, items: items.items, mappings: mappings.items };
  return (
    <div data-testid="case-intake">
      <ReportedItemsSection caseRecord={caseRecord} items={items} />
      <WorksSection caseRecord={caseRecord} works={works} />
      <MappingsSection caseRecord={caseRecord} mappings={mappings} parties={parties} />
      <FactsSection caseRecord={caseRecord} parties={parties} />
    </div>
  );
}
