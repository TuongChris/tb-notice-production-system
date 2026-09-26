// Candidate rules (P4F) that need no database: the artifact definition and its two hashes against
// independent oracles (a hand-written TB canonical JSON text with its pinned SHA-256, and the frozen
// reference helper), the stored shapes of the envelope and the document plans, the request-only text
// check, the envelope and document-plan rules against a prompt's frozen context (the synthetic P4E
// fixtures, extended with captured attachments here), and the sources of the candidates module and
// page: no clock, randomness, network, process or AI provider. Database behaviour is covered over
// HTTP in tests/db/p4f-http.test.ts.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ContextView, ProductionContext } from '../../packages/contracts/src/index.js';
import {
  CreateCandidateSchema,
  DocumentPlanSchema,
  ReviseCandidateSchema,
} from '../../packages/contracts/src/index.js';
import { ApiError } from '../../apps/api/src/infrastructure/http/api-error.js';
import { PENDING_SIGNATURE } from '../../apps/api/src/infrastructure/integrity/tb-canonical-json.js';
import {
  ARTIFACT_ALGORITHM,
  CANDIDATE_SIGNATURE_STATE,
  candidateArtifact,
  candidateArtifactSha256,
  candidateBodySha256,
  storedDocumentPlan,
  storedEnvelope,
  type CandidateContent,
} from '../../apps/api/src/modules/candidates/candidate-artifact.js';
import {
  candidateTextProblem,
  documentPlanProblem,
  envelopeProblem,
  previouslySuppliedSources,
  type PromptBinding,
} from '../../apps/api/src/modules/candidates/candidate-rules.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const FROZEN_HELPER = path.join(
  repoRoot,
  'docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1/contracts/consistency-reference.mjs',
);
const CANDIDATES_MODULE = path.join(repoRoot, 'apps/api/src/modules/candidates');

interface FrozenHelper {
  readonly PENDING_SIGNATURE: string;
  canonicalJson(value: unknown): string;
  canonicalSha256(value: unknown): string;
  exactTextSha256(value: string): string;
}
const frozen = (await import(pathToFileURL(FROZEN_HELPER).href)) as FrozenHelper;

interface Fixtures {
  readonly initial: ContextView;
  readonly reply: ContextView;
}
const { initial, reply } = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/p4e-prompt-contexts.json'), 'utf8'),
) as Fixtures;

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const S3 = '33333333-3333-4333-8333-333333333333';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const SENDER = 'synthetic-sender@example.invalid';
const PLATFORM = 'synthetic-platform@example.invalid';

/** The fixed synthetic artifact of the oracle below. */
const BODY = `SYNTHETIC line 1\r\nSYNTHETIC line 2 \n${PENDING_SIGNATURE}\n`;
const CONTENT: CandidateContent = {
  subject: 'SYNTHETIC notice subject',
  bodyText: BODY,
  envelope: { from: SENDER, to: PLATFORM, replyTo: null, parentBindingId: null },
  preparedDocuments: [
    {
      sourceId: S1,
      purpose: 'SYNTHETIC reference',
      state: 'REFERENCE_ONLY',
      fileName: null,
      contentSha256: null,
      disclosureReview: 'PENDING',
      limitations: null,
    },
    {
      sourceId: S2,
      purpose: 'SYNTHETIC exhibit',
      state: 'PREPARED_FOR_ATTACHMENT',
      fileName: 'synthetic.pdf',
      contentSha256: HASH_A,
      disclosureReview: 'REVIEWED_WITH_LIMITS',
      limitations: 'SYNTHETIC limits',
    },
  ],
};

/**
 * The oracle: the TB canonical JSON v1 text of CONTENT's artifact written out by hand — keys in
 * sorted order, no whitespace, strings as JSON escapes them — independent of any encoder. Its
 * SHA-256 is pinned below.
 */
const ORACLE_TEXT =
  '{"algorithm":"TB-CANDIDATE-ARTIFACT-v1",' +
  '"bodyText":"SYNTHETIC line 1\\r\\nSYNTHETIC line 2 \\n[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]\\n",' +
  '"envelope":{"from":"synthetic-sender@example.invalid","parentBindingId":null,"replyTo":null,"to":"synthetic-platform@example.invalid"},' +
  '"preparedDocuments":[' +
  `{"contentSha256":null,"disclosureReview":"PENDING","fileName":null,"limitations":null,"purpose":"SYNTHETIC reference","sourceId":"${S1}","state":"REFERENCE_ONLY"},` +
  `{"contentSha256":"${HASH_A}","disclosureReview":"REVIEWED_WITH_LIMITS","fileName":"synthetic.pdf","limitations":"SYNTHETIC limits","purpose":"SYNTHETIC exhibit","sourceId":"${S2}","state":"PREPARED_FOR_ATTACHMENT"}` +
  '],' +
  '"signatureSlot":"[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]",' +
  '"signatureState":"HUMAN_PENDING",' +
  '"subject":"SYNTHETIC notice subject"}';
const ORACLE_ARTIFACT_SHA256 = 'b988e1597f28b84e2a4d022164475919af61e1b09f27a926f27cb57403d273f4';
const ORACLE_BODY_SHA256 = '42ec9841c0a0cf1f49baf33cac29b0367c44c5d223e6a7ded2db6f99bf49733f';

const withBody = (bodyText: string): CandidateContent => ({ ...CONTENT, bodyText });

describe('artifactSha256 and bodySha256 — the independent oracle', () => {
  it('the artifact hash of a fixed candidate is the SHA-256 of its hand-written canonical JSON text, pinned; the body hash is the SHA-256 of the exact UTF-8 bytes, pinned', () => {
    expect(sha256(ORACLE_TEXT)).toBe(ORACLE_ARTIFACT_SHA256);
    expect(candidateArtifactSha256(CONTENT)).toBe(ORACLE_ARTIFACT_SHA256);
    expect(sha256(BODY)).toBe(ORACLE_BODY_SHA256);
    expect(candidateBodySha256(BODY)).toBe(ORACLE_BODY_SHA256);
    expect(candidateBodySha256(BODY)).toBe(
      createHash('sha256').update(Buffer.from(BODY, 'utf8')).digest('hex'),
    );
  });

  it('is the frozen reference helper’s canonical JSON and SHA-256 of exactly the artifact object; the body hash is its exact-text SHA-256', () => {
    expect(frozen.canonicalJson(candidateArtifact(CONTENT))).toBe(ORACLE_TEXT);
    expect(frozen.canonicalSha256(candidateArtifact(CONTENT))).toBe(ORACLE_ARTIFACT_SHA256);
    for (const body of [BODY, 'ASCII only', 'é é \t\r\n ', '<script>alert(1)</script>']) {
      expect(candidateBodySha256(body)).toBe(frozen.exactTextSha256(body));
      expect(candidateArtifactSha256(withBody(body))).toBe(
        frozen.canonicalSha256(candidateArtifact(withBody(body))),
      );
    }
  });

  it('binds exactly: the algorithm, subject, exact body, envelope, ordered plans and the signature state and slot — nothing else', () => {
    expect(Object.keys(candidateArtifact(CONTENT)).sort()).toEqual([
      'algorithm',
      'bodyText',
      'envelope',
      'preparedDocuments',
      'signatureSlot',
      'signatureState',
      'subject',
    ]);
    expect(candidateArtifact(CONTENT).algorithm).toBe(ARTIFACT_ALGORITHM);
    expect(candidateArtifact(CONTENT).signatureState).toBe('HUMAN_PENDING');
    expect(CANDIDATE_SIGNATURE_STATE).toBe('HUMAN_PENDING');
    expect(candidateArtifact(CONTENT).signatureSlot).toBe(frozen.PENDING_SIGNATURE);
    // Record metadata passed along is not part of the artifact.
    const extended = {
      ...CONTENT,
      id: '44444444-4444-4444-8444-444444444444',
      caseId: S3,
      promptSnapshotId: S3,
      parentCandidateId: S3,
      version: 7,
      taskType: 'NMI_REPLY',
      authoringTool: 'SYNTHETIC tool',
      revisionReason: 'SYNTHETIC reason',
      supersededAt: '2026-09-26T00:00:00.000Z',
      createdAt: '2026-09-26T00:00:00.000Z',
      createdById: S3,
    } as CandidateContent;
    expect(candidateArtifactSha256(extended)).toBe(ORACLE_ARTIFACT_SHA256);
    const plans = candidateArtifact({
      ...CONTENT,
      preparedDocuments: [{ ...CONTENT.preparedDocuments[0], extra: 'x' } as never],
    }).preparedDocuments;
    expect(Object.keys(plans[0] ?? {})).not.toContain('extra');
  });

  it('ASCII, CRLF against LF, one trailing space, composed against decomposed letters: every changed character is another body and another artifact', () => {
    const variants = [
      'SYNTHETIC ascii body',
      'SYNTHETIC ascii body ',
      'SYNTHETIC line\r\nnext',
      'SYNTHETIC line\nnext',
      'SYNTHETIC café',
      'SYNTHETIC café',
    ];
    const bodies = variants.map(candidateBodySha256);
    const artifacts = variants.map((body) => candidateArtifactSha256(withBody(body)));
    expect(new Set(bodies).size).toBe(variants.length);
    expect(new Set(artifacts).size).toBe(variants.length);
    // Each is the oracle’s: the exact text, never normalized.
    for (const [index, body] of variants.entries()) {
      expect(bodies[index]).toBe(sha256(body));
      expect(artifacts[index]).toBe(frozen.canonicalSha256(candidateArtifact(withBody(body))));
    }
  });

  it('the subject, the recipient and the document plan change the artifact without a body change (AC-045); the order of the plans is part of it', () => {
    const base = candidateArtifactSha256(CONTENT);
    const changed = [
      { ...CONTENT, subject: 'SYNTHETIC notice subject ' },
      { ...CONTENT, envelope: { ...CONTENT.envelope, to: 'other-platform@example.invalid' } },
      { ...CONTENT, envelope: { ...CONTENT.envelope, replyTo: SENDER } },
      { ...CONTENT, preparedDocuments: [...CONTENT.preparedDocuments].reverse() },
      { ...CONTENT, preparedDocuments: CONTENT.preparedDocuments.slice(0, 1) },
      {
        ...CONTENT,
        preparedDocuments: CONTENT.preparedDocuments.map((plan) => ({
          ...plan,
          state: 'UNKNOWN' as const,
        })),
      },
    ];
    const hashes = changed.map(candidateArtifactSha256);
    for (const hash of hashes) expect(hash).not.toBe(base);
    expect(new Set(hashes).size).toBe(changed.length);
    for (const [index, content] of changed.entries()) {
      expect(candidateBodySha256(content.bodyText)).toBe(ORACLE_BODY_SHA256);
      expect(hashes[index]).toBe(frozen.canonicalSha256(candidateArtifact(content)));
    }
  });

  it('a different signature state or slot would be another artifact: the hash binds both (the stored state is always HUMAN_PENDING)', () => {
    const artifact = candidateArtifact(CONTENT);
    expect(frozen.canonicalSha256({ ...artifact, signatureState: 'SIGNED' })).not.toBe(
      ORACLE_ARTIFACT_SHA256,
    );
    expect(
      frozen.canonicalSha256({ ...artifact, signatureSlot: 'SYNTHETIC Signer Person' }),
    ).not.toBe(ORACLE_ARTIFACT_SHA256);
    expect(sha256(ORACLE_TEXT.replace('"HUMAN_PENDING"', '"ADOPTED"'))).not.toBe(
      ORACLE_ARTIFACT_SHA256,
    );
  });

  it('an omitted optional envelope or plan field is stored as null: omitted and null give one artifact (the canonical encoding itself tells them apart)', () => {
    const omitted = storedEnvelope({ from: SENDER, to: PLATFORM });
    const nulled = storedEnvelope({
      from: SENDER,
      to: PLATFORM,
      replyTo: null,
      parentBindingId: null,
    });
    expect(omitted).toEqual({ from: SENDER, to: PLATFORM, replyTo: null, parentBindingId: null });
    expect(nulled).toEqual(omitted);
    const plan = { sourceId: S1, purpose: 'SYNTHETIC reference', state: 'REFERENCE_ONLY' as const };
    const planOmitted = storedDocumentPlan({ ...plan, disclosureReview: 'PENDING' });
    const planNulled = storedDocumentPlan({
      ...plan,
      disclosureReview: 'PENDING',
      fileName: null,
      contentSha256: null,
      limitations: null,
    });
    expect(planOmitted).toEqual(planNulled);
    expect(Object.keys(planOmitted).sort()).toEqual([
      'contentSha256',
      'disclosureReview',
      'fileName',
      'limitations',
      'purpose',
      'sourceId',
      'state',
    ]);
    const a = candidateArtifactSha256({ ...CONTENT, envelope: omitted });
    const b = candidateArtifactSha256({ ...CONTENT, envelope: nulled });
    expect(a).toBe(b);
    expect(a).toBe(ORACLE_ARTIFACT_SHA256);
    // Without the stored shape, TB canonical JSON distinguishes an absent key from a null value.
    expect(frozen.canonicalJson({ from: SENDER, to: PLATFORM })).not.toBe(
      frozen.canonicalJson({ from: SENDER, to: PLATFORM, replyTo: null, parentBindingId: null }),
    );
    // Values are stored exactly as supplied: nothing is trimmed, case-folded or filled in.
    expect(storedEnvelope({ from: ` ${SENDER}`, to: 'X@Example.Invalid' })).toEqual({
      from: ` ${SENDER}`,
      to: 'X@Example.Invalid',
      replyTo: null,
      parentBindingId: null,
    });
  });

  it('a NUL or an unpaired surrogate cannot be hashed (refused, never replaced)', () => {
    expect(() => candidateBodySha256('SYNTHETIC\u0000')).toThrow('INVALID_TEXT');
    expect(() => candidateBodySha256('SYNTHETIC\ud800')).toThrow('UNPAIRED_SURROGATE');
    expect(() => candidateArtifactSha256({ ...CONTENT, subject: 'a\u0000' })).toThrow(
      'INVALID_TEXT',
    );
  });
});

describe('the contract request — no signature, hash, task or readiness field; plan states without ACTUALLY_ATTACHED', () => {
  const valid = {
    promptSnapshotId: S3,
    subject: 'SYNTHETIC subject',
    envelope: { from: SENDER, to: PLATFORM },
    bodyText: 'SYNTHETIC body',
    preparedDocuments: [],
  };

  it('refuses every field a client might use to sign, hash, choose the task or claim readiness', () => {
    expect(CreateCandidateSchema.safeParse(valid).success).toBe(true);
    for (const extra of [
      { signatureState: 'SIGNED' },
      { artifactSha256: HASH_A },
      { bodySha256: HASH_A },
      { taskType: 'NMI_REPLY' },
      { signedAt: '2026-09-26T00:00:00Z' },
      { readiness: 'READY_FOR_SIGNER' },
      { parentCandidateId: S1 },
      { version: 2 },
    ]) {
      expect(
        CreateCandidateSchema.safeParse({ ...valid, ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false);
      expect(
        ReviseCandidateSchema.safeParse({ ...valid, revisionReason: null, ...extra }).success,
      ).toBe(false);
    }
    // A revision names its reason (null allowed); an import may omit it.
    expect(ReviseCandidateSchema.safeParse(valid).success).toBe(false);
    expect(ReviseCandidateSchema.safeParse({ ...valid, revisionReason: null }).success).toBe(true);
  });

  it('a document plan state is REFERENCE_ONLY, PREPARED_FOR_ATTACHMENT, PREVIOUSLY_SUPPLIED or UNKNOWN — never ACTUALLY_ATTACHED, SENT or ATTACHED', () => {
    const plan = {
      sourceId: S1,
      purpose: 'SYNTHETIC',
      state: 'REFERENCE_ONLY',
      disclosureReview: 'PENDING',
    };
    for (const state of [
      'REFERENCE_ONLY',
      'PREPARED_FOR_ATTACHMENT',
      'PREVIOUSLY_SUPPLIED',
      'UNKNOWN',
    ]) {
      expect(DocumentPlanSchema.safeParse({ ...plan, state }).success, state).toBe(true);
    }
    for (const state of ['ACTUALLY_ATTACHED', 'ATTACHED', 'SENT', 'AS_SENT']) {
      expect(DocumentPlanSchema.safeParse({ ...plan, state }).success, state).toBe(false);
    }
  });
});

describe('candidateTextProblem — NUL anywhere is refused before a claim', () => {
  it('names every field holding a NUL (422 VALIDATION_FAILED); any other character is stored as supplied', () => {
    const body = {
      promptSnapshotId: S3,
      subject: 'SYNTHETIC\u0000subject',
      envelope: { from: SENDER, to: PLATFORM },
      bodyText: 'SYNTHETIC body\u0000',
      preparedDocuments: [
        { sourceId: S1, purpose: 'ok', state: 'REFERENCE_ONLY', disclosureReview: 'PENDING' },
        { sourceId: S2, purpose: 'bad\u0000', state: 'UNKNOWN', disclosureReview: 'PENDING' },
      ],
      authoringTool: 'SYNTHETIC\u0000tool',
    };
    const problem = candidateTextProblem(body);
    expect(problem).toBeInstanceOf(ApiError);
    expect(problem?.status).toBe(422);
    expect(problem?.code).toBe('VALIDATION_FAILED');
    const details = problem?.details as { issues: Array<{ path: string }> } | undefined;
    const paths = details?.issues.map((issue) => issue.path);
    expect(paths).toEqual(['subject', 'bodyText', 'preparedDocuments.1.purpose', 'authoringTool']);
    expect(candidateTextProblem({ reason: 'SYNTHETIC\u0000' })?.code).toBe('VALIDATION_FAILED');
    const exotic = '\u0001 ​﻿\t\r\n é <b>html</b> 𝄞';
    expect(
      candidateTextProblem({
        ...body,
        subject: exotic,
        bodyText: exotic,
        preparedDocuments: [],
        authoringTool: null,
      }),
    ).toBeNull();
  });
});

// Prompt fixtures ---------------------------------------------------------------------------------

const promptOf = (view: ContextView, context: ProductionContext = view.context): PromptBinding => ({
  id: S3,
  caseId: view.context.caseId,
  taskType: context.taskType,
  parentBindingId: context.parentBindingId,
  context,
});
const PARENT = reply.context.parentBindingId as string;
const [PRIOR_MESSAGE] = reply.context.priorCorrespondenceIds;
const PARENT_MESSAGE = reply.context.correspondence.find((message) => message.id !== PRIOR_MESSAGE)
  ?.id as string;
const SELECTION = initial.context.authority?.selection;
const envelope = (
  fields: Partial<{
    from: string;
    to: string;
    replyTo: string | null;
    parentBindingId: string | null;
  }> = {},
) => storedEnvelope({ from: SENDER, to: PLATFORM, ...fields });

/** The reply fixture's context with captured attachments on its prior (outbound) and parent (inbound) messages. */
function withAttachments(context: ProductionContext): ProductionContext {
  return {
    ...context,
    correspondence: context.correspondence.map((message) =>
      message.id === PRIOR_MESSAGE
        ? {
            ...message,
            attachmentsManifest: [
              { fileName: 'synthetic-supplied.pdf', sourceId: S1, state: 'COPIED_TEXT_ALLEGATION' },
              { fileName: 'synthetic-unlinked.pdf', state: 'UNKNOWN' },
            ],
          }
        : message.id === PARENT_MESSAGE
          ? {
              ...message,
              attachmentsManifest: [
                { fileName: 'synthetic-platform.pdf', sourceId: S2, state: 'UNKNOWN' },
              ],
            }
          : message,
    ),
  };
}

const refusal = (problem: ApiError | null) =>
  problem === null ? null : [problem.status, problem.code, problem.details];

describe('envelopeProblem — the envelope against the exact prompt snapshot', () => {
  it('the fixtures: an INITIAL prompt without a parent and a reply prompt with one, both pinning the synthetic selection’s mailbox', () => {
    expect(initial.context.taskType).toBe('INITIAL');
    expect(initial.context.parentBindingId).toBeNull();
    expect(reply.context.taskType).toBe('NMI_REPLY');
    expect(PARENT).toMatch(/^[0-9a-f-]{36}$/);
    expect(SELECTION?.intendedFromEmail).toBe(SENDER);
    expect(reply.context.authority?.selection.intendedFromEmail).toBe(SENDER);
  });

  it('INITIAL: no parent binding may be named (none is invented); the sender is exactly the selected mailbox', () => {
    const prompt = promptOf(initial);
    expect(envelopeProblem(prompt, envelope())).toBeNull();
    expect(refusal(envelopeProblem(prompt, envelope({ parentBindingId: PARENT })))).toEqual([
      422,
      'ENVELOPE_PARENT_MISMATCH',
      { field: 'envelope.parentBindingId', promptParentBindingId: null },
    ]);
    for (const from of [
      'SYNTHETIC-SENDER@example.invalid',
      'synthetic-sender@example.invalid ',
      'route-default-signer@example.invalid',
      'better-looking@example.invalid',
    ]) {
      expect(refusal(envelopeProblem(prompt, envelope({ from }))), from).toEqual([
        422,
        'ENVELOPE_SENDER_MISMATCH',
        { field: 'envelope.from', authoritySelectionId: SELECTION?.id },
      ]);
    }
  });

  it('NMI_REPLY: the envelope names exactly the prompt’s parent — missing is REPLY_PARENT_REQUIRED, another is ENVELOPE_PARENT_MISMATCH', () => {
    const prompt = promptOf(reply);
    expect(envelopeProblem(prompt, envelope({ parentBindingId: PARENT }))).toBeNull();
    expect(refusal(envelopeProblem(prompt, envelope()))).toEqual([
      422,
      'REPLY_PARENT_REQUIRED',
      {
        field: 'envelope.parentBindingId',
        reason: 'NOT_IN_ENVELOPE',
        promptParentBindingId: PARENT,
      },
    ]);
    expect(refusal(envelopeProblem(prompt, envelope({ parentBindingId: S1 })))).toEqual([
      422,
      'ENVELOPE_PARENT_MISMATCH',
      { field: 'envelope.parentBindingId', promptParentBindingId: PARENT },
    ]);
    // The recipient and Reply-To are stored as entered: a review question, not a structural one.
    expect(
      envelopeProblem(
        prompt,
        envelope({
          parentBindingId: PARENT,
          to: 'x@example.invalid',
          replyTo: 'y@example.invalid',
        }),
      ),
    ).toBeNull();
  });

  it('a reply prompt prepared without its parent pins no thread: none may be named', () => {
    const prompt = promptOf(reply, { ...reply.context, parentBindingId: null });
    expect(envelopeProblem(prompt, envelope())).toBeNull();
    expect(refusal(envelopeProblem(prompt, envelope({ parentBindingId: PARENT })))).toEqual([
      422,
      'ENVELOPE_PARENT_MISMATCH',
      { field: 'envelope.parentBindingId', promptParentBindingId: null },
    ]);
  });

  it('a prompt without an authority selection pins no mailbox: the sender is stored as entered', () => {
    const prompt = promptOf(initial, {
      ...initial.context,
      authority: null,
      authoritySelectionId: null,
    });
    for (const from of [SENDER, 'anyone@example.invalid']) {
      expect(envelopeProblem(prompt, envelope({ from }))).toBeNull();
    }
  });
});

describe('documentPlanProblem — hashes as recorded, PREVIOUSLY_SUPPLIED only as captured on a prior transmission', () => {
  const plan = (fields: Partial<Parameters<typeof storedDocumentPlan>[0]> = {}) =>
    storedDocumentPlan({
      sourceId: S1,
      purpose: 'SYNTHETIC',
      state: 'REFERENCE_ONLY',
      disclosureReview: 'PENDING',
      ...fields,
    });
  const context = withAttachments(reply.context);
  const recorded = new Map<string, string | null>([
    [S1, HASH_A],
    [S2, null],
    [S3, HASH_B],
  ]);

  it('previously supplied sources are exactly the sources named by the captured attachments of the prior transmissions — not the parent NMI’s, not an attachment without a source', () => {
    expect([...previouslySuppliedSources(context)]).toEqual([S1]);
    expect([...previouslySuppliedSources(reply.context)]).toEqual([]);
    expect([...previouslySuppliedSources(initial.context)]).toEqual([]);
  });

  it('PREVIOUSLY_SUPPLIED needs that record; REFERENCE_ONLY, PREPARED_FOR_ATTACHMENT and UNKNOWN are plans only', () => {
    expect(
      documentPlanProblem([plan({ state: 'PREVIOUSLY_SUPPLIED' })], context, recorded),
    ).toBeNull();
    expect(
      refusal(
        documentPlanProblem(
          [plan(), plan({ sourceId: S2, state: 'PREVIOUSLY_SUPPLIED' })],
          context,
          recorded,
        ),
      ),
    ).toEqual([
      422,
      'DOCUMENT_PLAN_UNSUPPORTED',
      { field: 'preparedDocuments.1.state', reason: 'NOT_RECORDED_AS_SUPPLIED' },
    ]);
    expect(
      refusal(
        documentPlanProblem([plan({ state: 'PREVIOUSLY_SUPPLIED' })], initial.context, recorded),
      ),
    ).toEqual([
      422,
      'DOCUMENT_PLAN_UNSUPPORTED',
      { field: 'preparedDocuments.0.state', reason: 'NOT_RECORDED_AS_SUPPLIED' },
    ]);
    for (const state of ['REFERENCE_ONLY', 'PREPARED_FOR_ATTACHMENT', 'UNKNOWN'] as const) {
      expect(
        documentPlanProblem([plan({ sourceId: S3, state })], initial.context, recorded),
        state,
      ).toBeNull();
    }
  });

  it('a content SHA-256 is exactly the one recorded on the source revision; none recorded means none may be named', () => {
    expect(documentPlanProblem([plan({ contentSha256: HASH_A })], context, recorded)).toBeNull();
    expect(documentPlanProblem([plan({ contentSha256: null })], context, recorded)).toBeNull();
    expect(
      refusal(documentPlanProblem([plan({ contentSha256: HASH_B })], context, recorded)),
    ).toEqual([
      422,
      'DOCUMENT_PLAN_UNSUPPORTED',
      { field: 'preparedDocuments.0.contentSha256', reason: 'HASH_NOT_RECORDED' },
    ]);
    expect(
      refusal(
        documentPlanProblem(
          [plan(), plan({ sourceId: S2, contentSha256: HASH_A })],
          context,
          recorded,
        ),
      ),
    ).toEqual([
      422,
      'DOCUMENT_PLAN_UNSUPPORTED',
      { field: 'preparedDocuments.1.contentSha256', reason: 'HASH_NOT_RECORDED' },
    ]);
  });
});

describe('no AI provider, network, clock or process in the candidates module; the page shows text inert', () => {
  const sources = readdirSync(CANDIDATES_MODULE)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(path.join(CANDIDATES_MODULE, name), 'utf8')] as const);

  it('no module file calls a network, mail, file, process, curl or AI-provider API, and no drafting call exists', () => {
    expect(sources.map(([name]) => name).sort()).toEqual([
      'candidate-artifact.ts',
      'candidate-rules.ts',
      'candidate-views.ts',
      'candidate-write-observer.ts',
      'candidates.controller.ts',
      'candidates.module.ts',
      'candidates.service.ts',
    ]);
    const forbidden =
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|node:(http|https|http2|net|tls|dns|dgram|child_process|fs|os|worker_threads)|\bundici\b|\baxios\b|\bcurl\b|nodemailer|smtp|imap|googleapis|openai|anthropic|gemini|@google\/gen|generativelanguage|bedrock|vertex|mistral|cohere|ollama|langchain|process\.(env|exec|spawn)|\bexecSync\b|\bspawn\s*\(|\beval\s*\(|new Function\s*\(|completions|chat\.create|generateContent/i;
    for (const [name, text] of sources) expect(text, name).not.toMatch(forbidden);
  });

  it('the artifact and the rules read no clock, randomness, locale or environment', () => {
    const pure = sources.filter(([name]) =>
      ['candidate-artifact.ts', 'candidate-rules.ts'].includes(name),
    );
    expect(pure).toHaveLength(2);
    for (const [name, text] of pure) {
      expect(text, name).not.toMatch(
        /\bDate\b|Math\.random|randomUUID|randomBytes|performance\.|process\.|toLocale|Intl\.|localeCompare|\.normalize\(|\.trim\(|hostname/,
      );
    }
  });

  it('nothing writes a signed, adopted, approved, G7 or ready state; the signature state written is the HUMAN_PENDING constant', () => {
    for (const [name, text] of sources) {
      expect(text, name).not.toMatch(
        /'(SIGNED|ADOPTED|APPROVED|G7_COMPLETE|READY_FOR_SIGNER|ACTUALLY_ATTACHED|AS_SENT)'/,
      );
    }
    const service = sources.find(([name]) => name === 'candidates.service.ts')?.[1] ?? '';
    expect(service.match(/signatureState:/g)).toHaveLength(2);
    expect(service).toContain('signatureState: CANDIDATE_SIGNATURE_STATE,');
    expect(service).toContain('signatureState: row.signatureState,');
  });

  it('the web candidate pages reach only the application API and never render stored text as HTML', () => {
    const page = readFileSync(path.join(repoRoot, 'apps/web/src/app/cases/candidates.tsx'), 'utf8');
    expect(page).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|openai|anthropic|gemini|generativelanguage|bedrock|mistral|cohere|ollama|langchain|https?:\/\/|dangerouslySetInnerHTML|innerHTML|\beval\s*\(/i,
    );
    const client = readFileSync(path.join(repoRoot, 'apps/web/src/app/api/directory.ts'), 'utf8');
    const candidates = client.slice(
      client.indexOf('    candidates: {'),
      client.indexOf('    reportedItems: child'),
    );
    expect(candidates).toContain(
      "api.request<NoticeCandidate>('POST', `${base}/${caseId}/candidates`",
    );
    expect(candidates).not.toMatch(/\bfetch\s*\(|https?:\/\//);
  });
});
