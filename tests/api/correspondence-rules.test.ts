// Correspondence rules (P4C) that need no database: the request-only capture checks (capture
// posture, the body digest input, instant storability), the body digest itself, the item rule of
// outcomes, the redacted audit record, and the module's source: no network, mail, Drive or process
// client exists. Database behaviour of the same rules is covered over HTTP in
// tests/db/p4c-http.test.ts.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  BindCorrespondence,
  CreateCorrespondence,
} from '../../packages/contracts/src/index.js';
import {
  BindCorrespondenceSchema,
  CreateCorrespondenceSchema,
} from '../../packages/contracts/src/index.js';
import type { Correspondence } from '../../apps/api/generated/prisma/client.js';
import { ApiError } from '../../apps/api/src/infrastructure/http/api-error.js';
import { bindingProblem } from '../../apps/api/src/modules/correspondence/correspondence-bindings.service.js';
import {
  bodySha256,
  captureAuditRecord,
  captureProblem,
  captureSourceUses,
} from '../../apps/api/src/modules/correspondence/correspondence-rules.js';

const AGENCY = '0f8fad5b-d9cb-469f-a165-70867728950e';
const SOURCE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OTHER_SOURCE = '16fd2706-8baf-433b-82eb-8c7fada847da';
const ITEM = '886313e1-3b8a-4372-9b90-0c9aee199e5d';
const MESSAGE = 'a3bb189e-8bf9-4888-9912-ace4e6543002';

const capture = (body: Partial<CreateCorrespondence> = {}): CreateCorrespondence => {
  const parsed = CreateCorrespondenceSchema.safeParse({
    agencyId: AGENCY,
    mailboxAddress: 'notices@example.invalid',
    direction: 'INBOUND',
    subject: 'SYNTHETIC subject',
    captureMode: 'COPIED_FULL_TEXT',
    ...body,
  });
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return parsed.data;
};

const bind = (body: Partial<BindCorrespondence>): BindCorrespondence => {
  const parsed = BindCorrespondenceSchema.safeParse({
    correspondenceId: MESSAGE,
    eventType: 'OTHER',
    ...body,
  });
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return parsed.data;
};

function refusal(problem: ApiError | null) {
  if (!(problem instanceof ApiError)) return null;
  return [problem.status, problem.code, problem.details];
}

describe('capture posture — recorded as supplied, refused only where the record contradicts itself', () => {
  it('RAW_SOURCE references its raw source (raw MIME is referenced, not invented)', () => {
    expect(refusal(captureProblem(capture({ captureMode: 'RAW_SOURCE' })))).toEqual([
      422,
      'CAPTURE_POSTURE_UNSUPPORTED',
      { field: 'rawSourceId', reason: 'RAW_SOURCE_NOT_REFERENCED' },
    ]);
    expect(
      refusal(captureProblem(capture({ captureMode: 'RAW_SOURCE', rawSourceId: null }))),
    ).toEqual([
      422,
      'CAPTURE_POSTURE_UNSUPPORTED',
      { field: 'rawSourceId', reason: 'RAW_SOURCE_NOT_REFERENCED' },
    ]);
    expect(captureProblem(capture({ captureMode: 'RAW_SOURCE', rawSourceId: SOURCE }))).toBeNull();
  });

  it('an attachment observed in raw MIME needs the raw source; an allegation or unknown state does not', () => {
    const attachments = [
      { fileName: 'a.pdf', state: 'COPIED_TEXT_ALLEGATION' as const },
      { fileName: 'b.pdf', state: 'OBSERVED_IN_RAW_MIME' as const },
    ];
    expect(refusal(captureProblem(capture({ attachmentsManifest: attachments })))).toEqual([
      422,
      'CAPTURE_POSTURE_UNSUPPORTED',
      { field: 'attachmentsManifest.1.state', reason: 'RAW_MIME_NOT_REFERENCED' },
    ]);
    expect(
      captureProblem(capture({ attachmentsManifest: attachments, rawSourceId: SOURCE })),
    ).toBeNull();
    expect(
      captureProblem(
        capture({
          attachmentsManifest: [
            { fileName: 'a.pdf', state: 'COPIED_TEXT_ALLEGATION' },
            { fileName: 'c.pdf', state: 'UNKNOWN' },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('an excerpt is not the full message; every other mode and body role combination is recorded', () => {
    expect(
      refusal(captureProblem(capture({ captureMode: 'EXCERPT', bodyRole: 'FULL_MESSAGE' }))),
    ).toEqual([
      422,
      'CAPTURE_POSTURE_UNSUPPORTED',
      { field: 'bodyRole', reason: 'EXCERPT_NOT_FULL_MESSAGE' },
    ]);
    const modes = ['RAW_SOURCE', 'COPIED_FULL_TEXT', 'EXCERPT', 'OPERATOR_REPORTED'] as const;
    const roles = [
      'FULL_MESSAGE',
      'AUTHORED_BODY',
      'QUOTED_HISTORY',
      'EXCERPT',
      'UNKNOWN',
    ] as const;
    let accepted = 0;
    for (const captureMode of modes) {
      for (const bodyRole of roles) {
        const problem = captureProblem(capture({ captureMode, bodyRole, rawSourceId: SOURCE }));
        if (captureMode === 'EXCERPT' && bodyRole === 'FULL_MESSAGE') {
          expect(problem, `${captureMode}/${bodyRole}`).not.toBeNull();
        } else {
          expect(problem, `${captureMode}/${bodyRole}`).toBeNull();
          accepted += 1;
        }
      }
    }
    expect(accepted).toBe(19);
  });

  it('demands nothing to make a record look stronger: no body, raw source, date or address is required', () => {
    for (const captureMode of ['COPIED_FULL_TEXT', 'EXCERPT', 'OPERATOR_REPORTED'] as const) {
      expect(captureProblem(capture({ captureMode })), captureMode).toBeNull();
    }
    // A raw source pointer with a weaker capture mode is kept as recorded, never an upgrade.
    expect(
      captureProblem(capture({ captureMode: 'OPERATOR_REPORTED', rawSourceId: SOURCE })),
    ).toBeNull();
  });
});

describe('body text — exact, digest of the recorded text only', () => {
  it('bodySha256 is SHA-256 of the exact UTF-8 bytes, null without a body', () => {
    expect(bodySha256(null)).toBeNull();
    expect(bodySha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(bodySha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    // Not trimmed, not newline- or Unicode-normalized: each spelling has its own digest.
    const variants = [
      'Hello\r\nWorld  ',
      'Hello\nWorld  ',
      'Hello\r\nWorld',
      'Café',
      'Café',
      '<script>alert(1)</script>',
    ];
    const digests = variants.map((text) => bodySha256(text));
    expect(new Set(digests).size).toBe(variants.length);
    for (const text of variants) {
      expect(bodySha256(text)).toBe(
        createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
      );
    }
  });

  it('a NUL in the body is refused before anything is written (exact-text digest rule)', () => {
    expect(refusal(captureProblem(capture({ bodyText: 'a\u0000b' })))).toEqual([
      422,
      'VALIDATION_FAILED',
      { issues: [{ path: 'bodyText', message: 'Contains a NUL character, which is not stored' }] },
    ]);
    expect(captureProblem(capture({ bodyText: 'a\tb\r\n ' }))).toBeNull();
  });

  it('occurredAt follows the shared storability rule; headerDateRaw is raw text and never checked as a date', () => {
    expect(refusal(captureProblem(capture({ occurredAt: '2026-06-30T23:59:60Z' })))?.[1]).toBe(
      'VALIDATION_FAILED',
    );
    expect(refusal(captureProblem(capture({ occurredAt: '2026-06-30T12:00:00.1234Z' })))?.[1]).toBe(
      'VALIDATION_FAILED',
    );
    expect(captureProblem(capture({ occurredAt: '2026-06-30T12:00:00.123000+07:00' }))).toBeNull();
    expect(captureProblem(capture({ headerDateRaw: 'not a date at all, 31 Feb 99' }))).toBeNull();
  });
});

describe('cited sources of a capture', () => {
  it('the raw source and each attachment source, with the request path of each', () => {
    expect(
      captureSourceUses(
        capture({
          rawSourceId: SOURCE,
          attachmentsManifest: [
            { fileName: 'a.pdf', state: 'UNKNOWN' },
            { fileName: 'b.pdf', state: 'UNKNOWN', sourceId: OTHER_SOURCE },
            { fileName: 'c.pdf', state: 'UNKNOWN', sourceId: null },
          ],
        }),
      ),
    ).toEqual([
      { field: 'rawSourceId', sourceId: SOURCE },
      { field: 'attachmentsManifest.1.sourceId', sourceId: OTHER_SOURCE },
    ]);
    expect(captureSourceUses(capture())).toEqual([]);
  });
});

describe('outcomes are item-specific (INVARIANTS §4, DOMAIN_MODEL_v1 §13)', () => {
  it('an OUTCOME event names one reported item', () => {
    expect(refusal(bindingProblem(bind({ eventType: 'OUTCOME' })))).toEqual([
      422,
      'OUTCOME_ITEM_REQUIRED',
      { field: 'reportedItemId', reason: 'OUTCOME_EVENT' },
    ]);
    expect(
      refusal(
        bindingProblem(bind({ eventType: 'OUTCOME', outcome: 'REMOVED', reportedItemId: null })),
      ),
    ).toEqual([422, 'OUTCOME_ITEM_REQUIRED', { field: 'reportedItemId', reason: 'OUTCOME_EVENT' }]);
    expect(bindingProblem(bind({ eventType: 'OUTCOME', reportedItemId: ITEM }))).toBeNull();
    // An OUTCOME binding may leave the outcome unclassified: nothing is inferred.
    expect(
      bindingProblem(bind({ eventType: 'OUTCOME', reportedItemId: ITEM, outcome: null })),
    ).toBeNull();
  });

  it('any recorded outcome names one reported item, whatever the event type (no case-wide outcome)', () => {
    for (const eventType of ['ACK', 'NMI', 'OTHER', 'REPLY_AS_SENT'] as const) {
      expect(refusal(bindingProblem(bind({ eventType, outcome: 'REMOVED' }))), eventType).toEqual([
        422,
        'OUTCOME_ITEM_REQUIRED',
        { field: 'reportedItemId', reason: 'OUTCOME_VALUE' },
      ]);
      expect(
        bindingProblem(bind({ eventType, outcome: 'REMOVED', reportedItemId: ITEM })),
        eventType,
      ).toBeNull();
    }
  });

  it('every other event type needs no item and no outcome; nothing is inferred from the direction', () => {
    for (const eventType of [
      'INITIAL_AS_SENT',
      'ACK',
      'NMI',
      'REPLY_AS_SENT',
      'SUPPLEMENT_AS_SENT',
      'CORRECTION_AS_SENT',
      'OTHER',
    ] as const) {
      expect(bindingProblem(bind({ eventType })), eventType).toBeNull();
    }
  });
});

describe('the capture audit record keeps no private content', () => {
  it('identifiers, modes, the body hash and lengths only — no body, subject, address or file name', () => {
    const body = 'SYNTHETIC private body text';
    const row = {
      id: MESSAGE,
      agencyId: AGENCY,
      mailboxAddress: 'notices@example.invalid',
      direction: 'INBOUND',
      subject: 'SYNTHETIC private subject',
      messageId: '<synthetic-1@example.invalid>',
      inReplyTo: '<synthetic-0@example.invalid>',
      references: ['<synthetic-0@example.invalid>'],
      sourceIdentityHash: null,
      captureMode: 'COPIED_FULL_TEXT',
      bodyRole: 'FULL_MESSAGE',
      bodyText: body,
      bodySha256: bodySha256(body),
      rawSourceId: SOURCE,
      attachmentsManifest: [
        { fileName: 'synthetic-private-name.pdf', state: 'OBSERVED_IN_RAW_MIME' },
        { fileName: 'second.pdf', state: 'COPIED_TEXT_ALLEGATION' },
      ],
      headerDateRaw: 'Tue, 1 Sep 2026 10:00:00 +0000',
      occurredAt: new Date('2026-09-01T10:00:00.000Z'),
      timestampPrecision: 'SECOND',
      fromAddress: 'sender@example.invalid',
      toAddress: 'notices@example.invalid',
      replyToAddress: 'reply@example.invalid',
      limitations: 'SYNTHETIC limitation text',
      createdAt: new Date('2026-09-25T10:00:00.000Z'),
      createdById: ITEM,
    } as unknown as Correspondence;
    const record = captureAuditRecord(row);
    const text = JSON.stringify(record);
    for (const secret of [
      body,
      'SYNTHETIC private subject',
      'synthetic-1@example.invalid',
      'synthetic-0@example.invalid',
      'notices@example.invalid',
      'sender@example.invalid',
      'reply@example.invalid',
      'synthetic-private-name.pdf',
      'Tue, 1 Sep',
      'SYNTHETIC limitation text',
    ]) {
      expect(text, secret).not.toContain(secret);
    }
    expect(record).toMatchObject({
      agencyId: AGENCY,
      direction: 'INBOUND',
      captureMode: 'COPIED_FULL_TEXT',
      bodyRole: 'FULL_MESSAGE',
      bodySha256: bodySha256(body),
      rawSourceId: SOURCE,
      occurredAt: '2026-09-01T10:00:00.000Z',
      timestampPrecision: 'SECOND',
      bodyText: { redacted: true, codePoints: [...body].length },
      subject: { redacted: true, codePoints: 25 },
      references: { redacted: true, count: 1 },
      attachments: { count: 2, states: { OBSERVED_IN_RAW_MIME: 1, COPIED_TEXT_ALLEGATION: 1 } },
    });
    expect(Object.keys(record)).not.toContain('sourceIdentityHash');
  });
});

describe('capture is not a send: the correspondence module has no network, mail, Drive or process client', () => {
  const root = new URL('../../apps/api/src/modules/correspondence/', import.meta.url);
  const files = readdirSync(root).filter((file) => file.endsWith('.ts'));

  it('imports only the shared write layer, contracts and its sibling case and source rules', () => {
    expect(files.sort()).toEqual([
      'correspondence-bindings.service.ts',
      'correspondence-rules.ts',
      'correspondence-views.ts',
      'correspondence.controller.ts',
      'correspondence.module.ts',
      'correspondence.service.ts',
    ]);
    const forbidden =
      /from ['"](node:)?(http|https|http2|net|tls|dns|dgram|child_process|worker_threads)['"]|\bfetch\(|XMLHttpRequest|WebSocket|nodemailer|smtp|imap|pop3|googleapis|gmail|drive\.|sendMail|axios|undici/i;
    for (const file of files) {
      const text = readFileSync(new URL(file, root), 'utf8');
      const code = text
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
        .join('\n');
      expect(code, file).not.toMatch(forbidden);
      for (const [, specifier] of code.matchAll(/from ['"]([^'"]+)['"]/g)) {
        expect(specifier, file).toMatch(
          /^(node:crypto|@nestjs\/common|@tb\/contracts|\.\.\/\.\.\/\.\.\/generated\/prisma\/client\.js|\.\.\/\.\.\/infrastructure\/|\.\.\/(directory|sources|cases)\/|\.\/)/,
        );
      }
    }
  });

  it('the API package declares no mail, mailbox, HTTP-client or Google client dependency', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../apps/api/package.json', import.meta.url), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    for (const name of names) {
      expect(name).not.toMatch(
        /mail|smtp|imap|pop3|googleapis|gmail|drive|axios|got$|node-fetch|undici|superagent/i,
      );
    }
  });
});
