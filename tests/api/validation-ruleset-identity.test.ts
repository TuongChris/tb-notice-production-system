// TB-TECHNICAL-RULESET-v3 is reproducible from its identifier alone (R14-AUD-003, ADR-0010): the
// active wire-contract constant is replaced here — for every module this file loads — by a synthetic
// later release, and MARKER.INTERNAL_IDENTIFIERS still finds exactly what it finds under
// TB-SCHEMA-API-v1.4.0. A controlled proof without touching the application's constants at run
// time: the module graph of this test file alone sees the synthetic value.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CONTRACT_BASELINE, type ContextView } from '@tb/contracts';
import { PENDING_SIGNATURE } from '../../apps/api/src/infrastructure/integrity/tb-canonical-json.js';
import {
  INTERNAL_IDENTIFIER_STRINGS,
  TECHNICAL_RULES,
  TECHNICAL_RULESET_VERSION,
  type ValidationInput,
} from '../../apps/api/src/modules/validation/technical-ruleset.js';

const SYNTHETIC_RELEASE = 'TB-SCHEMA-API-v9.9.9-SYNTHETIC';

vi.mock('@tb/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tb/contracts')>()),
  CONTRACT_BASELINE: 'TB-SCHEMA-API-v9.9.9-SYNTHETIC',
}));

const view = (
  JSON.parse(
    readFileSync(path.join(import.meta.dirname, 'fixtures/p4e-prompt-contexts.json'), 'utf8'),
  ) as { initial: ContextView }
).initial;

const rule = TECHNICAL_RULES.find((entry) => entry.id === 'MARKER.INTERNAL_IDENTIFIERS');

/** What the rule reads: the outgoing text, the candidate and prompt ids and the context records. */
function input(bodyText: string): ValidationInput {
  return {
    candidate: {
      id: '99999999-9999-4999-8999-999999999999',
      caseId: view.context.caseId,
      taskType: 'INITIAL',
      subject: 'SYNTHETIC notice subject',
      bodyText,
      bodySha256: 'a'.repeat(64),
      artifactSha256: 'b'.repeat(64),
      signatureState: 'HUMAN_PENDING',
      envelope: null,
      preparedDocuments: [],
    },
    prompt: {
      id: '88888888-8888-4888-8888-888888888888',
      caseId: view.context.caseId,
      taskType: 'INITIAL',
      generationMode: 'DRAFTING',
      parentBindingId: null,
      dependencyDigest: view.dependencyDigest,
      dependencyManifest: view.dependencies,
      promptSha256: 'c'.repeat(64),
    },
    evaluated: view,
    parentCorrespondenceId: null,
    planSources: new Map(),
  };
}

/** The rule's findings for a body naming `token`, as [token, occurrences] per finding. */
function detected(token: string) {
  const check = rule?.check(input(`Ref ${token}\n${PENDING_SIGNATURE}`));
  if (check?.outcome !== 'EXECUTED') throw new Error('the rule did not execute');
  return check.findings.map((item) => (item.details as { occurrences: number }).occurrences);
}

describe('TB-TECHNICAL-RULESET-v3 under a changed active contract constant (R14-AUD-003, ADR-0010)', () => {
  it('the active contract constant is the synthetic later release for this module graph', () => {
    expect(CONTRACT_BASELINE).toBe(SYNTHETIC_RELEASE);
    expect(rule?.checkKind).toBe('DETERMINISTIC');
  });

  it('MARKER.INTERNAL_IDENTIFIERS finds exactly what it finds under TB-SCHEMA-API-v1.4.0: v1.2.0, v1.3.0 and v1.4.0 still, the synthetic release and a future v1.5.0 not — the vocabulary and the identifier are unchanged', () => {
    expect(TECHNICAL_RULESET_VERSION).toBe('TB-TECHNICAL-RULESET-v3');
    expect([...INTERNAL_IDENTIFIER_STRINGS]).toEqual([
      'TB-PROMPT-TEMPLATE-v1',
      'TB-CANDIDATE-ARTIFACT-v1',
      'TB-PRODUCTION-CONTEXT-DIGEST-v1',
      'TB-TECHNICAL-RULESET-v1',
      'TB-TECHNICAL-RULESET-v2',
      'TB-SCHEMA-API-v1.2.0',
      'TB-SCHEMA-API-v1.3.0',
      'PFC-YT-EMAIL-v1.1',
      'TB-PRODUCTION-CONTEXT-DIGEST-v2',
      'TB-TECHNICAL-RULESET-v3',
      'TB-SCHEMA-API-v1.4.0',
    ]);
    expect(detected('TB-SCHEMA-API-v1.2.0')).toEqual([1]);
    expect(detected('TB-SCHEMA-API-v1.3.0')).toEqual([1]);
    expect(detected('TB-SCHEMA-API-v1.4.0')).toEqual([1]);
    expect(detected(SYNTHETIC_RELEASE)).toEqual([]);
    expect(detected('TB-SCHEMA-API-v1.5.0')).toEqual([]);
  });
});
