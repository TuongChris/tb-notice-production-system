// Shared UI test support: a synthetic in-memory API (fake fetch) that enforces the same request
// contract as the server — session CSRF token, one Idempotency-Key per write, the exact If-Match
// ETag of the precondition target (428 missing, 412 stale) — plus rendering and interaction
// helpers. The representation-authority records (P3B) follow the server's main rules: the parent
// ETag as precondition of a child create, FROZEN_VERSION for any change under a frozen version,
// version numbers max+1, append-only events and a frozen coverage of the same route as a route's
// preferred coverage. Cases (P4A) follow the case rules the pages rely on: the case's ETag as the
// precondition of its commands, links and selections, the link's own ETag for a link-state change,
// read-only archived cases, route binding only to a linked route of the case's agency, and
// append-only selections of frozen coverage that records the chosen signer; a selection is read back
// only under its own case, with its stored coverage rows in ascending coverageId order
// (getCaseAuthoritySelection, TB-SCHEMA-API-v1.1.0). Case intake (P4B) follows the rules the intake
// pages rely on: children found only under their own case (404 otherwise), the case's ETag for new
// children and fact revisions, the child's own ETag for edits and archive/restore, YouTube video
// addresses only, this case's unarchived works and items for a mapping, exact millisecond strings,
// immutable fact revisions (current revisions in lists, REVISION_NOT_HEAD for an earlier one) and
// fact supports stored but — as in the contract — never returned. All data is synthetic.
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach } from 'vitest';
import { createApiClient } from '../../apps/web/src/app/api/client.js';
import { App } from '../../apps/web/src/app/App.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export type Kind =
  | 'Agency'
  | 'Owner'
  | 'LegalSubject'
  | 'Signer'
  | 'OwnerSubject'
  | 'Route'
  | 'Mandate'
  | 'MandateVersion'
  | 'MandateCoverage'
  | 'CoverageSigner'
  | 'CaseRecord'
  | 'CaseSource'
  | 'ReportedItem'
  | 'CaseWork'
  | 'UseMapping';
export type Row = Record<string, unknown> & { id: string; rowVersion: number };

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export const USER_ID = '00000000-0000-4000-8000-0000000000a1';
export const NOW = '2026-09-24T09:00:00.000Z';
export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
export const failure = (status: number, code: string, details: Record<string, unknown> = {}) =>
  json(status, { error: { code, message: `synthetic ${code}`, details, requestId: 'r' } });

/** Identity-defining fields the server locks once a record is established (decision D3, R5). */
export const IDENTITY_FIELDS: Partial<Record<Kind, readonly string[]>> = {
  Agency: [
    'legalName',
    'organizationType',
    'jurisdictionCountry',
    'registrationAuthority',
    'registrationNumber',
  ],
  LegalSubject: [
    'legalName',
    'legalForm',
    'jurisdictionCountry',
    'registrationAuthority',
    'registrationNumber',
  ],
};

const COLLECTIONS: Record<string, Kind> = {
  agencies: 'Agency',
  owners: 'Owner',
  'legal-subjects': 'LegalSubject',
  signers: 'Signer',
  routes: 'Route',
  mandates: 'Mandate',
};

/** Fields the authority children do not have (they carry no binding, notes or archive flag). */
const NOT_ON_CHILDREN = [
  'canonicalCode',
  'canonicalSourceId',
  'bindingState',
  'notes',
  'archivedAt',
  'archiveReason',
];

/** Fields of a SourceReferenceSummary (list DTO). */
const SUMMARY_FIELDS = [
  'id',
  'agencyId',
  'sourceGroupId',
  'revision',
  'supersedesSourceId',
  'title',
  'canonicalUrl',
  'sourceRole',
  'accessState',
  'contentSha256',
  'hashTarget',
  'reportedProvenance',
  'observedAt',
  'reviewedAt',
  'createdAt',
];

/** Fields of a CaseFactSummary (list DTO): no value, texts or supports. */
const FACT_SUMMARY_FIELDS = [
  'id',
  'caseId',
  'factGroupId',
  'revision',
  'supersedesFactId',
  'factType',
  'scopeKind',
  'caseWorkId',
  'reportedItemId',
  'mappingId',
  'provenance',
  'resolutionState',
  'createdAt',
];

/** Case intake path segments (P4B) and the record kind each one holds. */
const INTAKE_SEGMENTS = new Map<string, Kind | 'CaseFact'>([
  ['reported-items', 'ReportedItem'],
  ['works', 'CaseWork'],
  ['mappings', 'UseMapping'],
  ['facts', 'CaseFact'],
]);

/** The YouTube video id of an address, or the refusal reason (the server's recognize-or-reject). */
function videoIdOf(rawUrl: string): { id: string } | { reason: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { reason: 'UNPARSEABLE' };
  }
  const id =
    url.hostname === 'youtu.be'
      ? url.pathname.slice(1)
      : ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
        ? url.pathname === '/watch'
          ? (url.searchParams.get('v') ?? '')
          : (/^\/(shorts|live)\/([^/]*)$/.exec(url.pathname)?.[2] ?? '')
        : null;
  if (id === null) return { reason: 'NOT_YOUTUBE' };
  if (id === '') return { reason: 'NOT_A_VIDEO_URL' };
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? { id } : { reason: 'INVALID_VIDEO_ID' };
}

/** Synthetic backend with the directory's request rules. */
export class FakeDirectory {
  readonly csrfToken = 'synthetic-csrf-token-000000000000000000000';
  readonly requests: RecordedRequest[] = [];
  readonly rows: Record<Kind, Map<string, Row>> = {
    Agency: new Map(),
    Owner: new Map(),
    LegalSubject: new Map(),
    Signer: new Map(),
    OwnerSubject: new Map(),
    Route: new Map(),
    Mandate: new Map(),
    MandateVersion: new Map(),
    MandateCoverage: new Map(),
    CoverageSigner: new Map(),
    CaseRecord: new Map(),
    CaseSource: new Map(),
    ReportedItem: new Map(),
    CaseWork: new Map(),
    UseMapping: new Map(),
  };
  /** Immutable case fact revisions (no ETag, no row version), in recording order. */
  readonly facts: Array<Record<string, unknown> & { id: string }> = [];
  /** The supports each fact revision was recorded with: stored, never returned (contract gap). */
  readonly factSupports = new Map<string, unknown[]>();
  /** Append-only case authority selections (no ETag, no row version), in recording order. */
  readonly selections: Array<Record<string, unknown> & { id: string }> = [];
  /** The CaseAuthorityCoverage rows each selection pinned, as the contract returns them. */
  readonly pinned = new Map<string, Array<Record<string, unknown> & { coverageId: string }>>();
  /** Append-only authority events (no ETag, no row version), in recording order. */
  readonly events: Array<Record<string, unknown> & { id: string }> = [];
  /** Immutable SourceReference revisions (no ETag, no row version). */
  readonly sources = new Map<string, Record<string, unknown> & { id: string }>();
  /** Canonical-binding refusals the server would give for a record id (e.g. owner material). */
  readonly bindingRefusals = new Map<
    string,
    { status: number; code: string; details?: Record<string, unknown> }
  >();
  /** Records the server refuses to delete, with their blockers. */
  readonly deleteBlockers = new Map<string, string[]>();
  /** Records the server knows to be established (e.g. referenced), with the reasons. */
  readonly established = new Map<string, string[]>();
  pageSize: number | null = null;
  failNextCsrf = false;
  sessionGone = false;
  holdLists = false;
  failLists = false;
  private sequence = 0;

  id(): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`;
  }

  seed(kind: Kind, fields: Record<string, unknown>): Row {
    const id = this.id();
    const base: Row = {
      id,
      rowVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      createdById: USER_ID,
      updatedById: USER_ID,
      canonicalCode: null,
      canonicalSourceId: null,
      bindingState: 'LOCAL_ONLY',
      notes: null,
      archivedAt: null,
      archiveReason: null,
    };
    const defaults: Record<Kind, Record<string, unknown>> = {
      Agency: {
        displayName: 'x',
        legalName: null,
        organizationType: null,
        jurisdictionCountry: null,
        registrationAuthority: null,
        registrationNumber: null,
        websiteUrl: null,
        copyrightEmail: null,
        verificationEmail: null,
        postalAddress: null,
        phone: null,
        driveRootUrl: null,
        masterUrl: null,
        startHereUrl: null,
        fieldAttributions: null,
        recordState: 'DRAFT',
      },
      Owner: {
        displayName: 'x',
        aliases: null,
        contactName: null,
        contactEmail: null,
        sourceChannels: null,
        websiteUrl: null,
        preferredLanguage: null,
        driveFolderUrl: null,
        recordState: 'DRAFT',
      },
      LegalSubject: {
        subjectType: 'LEGAL_ENTITY',
        legalName: 'x',
        aliases: null,
        jurisdictionCountry: null,
        legalForm: null,
        registrationAuthority: null,
        registrationNumber: null,
        contactEmail: null,
        postalAddress: null,
        fieldAttributions: null,
        identityReviewState: 'UNREVIEWED',
        recordState: 'DRAFT',
      },
      Signer: {
        agencyId: '',
        fullLegalName: 'x',
        title: null,
        contactEmail: null,
        identitySourceId: null,
        delegationSourceId: null,
        operationalState: 'DRAFT',
      },
      OwnerSubject: {
        ownerId: '',
        legalSubjectId: '',
        relationshipLabel: null,
        sourceId: null,
        linkState: 'LINKED',
        unlinkedAt: null,
        unlinkReason: null,
      },
      Route: {
        agencyId: '',
        ownerSubjectId: '',
        platform: 'YOUTUBE',
        linkState: 'LINKED',
        defaultSignerId: null,
        preferredCoverageId: null,
        casePrefixHint: null,
        unlinkedAt: null,
        stateReason: null,
      },
      Mandate: {
        agencyId: '',
        label: 'x',
        externalReference: null,
        description: null,
      },
      MandateVersion: {
        mandateId: '',
        agencyId: '',
        version: 1,
        versionState: 'DRAFT',
        changeKind: 'NEW_AUTHORIZATION',
        predecessorId: null,
        primarySourceId: null,
        additionalSourceRefs: null,
        documentState: 'UNKNOWN',
        sourceReviewState: 'UNREVIEWED',
        signedDatesRaw: null,
        validityModel: 'UNKNOWN',
        effectiveOn: null,
        expiresOn: null,
        validityNotes: null,
        frozenAt: null,
        changeReason: 'x',
      },
      MandateCoverage: {
        mandateVersionId: '',
        routeId: '',
        agencyId: '',
        coverageLabel: 'x',
        coveredWorksScope: null,
        territorialScope: null,
        actionScope: null,
        exclusions: null,
        conditions: null,
        exclusivity: 'UNKNOWN',
        effectiveOn: null,
        expiresOn: null,
        basisSourceId: null,
        predecessorCoverageId: null,
      },
      CoverageSigner: {
        coverageId: '',
        agencyId: '',
        signerId: '',
        capacity: 'x',
        actionScope: null,
        sourceId: null,
        effectiveOn: null,
        endsOn: null,
        limitations: null,
      },
      CaseRecord: {
        agencyId: '',
        platform: 'YOUTUBE',
        intakeLabel: 'x',
        ownerHintId: null,
        routeId: null,
        canonicalCaseId: null,
        canonicalBindingSourceId: null,
        caseClass: 'WORKING_INTAKE',
        workflowState: 'INTAKE',
        currentAuthoritySelectionId: null,
        packetSourceId: null,
        driveFolderUrl: null,
        contextRevision: 1,
        closedAt: null,
        closeReason: null,
      },
      CaseSource: {
        caseId: '',
        sourceId: '',
        useRole: 'x',
        scopeNote: 'x',
        linkState: 'LINKED',
        stateReason: null,
      },
      ReportedItem: {
        caseId: '',
        rawUrl: 'https://www.youtube.com/watch?v=SYNTHETIC00',
        normalizedUrl: 'https://www.youtube.com/watch?v=SYNTHETIC00',
        externalItemId: 'SYNTHETIC00',
        displayTitle: null,
        observedAt: null,
      },
      CaseWork: {
        caseId: '',
        title: 'x',
        sourceUrl: null,
        externalWorkId: null,
        workType: null,
      },
      UseMapping: {
        caseId: '',
        caseWorkId: '',
        reportedItemId: '',
        occurrence: 1,
        sourceStartMs: null,
        sourceEndMs: null,
        reportedStartMs: null,
        reportedEndMs: null,
        rawTimecodes: null,
        boundaryConvention: 'UNKNOWN',
        provenance: 'MISSING',
        basisSourceId: null,
        limitations: null,
      },
    };
    const row = { ...base, ...defaults[kind], ...fields } as Row;
    if (
      kind === 'OwnerSubject' ||
      kind === 'MandateVersion' ||
      kind === 'MandateCoverage' ||
      kind === 'CoverageSigner' ||
      kind === 'CaseSource'
    ) {
      for (const key of NOT_ON_CHILDREN) delete row[key];
    }
    if (kind === 'CaseRecord' || kind === 'CaseWork') {
      for (const key of ['canonicalCode', 'canonicalSourceId', 'bindingState']) delete row[key];
    }
    if (kind === 'ReportedItem' || kind === 'UseMapping') {
      for (const key of ['canonicalCode', 'canonicalSourceId', 'bindingState', 'notes']) {
        delete row[key];
      }
    }
    this.rows[kind].set(id, row);
    return row;
  }

  /** A synthetic SourceReference revision (defaults: a shared canonical record, revision 1). */
  seedSource(fields: Record<string, unknown> = {}): Record<string, unknown> & { id: string } {
    const id = this.id();
    const row = {
      id,
      agencyId: null,
      sourceGroupId: this.id(),
      revision: 1,
      supersedesSourceId: null,
      title: 'SYNTHETIC source',
      canonicalUrl: null,
      providerFileId: null,
      providerRevisionId: null,
      sourceRole: 'CANONICAL_RECORD',
      accessState: 'NOT_CHECKED',
      contentSha256: null,
      hashTarget: null,
      reportedProvenance: 'OPERATOR_REPORTED',
      rawProvenance: null,
      scopeText: 'Synthetic scope',
      scopeBindings: null,
      observedAt: null,
      reviewedByLabel: null,
      reviewedAt: null,
      excerpt: null,
      excerptLocator: null,
      limitations: null,
      createdAt: NOW,
      createdById: USER_ID,
      ...fields,
    };
    this.sources.set(id, row);
    return row;
  }

  /** A synthetic case fact revision (defaults: revision 1 of a new chain about the whole case). */
  seedFact(fields: Record<string, unknown>): Record<string, unknown> & { id: string } {
    const id = this.id();
    const row = {
      id,
      caseId: '',
      factGroupId: this.id(),
      revision: 1,
      supersedesFactId: null,
      factType: 'WORK_IDENTIFICATION',
      scopeKind: 'CASE',
      caseWorkId: null,
      reportedItemId: null,
      mappingId: null,
      value: { description: 'SYNTHETIC description', limitations: '' },
      provenance: 'OPERATOR_REPORTED',
      rawProvenance: null,
      resolutionState: 'UNASSESSED',
      assertedByLabel: null,
      assertedAsOf: null,
      scopeText: 'SYNTHETIC scope',
      limitations: null,
      changeReason: 'SYNTHETIC reason',
      createdAt: NOW,
      createdById: USER_ID,
      ...fields,
    };
    this.facts.push(row);
    return row;
  }

  /** A synthetic append-only authority event of a mandate. */
  seedEvent(fields: Record<string, unknown>): Record<string, unknown> & { id: string } {
    const row = {
      id: this.id(),
      mandateId: '',
      agencyId: '',
      coverageId: null,
      eventType: 'CURRENTNESS_RECORDED',
      sourceId: '',
      provenance: 'OPERATOR_REPORTED',
      effectiveOn: null,
      effectiveAt: null,
      rawEffectiveText: null,
      scopeText: 'Synthetic scope',
      supersedesEventId: null,
      interpretation: 'Synthetic reading',
      createdAt: NOW,
      createdById: USER_ID,
      ...fields,
    };
    this.events.push(row);
    return row;
  }

  etag(kind: Kind, row: Row): string {
    return `"${kind}:${row.id}:v${row.rowVersion}"`;
  }

  /** Simulates a change made elsewhere (another tab): the version moves on. */
  touch(kind: Kind, id: string, fields: Record<string, unknown> = {}): void {
    const row = this.rows[kind].get(id);
    if (!row) throw new Error('no such row');
    Object.assign(row, fields, { rowVersion: row.rowVersion + 1 });
  }

  readonly fetch = async (path: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET';
    const headers = { ...(init.headers as Record<string, string>) };
    const body = init.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown);
    this.requests.push({ method, path, headers, body });
    const meta = { requestId: 'synthetic', affectedResources: [] };
    const url = new URL(path, 'http://app.invalid');
    if (url.pathname === '/api/v1/health') return json(200, { data: { status: 'ok' }, meta });
    if (url.pathname === '/api/v1/auth/session') {
      if (this.sessionGone) return failure(401, 'SESSION_REQUIRED');
      return json(200, {
        data: {
          user: {
            id: USER_ID,
            email: 'p2-ui@example.invalid',
            displayName: 'Synthetic P2 UI User',
            enabled: true,
            passwordChangedAt: null,
            disabledAt: null,
            createdAt: NOW,
          },
          expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
          csrfToken: this.csrfToken,
        },
        meta,
      });
    }
    if (this.sessionGone) return failure(401, 'SESSION_REQUIRED');
    if (method !== 'GET') {
      if (this.failNextCsrf) {
        this.failNextCsrf = false;
        return failure(403, 'CSRF_TOKEN_INVALID');
      }
      if (headers['X-CSRF-Token'] !== this.csrfToken) return failure(403, 'CSRF_TOKEN_INVALID');
      if (!headers['Idempotency-Key']) return failure(400, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    const parts = url.pathname.replace('/api/v1/', '').split('/');
    const [collection, id, action, childId, childAction] = parts;
    if (collection === 'sources') return this.sourceRequest(method, id, action, url, body);
    if (collection === 'cases' && id && action && INTAKE_SEGMENTS.has(action)) {
      return this.intakeRequest(method, id, action, childId, childAction, url, headers, body);
    }
    if (collection === 'cases') {
      return this.caseRequest(method, id, action, url, headers, body, childId);
    }
    if (collection === 'case-sources' && id) {
      return this.caseSourceRequest(method, id, action, headers, body);
    }
    if (collection === 'mandates' && id && (action === 'versions' || action === 'events')) {
      return this.mandateChildren(method, id, action, url, headers, body);
    }
    if (collection === 'mandate-versions' && id) {
      return this.versionRequest(method, id, action, url, headers, body);
    }
    if (collection === 'coverages' && id) {
      return this.coverageRequest(method, id, action, url, headers, body);
    }
    if (collection === 'coverage-signers' && id) {
      return this.coverageSignerRequest(method, id, headers);
    }
    if (collection === 'owner-subjects' && id)
      return this.ownerSubject(method, id, action, headers, body);
    if (collection === 'owners' && id && action === 'subjects') {
      return this.ownerSubjects(method, id, url, headers, body);
    }
    const kind = collection ? COLLECTIONS[collection] : undefined;
    if (!kind) return failure(404, 'NOT_FOUND');
    if (!id) {
      if (method === 'GET') return this.list(kind, url);
      return this.create(kind, body as Record<string, unknown>);
    }
    const row = this.rows[kind].get(id);
    if (!row) return failure(404, 'NOT_FOUND');
    if (method === 'GET' && action === undefined) {
      return json(200, { data: row, meta }, { ETag: this.etag(kind, row) });
    }
    const precondition = this.precondition(kind, row, headers);
    if (precondition) return precondition;
    if (method === 'DELETE') {
      const blockers = this.deleteBlockers.get(id);
      if (blockers) return failure(409, 'REFERENCED_RECORD_CANNOT_DELETE', { blockers });
      this.rows[kind].delete(id);
      return new Response(null, { status: 204 });
    }
    const change = (fields: Record<string, unknown>) => {
      Object.assign(row, fields, { rowVersion: row.rowVersion + 1, updatedAt: NOW });
      return json(200, { data: row, meta }, { ETag: this.etag(kind, row) });
    };
    const request = body as Record<string, unknown>;
    if (method === 'PATCH') {
      if (Object.keys(request).length === 0) {
        return failure(422, 'VALIDATION_FAILED', {
          issues: [{ path: '(body)', message: 'At least one field is required' }],
        });
      }
      const invalid = this.invalidEmails(request);
      if (invalid) return invalid;
      if (kind === 'Route' && typeof request['preferredCoverageId'] === 'string') {
        const refused = this.preferredCoverageRefusal(row, request['preferredCoverageId']);
        if (refused) return refused;
      }
      const reasons = this.established.get(row.id);
      const identity = (IDENTITY_FIELDS[kind] ?? []).filter(
        (field) => field in request && request[field] !== row[field],
      );
      if (reasons && identity.length > 0) {
        return failure(409, 'ESTABLISHED_IDENTITY_IMMUTABLE', {
          fields: identity,
          establishedBy: reasons,
        });
      }
      return change(request);
    }
    const flagOnly = kind === 'Signer' || kind === 'Route' || kind === 'Mandate';
    if (action === 'archive')
      return change({
        ...(flagOnly ? {} : { recordState: 'ARCHIVED' }),
        archivedAt: NOW,
        archiveReason: request['reason'],
      });
    if (action === 'restore')
      return change({
        ...(flagOnly ? {} : { recordState: 'DRAFT' }),
        archivedAt: null,
        archiveReason: null,
      });
    if (action === 'link-state') {
      return change({
        linkState: request['state'],
        stateReason: request['reason'],
        unlinkedAt: request['state'] === 'UNLINKED' ? NOW : null,
      });
    }
    if (action === 'canonical-bindings') {
      if (row['archivedAt'] || row['recordState'] === 'ARCHIVED') {
        return failure(409, 'RECORD_STATE_CONFLICT', { archived: true });
      }
      if (row['canonicalCode'] !== null || row['bindingState'] !== 'LOCAL_ONLY') {
        return failure(409, 'BINDING_CORRECTION_REQUIRES_RECONCILIATION', {
          canonicalCode: row['canonicalCode'],
        });
      }
      const refusal = this.bindingRefusals.get(row.id);
      if (refusal) return failure(refusal.status, refusal.code, refusal.details ?? {});
      if (!this.sources.has(String(request['sourceId']))) {
        return failure(422, 'REFERENCE_NOT_FOUND', { field: 'sourceId' });
      }
      return change({
        canonicalCode: request['canonicalCode'],
        canonicalSourceId: request['sourceId'],
        bindingState: 'SOURCE_REFERENCED',
      });
    }
    if (action === 'state') {
      return change(
        kind === 'Signer'
          ? { operationalState: request['state'] }
          : { recordState: request['state'] },
      );
    }
    return failure(404, 'NOT_FOUND');
  };

  /** SourceReference registry: immutable revisions, current heads in lists, no If-Match. */
  private sourceRequest(
    method: string,
    id: string | undefined,
    action: string | undefined,
    url: URL,
    body: unknown,
  ): Response {
    const meta = { requestId: 'r', affectedResources: [] };
    const heads = () =>
      [...this.sources.values()].filter(
        (row) =>
          ![...this.sources.values()].some((other) => other['supersedesSourceId'] === row.id),
      );
    const request = (body ?? {}) as Record<string, unknown>;
    if (id === undefined) {
      if (method === 'GET') {
        const q = url.searchParams.get('q')?.toLowerCase() ?? '';
        const agencyId = url.searchParams.get('agencyId');
        const items = heads()
          .filter(
            (row) =>
              q === '' ||
              row.id === q ||
              row['sourceGroupId'] === q ||
              String(row['title']).toLowerCase().includes(q),
          )
          .filter((row) => {
            if (!agencyId) return true;
            const shared = (row['scopeBindings'] as { agencyIds?: string[] } | null)?.agencyIds;
            return (
              row['agencyId'] === agencyId ||
              (row['agencyId'] === null && !!shared?.includes(agencyId))
            );
          })
          .map((row) => Object.fromEntries(SUMMARY_FIELDS.map((field) => [field, row[field]])));
        return json(200, { data: { items, nextCursor: null }, meta });
      }
      if (request['reportedProvenance'] === 'DOCUMENT_REVIEWED' && !request['reviewedByLabel']) {
        return failure(422, 'REVIEW_UNATTRIBUTED', { field: 'reviewedByLabel' });
      }
      return json(201, { data: this.seedSource(request), meta });
    }
    const row = this.sources.get(id);
    if (!row) return failure(404, 'NOT_FOUND');
    if (method === 'GET' && action === undefined) return json(200, { data: row, meta });
    if (method === 'POST' && action === 'revisions') {
      const successor = [...this.sources.values()].find(
        (other) => other['supersedesSourceId'] === id,
      );
      if (successor) {
        const head = heads().find((other) => other['sourceGroupId'] === row['sourceGroupId']);
        return failure(409, 'REVISION_NOT_HEAD', { headId: head?.id });
      }
      if (
        (request['agencyId'] ?? null) !== row['agencyId'] ||
        JSON.stringify(request['scopeBindings'] ?? null) !== JSON.stringify(row['scopeBindings'])
      ) {
        return failure(422, 'REVISION_SCOPE_CHANGE', { fields: ['scopeBindings'] });
      }
      const next = this.seedSource({
        ...request,
        sourceGroupId: row['sourceGroupId'],
        revision: Number(row['revision']) + 1,
        supersedesSourceId: id,
      });
      return json(201, { data: next, meta });
    }
    return failure(404, 'NOT_FOUND');
  }

  private precondition(kind: Kind, row: Row, headers: Record<string, string>): Response | null {
    const ifMatch = headers['If-Match'];
    if (ifMatch === undefined) return failure(428, 'PRECONDITION_REQUIRED');
    if (ifMatch !== this.etag(kind, row)) return failure(412, 'RECORD_VERSION_CONFLICT');
    return null;
  }

  private invalidEmails(request: Record<string, unknown>): Response | null {
    const issues = Object.entries(request)
      .filter(
        ([key, value]) =>
          key.endsWith('Email') && typeof value === 'string' && !value.includes('@'),
      )
      .map(([key]) => ({
        path: key,
        message: 'Must be a valid email (JSON Schema format, ajv-formats full mode)',
      }));
    return issues.length === 0 ? null : failure(422, 'VALIDATION_FAILED', { issues });
  }

  private list(kind: Kind, url: URL, rows?: Row[]): Response | Promise<Response> {
    if (this.failLists) return failure(500, 'INTERNAL_ERROR');
    const q = url.searchParams.get('q')?.toLowerCase();
    const agencyId = url.searchParams.get('agencyId');
    const limit = this.pageSize ?? Number(url.searchParams.get('limit') ?? 25);
    const start = Number(url.searchParams.get('cursor')?.replace('c', '') ?? 0);
    const all = (rows ?? [...this.rows[kind].values()]).filter(
      (row) =>
        (!q || JSON.stringify(row).toLowerCase().includes(q)) &&
        (!agencyId || row['agencyId'] === agencyId),
    );
    const items = all.slice(start, start + limit);
    const nextCursor = start + limit < all.length ? `c${start + limit}` : null;
    const response = json(200, {
      data: { items, nextCursor },
      meta: { requestId: 'r', affectedResources: [] },
    });
    if (this.holdLists) return new Promise(() => undefined);
    return response;
  }

  private create(kind: Kind, request: Record<string, unknown>): Response {
    const invalid = this.invalidEmails(request);
    if (invalid) return invalid;
    if (kind === 'Route') {
      const existing = [...this.rows.Route.values()].find(
        (row) =>
          row['agencyId'] === request['agencyId'] &&
          row['ownerSubjectId'] === request['ownerSubjectId'],
      );
      if (existing) return failure(409, 'DUPLICATE_ROUTE', { routeId: existing.id });
    }
    const row = this.seed(kind, request);
    return json(
      201,
      { data: row, meta: { requestId: 'r', affectedResources: [] } },
      { ETag: this.etag(kind, row) },
    );
  }

  private ownerSubjects(
    method: string,
    ownerId: string,
    url: URL,
    headers: Record<string, string>,
    body: unknown,
  ): Response {
    const owner = this.rows.Owner.get(ownerId);
    if (!owner) return failure(404, 'NOT_FOUND');
    if (method === 'GET') {
      const items = [...this.rows.OwnerSubject.values()].filter(
        (row) => row['ownerId'] === ownerId,
      );
      void url;
      return json(200, {
        data: { items, nextCursor: null },
        meta: { requestId: 'r', affectedResources: [] },
      });
    }
    const precondition = this.precondition('Owner', owner, headers);
    if (precondition) return precondition;
    const request = body as { legalSubjectId: string; relationshipLabel?: string };
    const existing = [...this.rows.OwnerSubject.values()].find(
      (row) => row['ownerId'] === ownerId && row['legalSubjectId'] === request.legalSubjectId,
    );
    if (existing) return failure(409, 'DUPLICATE_OWNER_SUBJECT', { ownerSubjectId: existing.id });
    owner.rowVersion += 1;
    const row = this.seed('OwnerSubject', {
      ownerId,
      legalSubjectId: request.legalSubjectId,
      relationshipLabel: request.relationshipLabel ?? null,
    });
    return json(
      201,
      { data: row, meta: { requestId: 'r', affectedResources: [] } },
      { ETag: this.etag('OwnerSubject', row) },
    );
  }

  private ownerSubject(
    method: string,
    id: string,
    action: string | undefined,
    headers: Record<string, string>,
    body: unknown,
  ): Response {
    const row = this.rows.OwnerSubject.get(id);
    if (!row) return failure(404, 'NOT_FOUND');
    if (method === 'GET') {
      return json(
        200,
        { data: row, meta: { requestId: 'r', affectedResources: [] } },
        { ETag: this.etag('OwnerSubject', row) },
      );
    }
    const precondition = this.precondition('OwnerSubject', row, headers);
    if (precondition) return precondition;
    if (action !== 'link-state') return failure(404, 'NOT_FOUND');
    const request = body as { state: string; reason: string };
    Object.assign(row, {
      linkState: request.state,
      unlinkedAt: request.state === 'UNLINKED' ? NOW : null,
      unlinkReason: request.state === 'UNLINKED' ? request.reason : null,
      rowVersion: row.rowVersion + 1,
    });
    return json(
      200,
      { data: row, meta: { requestId: 'r', affectedResources: [] } },
      { ETag: this.etag('OwnerSubject', row) },
    );
  }

  writes(): RecordedRequest[] {
    return this.requests.filter((request) => request.method !== 'GET');
  }

  // Representation authority (P3B) -------------------------------------------------------------

  private page(items: Row[] | Array<Record<string, unknown>>): Response {
    return json(200, {
      data: { items, nextCursor: null },
      meta: { requestId: 'r', affectedResources: [] },
    });
  }

  private reply(status: number, kind: Kind, row: Row): Response {
    return json(
      status,
      { data: row, meta: { requestId: 'r', affectedResources: [] } },
      { ETag: this.etag(kind, row) },
    );
  }

  private bump(kind: Kind, id: string): void {
    const row = this.rows[kind].get(id);
    if (row) Object.assign(row, { rowVersion: row.rowVersion + 1, updatedAt: NOW });
  }

  private versionOf(coverage: Row): Row | undefined {
    return this.rows.MandateVersion.get(String(coverage['mandateVersionId']));
  }

  private frozen(version: Row | undefined): Response | null {
    return version?.['versionState'] === 'FROZEN'
      ? failure(409, 'FROZEN_VERSION', { versionId: version.id })
      : null;
  }

  private archivedMandate(mandateId: unknown): Response | null {
    return this.rows.Mandate.get(String(mandateId))?.['archivedAt']
      ? failure(409, 'RECORD_STATE_CONFLICT', { record: 'Mandate', archived: true })
      : null;
  }

  private preferredCoverageRefusal(route: Row, coverageId: string): Response | null {
    const field = 'preferredCoverageId';
    const coverage = this.rows.MandateCoverage.get(coverageId);
    if (!coverage) return failure(422, 'REFERENCE_NOT_FOUND', { field });
    if (coverage['agencyId'] !== route['agencyId']) {
      return failure(422, 'CROSS_AGENCY_REFERENCE', { field });
    }
    if (coverage['routeId'] !== route.id) {
      return failure(422, 'AUTHORITY_SCOPE_UNRESOLVED', { field, reason: 'OTHER_ROUTE' });
    }
    const version = this.versionOf(coverage);
    if (version?.['versionState'] !== 'FROZEN') {
      return failure(409, 'VERSION_NOT_FROZEN', { field, versionId: version?.id });
    }
    return this.archivedMandate(version['mandateId']);
  }

  private mandateChildren(
    method: string,
    mandateId: string,
    action: 'versions' | 'events',
    url: URL,
    headers: Record<string, string>,
    body: unknown,
  ): Response {
    const mandate = this.rows.Mandate.get(mandateId);
    if (!mandate) return failure(404, 'NOT_FOUND');
    const q = url.searchParams.get('q');
    if (method === 'GET') {
      if (action === 'versions') {
        return this.page(
          [...this.rows.MandateVersion.values()]
            .filter((row) => row['mandateId'] === mandateId)
            .filter((row) => !q || row.id === q || row['predecessorId'] === q)
            .reverse(),
        );
      }
      return this.page(
        this.events
          .filter((row) => row['mandateId'] === mandateId)
          .filter(
            (row) =>
              !q ||
              row.id === q ||
              row['coverageId'] === q ||
              row['sourceId'] === q ||
              row['supersedesEventId'] === q ||
              row['eventType'] === q,
          )
          .reverse(),
      );
    }
    const precondition = this.precondition('Mandate', mandate, headers);
    if (precondition) return precondition;
    const archived = this.archivedMandate(mandateId);
    if (archived) return archived;
    const request = body as Record<string, unknown>;
    if (action === 'versions') {
      const siblings = [...this.rows.MandateVersion.values()].filter(
        (row) => row['mandateId'] === mandateId,
      );
      const predecessorId = request['predecessorId'];
      if (typeof predecessorId === 'string') {
        const predecessor = this.rows.MandateVersion.get(predecessorId);
        if (!predecessor) return failure(422, 'REFERENCE_NOT_FOUND', { field: 'predecessorId' });
        if (predecessor['versionState'] !== 'FROZEN') {
          return failure(409, 'VERSION_NOT_FROZEN', { field: 'predecessorId' });
        }
        const successor = siblings.find((row) => row['predecessorId'] === predecessorId);
        if (successor) {
          return failure(409, 'VERSION_SUCCESSOR_EXISTS', {
            field: 'predecessorId',
            successorId: successor.id,
          });
        }
      }
      const documentState = request['documentState'];
      if (
        (documentState === 'DRAFT' || documentState === 'SIGNED_APPEARING') &&
        !request['primarySourceId']
      ) {
        return failure(422, 'DOCUMENT_STATE_UNSUPPORTED', { field: 'documentState' });
      }
      if (
        typeof request['effectiveOn'] === 'string' &&
        typeof request['expiresOn'] === 'string' &&
        request['effectiveOn'] > request['expiresOn']
      ) {
        return failure(422, 'DATE_RANGE_INVALID', { fields: ['effectiveOn', 'expiresOn'] });
      }
      const version = Math.max(0, ...siblings.map((row) => Number(row['version']))) + 1;
      const row = this.seed('MandateVersion', {
        ...request,
        mandateId,
        agencyId: mandate['agencyId'],
        version,
      });
      this.bump('Mandate', mandateId);
      return this.reply(201, 'MandateVersion', row);
    }
    const coverageId = request['coverageId'];
    if (typeof coverageId === 'string') {
      const coverage = this.rows.MandateCoverage.get(coverageId);
      if (!coverage) return failure(422, 'REFERENCE_NOT_FOUND', { field: 'coverageId' });
      const version = this.versionOf(coverage);
      if (version?.['mandateId'] !== mandateId) {
        return failure(422, 'AUTHORITY_SCOPE_UNRESOLVED', {
          field: 'coverageId',
          reason: 'OTHER_MANDATE',
        });
      }
      if (version['versionState'] !== 'FROZEN') {
        return failure(409, 'VERSION_NOT_FROZEN', { field: 'coverageId', versionId: version.id });
      }
    }
    const source = this.sources.get(String(request['sourceId']));
    if (!source) return failure(422, 'REFERENCE_NOT_FOUND', { field: 'sourceId' });
    if (
      request['provenance'] === 'DOCUMENT_REVIEWED' &&
      source['reportedProvenance'] !== 'DOCUMENT_REVIEWED'
    ) {
      return failure(422, 'REVIEW_UNSUPPORTED', {
        field: 'provenance',
        reason: 'SOURCE_NOT_REVIEWED',
      });
    }
    const supersedes = request['supersedesEventId'];
    if (typeof supersedes === 'string') {
      const successor = this.events.find((row) => row['supersedesEventId'] === supersedes);
      if (successor) return failure(409, 'EVENT_ALREADY_SUPERSEDED', { successorId: successor.id });
    }
    const event = this.seedEvent({
      coverageId: null,
      ...request,
      mandateId,
      agencyId: mandate['agencyId'],
    });
    this.bump('Mandate', mandateId);
    return json(201, { data: event, meta: { requestId: 'r', affectedResources: [] } });
  }

  private versionRequest(
    method: string,
    id: string,
    action: string | undefined,
    url: URL,
    headers: Record<string, string>,
    body: unknown,
  ): Response {
    const version = this.rows.MandateVersion.get(id);
    if (!version) return failure(404, 'NOT_FOUND');
    if (method === 'GET' && action === undefined) return this.reply(200, 'MandateVersion', version);
    if (method === 'GET' && action === 'coverages') {
      const q = url.searchParams.get('q');
      return this.page(
        [...this.rows.MandateCoverage.values()]
          .filter((row) => row['mandateVersionId'] === id)
          .filter((row) => !q || row.id === q || row['routeId'] === q)
          .reverse(),
      );
    }
    const precondition = this.precondition('MandateVersion', version, headers);
    if (precondition) return precondition;
    const archived = this.archivedMandate(version['mandateId']);
    if (archived) return archived;
    const frozen = this.frozen(version);
    if (frozen) return frozen;
    const request = body as Record<string, unknown>;
    if (method === 'PATCH' && action === undefined) {
      Object.assign(version, request, { rowVersion: version.rowVersion + 1, updatedAt: NOW });
      return this.reply(200, 'MandateVersion', version);
    }
    if (method === 'POST' && action === 'freeze') {
      Object.assign(version, {
        versionState: 'FROZEN',
        frozenAt: NOW,
        rowVersion: version.rowVersion + 1,
        updatedAt: NOW,
      });
      return this.reply(200, 'MandateVersion', version);
    }
    if (method === 'POST' && action === 'coverages') {
      const route = this.rows.Route.get(String(request['routeId']));
      if (!route) return failure(422, 'REFERENCE_NOT_FOUND', { field: 'routeId' });
      if (route['agencyId'] !== version['agencyId']) {
        return failure(422, 'CROSS_AGENCY_REFERENCE', { field: 'routeId' });
      }
      const duplicate = [...this.rows.MandateCoverage.values()].find(
        (row) =>
          row['mandateVersionId'] === id &&
          row['routeId'] === route.id &&
          row['coverageLabel'] === request['coverageLabel'],
      );
      if (duplicate) return failure(409, 'DUPLICATE_COVERAGE', { coverageId: duplicate.id });
      const row = this.seed('MandateCoverage', {
        ...request,
        mandateVersionId: id,
        agencyId: version['agencyId'],
      });
      this.bump('MandateVersion', id);
      return this.reply(201, 'MandateCoverage', row);
    }
    return failure(404, 'NOT_FOUND');
  }

  private coverageRequest(
    method: string,
    id: string,
    action: string | undefined,
    url: URL,
    headers: Record<string, string>,
    body: unknown,
  ): Response {
    const coverage = this.rows.MandateCoverage.get(id);
    if (!coverage) return failure(404, 'NOT_FOUND');
    if (method === 'GET' && action === undefined) {
      return this.reply(200, 'MandateCoverage', coverage);
    }
    if (method === 'GET' && action === 'signers') {
      void url;
      return this.page(
        [...this.rows.CoverageSigner.values()].filter((row) => row['coverageId'] === id),
      );
    }
    const precondition = this.precondition('MandateCoverage', coverage, headers);
    if (precondition) return precondition;
    const version = this.versionOf(coverage);
    const archived = this.archivedMandate(version?.['mandateId']);
    if (archived) return archived;
    const frozen = this.frozen(version);
    if (frozen) return frozen;
    const request = body as Record<string, unknown>;
    if (method === 'PATCH' && action === undefined) {
      Object.assign(coverage, request, { rowVersion: coverage.rowVersion + 1, updatedAt: NOW });
      this.bump('MandateVersion', String(coverage['mandateVersionId']));
      return this.reply(200, 'MandateCoverage', coverage);
    }
    if (method === 'POST' && action === 'signers') {
      const signer = this.rows.Signer.get(String(request['signerId']));
      if (!signer) return failure(422, 'REFERENCE_NOT_FOUND', { field: 'signerId' });
      if (signer['agencyId'] !== coverage['agencyId']) {
        return failure(422, 'CROSS_AGENCY_REFERENCE', { field: 'signerId' });
      }
      if (signer['archivedAt'] || signer['operationalState'] === 'ENDED') {
        return failure(409, 'RECORD_STATE_CONFLICT', {
          record: 'Signer',
          operation: 'createCoverageSigner',
          field: 'signerId',
        });
      }
      const duplicate = [...this.rows.CoverageSigner.values()].find(
        (row) =>
          row['coverageId'] === id &&
          row['signerId'] === signer.id &&
          row['capacity'] === request['capacity'],
      );
      if (duplicate) {
        return failure(409, 'DUPLICATE_COVERAGE_SIGNER', { coverageSignerId: duplicate.id });
      }
      const row = this.seed('CoverageSigner', {
        ...request,
        coverageId: id,
        agencyId: coverage['agencyId'],
      });
      this.bump('MandateCoverage', id);
      this.bump('MandateVersion', String(coverage['mandateVersionId']));
      return this.reply(201, 'CoverageSigner', row);
    }
    return failure(404, 'NOT_FOUND');
  }

  // Cases (P4A) --------------------------------------------------------------------------------

  /**
   * A selection as the contract returns it (no ETag, no row version), with the coverage rows it
   * pinned (each coverage with its own application scope).
   */
  seedSelection(
    fields: Record<string, unknown>,
    coverages: ReadonlyArray<{ coverageId: string; applicationScope: string }> = [],
  ): Record<string, unknown> & { id: string } {
    const row = {
      id: this.id(),
      caseId: '',
      agencyId: '',
      routeId: '',
      signerId: '',
      taskType: 'INITIAL',
      intendedFromEmail: 'synthetic-sender@example.invalid',
      basisSourceId: null,
      selectionNote: 'Synthetic selection note',
      createdAt: NOW,
      createdById: USER_ID,
      ...fields,
    };
    this.selections.push(row);
    this.pinned.set(
      row.id,
      coverages.map((chosen) => ({
        id: this.id(),
        selectionId: row.id,
        caseId: row.caseId,
        agencyId: row.agencyId,
        routeId: row.routeId,
        coverageId: chosen.coverageId,
        applicationScope: chosen.applicationScope,
        createdAt: row.createdAt,
        createdById: row.createdById,
      })),
    );
    return row;
  }

  private touchCase(row: Row, material: boolean): void {
    Object.assign(row, {
      rowVersion: row.rowVersion + 1,
      contextRevision: Number(row['contextRevision']) + (material ? 1 : 0),
      updatedAt: NOW,
    });
  }

  private caseRequest(
    method: string,
    id: string | undefined,
    action: string | undefined,
    url: URL,
    headers: Record<string, string>,
    body: unknown,
    childId?: string,
  ): Response | Promise<Response> {
    const request = (body ?? {}) as Record<string, unknown>;
    if (id === undefined) {
      if (method === 'GET') {
        const workflowState = url.searchParams.get('workflowState');
        const routeId = url.searchParams.get('routeId');
        const cases = [...this.rows.CaseRecord.values()].filter(
          (row) =>
            (!workflowState || row['workflowState'] === workflowState) &&
            (!routeId || row['routeId'] === routeId),
        );
        const response = this.list('CaseRecord', url, cases);
        return response;
      }
      const agency = this.rows.Agency.get(String(request['agencyId']));
      if (!agency) return failure(422, 'REFERENCE_NOT_FOUND', { field: 'agencyId' });
      if (typeof request['routeId'] === 'string') {
        const route = this.rows.Route.get(request['routeId']);
        if (!route) return failure(422, 'REFERENCE_NOT_FOUND', { field: 'routeId' });
        if (route['agencyId'] !== agency.id) {
          return failure(422, 'CROSS_AGENCY_REFERENCE', { field: 'routeId' });
        }
      }
      const row = this.seed('CaseRecord', request);
      return this.reply(201, 'CaseRecord', row);
    }
    const row = this.rows.CaseRecord.get(id);
    if (!row) return failure(404, 'NOT_FOUND');
    if (method === 'GET') {
      if (action === undefined) return this.reply(200, 'CaseRecord', row);
      if (action === 'sources') {
        return this.page(
          [...this.rows.CaseSource.values()].filter((link) => link['caseId'] === id).reverse(),
        );
      }
      if (action === 'authority-selections' && childId !== undefined) {
        // Only under its own case; another case's selection is 404 like an unknown one.
        const selection = this.selections.find(
          (item) => item.id === childId && item['caseId'] === id,
        );
        if (!selection) return failure(404, 'NOT_FOUND');
        const coverages = [...(this.pinned.get(selection.id) ?? [])]
          .filter((row) => row['caseId'] === id)
          .sort((x, y) => (x.coverageId < y.coverageId ? -1 : x.coverageId > y.coverageId ? 1 : 0));
        return json(200, {
          data: { selection, coverages },
          meta: { requestId: 'r', affectedResources: [] },
        });
      }
      if (action === 'authority-selections') {
        return this.page(this.selections.filter((item) => item['caseId'] === id).reverse());
      }
      return failure(404, 'NOT_FOUND');
    }
    const precondition = this.precondition('CaseRecord', row, headers);
    if (precondition) return precondition;
    if (row['archivedAt'] !== null && action !== 'restore') {
      return failure(409, 'RECORD_STATE_CONFLICT', { record: 'CaseRecord', archived: true });
    }
    if (method === 'PATCH') {
      const material = ['intakeLabel', 'ownerHintId', 'packetSourceId', 'driveFolderUrl'].some(
        (field) => field in request,
      );
      Object.assign(row, request);
      this.touchCase(row, material);
      return this.reply(200, 'CaseRecord', row);
    }
    if (method === 'DELETE') {
      const blockers = [
        ...(this.deleteBlockers.get(id) ?? []),
        ...([...this.rows.CaseSource.values()].some((link) => link['caseId'] === id)
          ? ['REFERENCED_BY:case_sources.case_id']
          : []),
        ...(this.selections.some((item) => item['caseId'] === id)
          ? ['REFERENCED_BY:case_authority_selections.case_id']
          : []),
      ];
      if (blockers.length > 0) return failure(409, 'REFERENCED_RECORD_CANNOT_DELETE', { blockers });
      this.rows.CaseRecord.delete(id);
      return new Response(null, { status: 204 });
    }
    switch (action) {
      case 'archive':
        Object.assign(row, { archivedAt: NOW, archiveReason: request['reason'] });
        this.touchCase(row, false);
        return this.reply(200, 'CaseRecord', row);
      case 'restore':
        if (row['archivedAt'] === null) {
          return failure(409, 'RECORD_STATE_CONFLICT', { archived: false, operation: 'restore' });
        }
        Object.assign(row, { archivedAt: null, archiveReason: null });
        this.touchCase(row, false);
        return this.reply(200, 'CaseRecord', row);
      case 'workflow': {
        if (row['workflowState'] === request['state']) {
          return failure(409, 'RECORD_STATE_CONFLICT', {
            workflowState: row['workflowState'],
            requested: request['state'],
            operation: 'workflow',
          });
        }
        const closing = request['state'] === 'CLOSED';
        Object.assign(row, {
          workflowState: request['state'],
          closedAt: closing ? NOW : null,
          closeReason: closing ? request['reason'] : null,
        });
        this.touchCase(row, false);
        return this.reply(200, 'CaseRecord', row);
      }
      case 'route-binding': {
        const route = this.rows.Route.get(String(request['routeId']));
        if (!route) return failure(422, 'REFERENCE_NOT_FOUND', { field: 'routeId' });
        if (route['agencyId'] !== row['agencyId']) {
          return failure(422, 'CROSS_AGENCY_REFERENCE', { field: 'routeId' });
        }
        if (row['routeId'] === route.id) {
          return failure(409, 'RECORD_STATE_CONFLICT', {
            routeId: route.id,
            operation: 'route-binding',
          });
        }
        if (row['routeId'] !== null && this.selections.some((item) => item['caseId'] === id)) {
          return failure(409, 'BINDING_CORRECTION_REQUIRES_RECONCILIATION', {
            routeId: row['routeId'],
            blockers: ['AUTHORITY_SELECTION'],
          });
        }
        if (route['archivedAt'] || route['linkState'] !== 'LINKED') {
          return failure(409, 'RECORD_STATE_CONFLICT', {
            record: 'Route',
            linkState: route['linkState'],
            field: 'routeId',
          });
        }
        row['routeId'] = route.id;
        this.touchCase(row, true);
        return this.reply(200, 'CaseRecord', row);
      }
      case 'canonical-binding':
        if (row['canonicalCaseId'] !== null) {
          return failure(409, 'BINDING_CORRECTION_REQUIRES_RECONCILIATION', {
            canonicalCaseId: row['canonicalCaseId'],
          });
        }
        if (!this.sources.has(String(request['sourceId']))) {
          return failure(422, 'REFERENCE_NOT_FOUND', { field: 'sourceId' });
        }
        Object.assign(row, {
          canonicalCaseId: request['canonicalCode'],
          canonicalBindingSourceId: request['sourceId'],
        });
        this.touchCase(row, true);
        return this.reply(200, 'CaseRecord', row);
      case 'sources': {
        const source = this.sources.get(String(request['sourceId']));
        if (!source) return failure(422, 'REFERENCE_NOT_FOUND', { field: 'sourceId' });
        const caseIds = (source['scopeBindings'] as { caseIds?: string[] } | null)?.caseIds ?? [];
        if (caseIds.length > 0 && !caseIds.includes(id)) {
          return failure(422, 'CROSS_CASE_REFERENCE', { field: 'sourceId' });
        }
        const duplicate = [...this.rows.CaseSource.values()].find(
          (link) =>
            link['caseId'] === id &&
            link['sourceId'] === source.id &&
            link['useRole'] === request['useRole'],
        );
        if (duplicate) return failure(409, 'DUPLICATE_CASE_SOURCE', { caseSourceId: duplicate.id });
        const link = this.seed('CaseSource', { ...request, caseId: id });
        this.touchCase(row, true);
        return this.reply(201, 'CaseSource', link);
      }
      case 'authority-selections': {
        if (row['routeId'] === null) {
          return failure(422, 'AUTHORITY_SCOPE_UNRESOLVED', {
            field: 'routeId',
            reason: 'CASE_ROUTE_UNBOUND',
          });
        }
        if (request['routeId'] !== row['routeId']) {
          return failure(422, 'AUTHORITY_SCOPE_UNRESOLVED', {
            field: 'routeId',
            reason: 'NOT_CASE_ROUTE',
          });
        }
        const signer = this.rows.Signer.get(String(request['signerId']));
        if (!signer) return failure(422, 'REFERENCE_NOT_FOUND', { field: 'signerId' });
        if (signer['agencyId'] !== row['agencyId']) {
          return failure(422, 'CROSS_AGENCY_REFERENCE', { field: 'signerId' });
        }
        const chosen = (request['coverages'] ?? []) as Array<{
          coverageId: string;
          applicationScope: string;
        }>;
        for (const [index, item] of chosen.entries()) {
          const field = `coverages.${index}.coverageId`;
          const coverage = this.rows.MandateCoverage.get(item.coverageId);
          if (!coverage) return failure(422, 'REFERENCE_NOT_FOUND', { field });
          if (coverage['routeId'] !== row['routeId']) {
            return failure(422, 'AUTHORITY_SCOPE_UNRESOLVED', { field, reason: 'OTHER_ROUTE' });
          }
          const version = this.versionOf(coverage);
          if (version?.['versionState'] !== 'FROZEN') {
            return failure(409, 'VERSION_NOT_FROZEN', { field, versionId: version?.id });
          }
          const recorded = [...this.rows.CoverageSigner.values()].some(
            (association) =>
              association['coverageId'] === coverage.id && association['signerId'] === signer.id,
          );
          if (!recorded) {
            return failure(422, 'AUTHORITY_SCOPE_UNRESOLVED', {
              field,
              reason: 'SIGNER_NOT_RECORDED',
            });
          }
        }
        const selection = this.seedSelection(
          {
            caseId: id,
            agencyId: row['agencyId'],
            routeId: row['routeId'],
            signerId: signer.id,
            taskType: request['taskType'],
            intendedFromEmail: request['intendedFromEmail'],
            basisSourceId: request['basisSourceId'] ?? null,
            selectionNote: request['selectionNote'],
          },
          chosen,
        );
        row['currentAuthoritySelectionId'] = selection.id;
        this.touchCase(row, true);
        return json(201, { data: selection, meta: { requestId: 'r', affectedResources: [] } });
      }
      default:
        return failure(404, 'NOT_FOUND');
    }
  }

  /** Current fact revisions (no successor) of one case, newest first. */
  private factHeads(caseId: string) {
    return this.facts
      .filter((fact) => fact['caseId'] === caseId)
      .filter((fact) => !this.facts.some((other) => other['supersedesFactId'] === fact.id))
      .reverse();
  }

  /** A body reference to a case child: 422 unknown / another case's, 409 archived. */
  private childRefusal(kind: Kind, caseId: string, id: unknown, field: string): Response | null {
    const row = this.rows[kind].get(String(id));
    if (!row) return failure(422, 'REFERENCE_NOT_FOUND', { field });
    if (row['caseId'] !== caseId) return failure(422, 'CROSS_CASE_REFERENCE', { field });
    if (row['archivedAt'] !== null) {
      return failure(409, 'RECORD_STATE_CONFLICT', { record: kind, archived: true, field });
    }
    return null;
  }

  /** Case intake (P4B): reported items, works, use mappings and fact revisions of one case. */
  private intakeRequest(
    method: string,
    caseId: string,
    segment: string,
    childId: string | undefined,
    childAction: string | undefined,
    url: URL,
    headers: Record<string, string>,
    body: unknown,
  ): Response | Promise<Response> {
    const kind = INTAKE_SEGMENTS.get(segment) ?? 'CaseFact';
    const owner = this.rows.CaseRecord.get(caseId);
    if (!owner) return failure(404, 'NOT_FOUND');
    const request = (body ?? {}) as Record<string, unknown>;
    const meta = { requestId: 'r', affectedResources: [] };
    if (kind === 'CaseFact') {
      if (method === 'GET' && childId === undefined) {
        if (this.failLists) return failure(500, 'INTERNAL_ERROR');
        const factType = url.searchParams.get('factType');
        const text = url.searchParams.get('q');
        const items = this.factHeads(caseId)
          .filter((fact) => !factType || fact['factType'] === factType)
          .filter(
            (fact) =>
              !text ||
              [
                fact.id,
                fact['factGroupId'],
                fact['caseWorkId'],
                fact['reportedItemId'],
                fact['mappingId'],
              ].includes(text) ||
              String(fact['scopeText']).toLowerCase().includes(text.toLowerCase()),
          )
          .map((fact) =>
            Object.fromEntries(FACT_SUMMARY_FIELDS.map((field) => [field, fact[field]])),
          );
        return this.page(items);
      }
      const fact =
        childId === undefined
          ? null
          : (this.facts.find((row) => row.id === childId && row['caseId'] === caseId) ?? null);
      if (childId !== undefined && !fact) return failure(404, 'NOT_FOUND');
      if (method === 'GET') return json(200, { data: fact, meta });
      const precondition = this.precondition('CaseRecord', owner, headers);
      if (precondition) return precondition;
      if (owner['archivedAt'] !== null) {
        return failure(409, 'RECORD_STATE_CONFLICT', { record: 'CaseRecord', archived: true });
      }
      if (fact && childAction !== 'revisions') return failure(404, 'NOT_FOUND');
      return this.recordFact(owner, request, fact);
    }
    if (method === 'GET' && childId === undefined) {
      const text = url.searchParams.get('q');
      const rows = [...this.rows[kind].values()]
        .filter((row) => row['caseId'] === caseId)
        .filter(
          (row) =>
            !text ||
            row.id === text ||
            row['caseWorkId'] === text ||
            row['reportedItemId'] === text ||
            (kind !== 'UseMapping' &&
              JSON.stringify(row).toLowerCase().includes(text.toLowerCase())),
        )
        .reverse();
      return this.page(rows);
    }
    const child =
      childId === undefined
        ? null
        : [...this.rows[kind].values()].find(
            (row) => row.id === childId && row['caseId'] === caseId,
          );
    if (childId !== undefined && !child) return failure(404, 'NOT_FOUND');
    if (method === 'GET') return this.reply(200, kind, child as Row);
    const precondition = child
      ? this.precondition(kind, child, headers)
      : this.precondition('CaseRecord', owner, headers);
    if (precondition) return precondition;
    if (owner['archivedAt'] !== null) {
      return failure(409, 'RECORD_STATE_CONFLICT', { record: 'CaseRecord', archived: true });
    }
    if (child) {
      if (childAction === 'archive' || childAction === 'restore') {
        const archiving = childAction === 'archive';
        if ((child['archivedAt'] !== null) === archiving) {
          return failure(409, 'RECORD_STATE_CONFLICT', { archived: !archiving });
        }
        Object.assign(child, {
          archivedAt: archiving ? NOW : null,
          archiveReason: archiving ? request['reason'] : null,
          rowVersion: child.rowVersion + 1,
          updatedAt: NOW,
        });
        this.touchCase(owner, true);
        return this.reply(200, kind, child);
      }
      if (method !== 'PATCH' || childAction !== undefined) return failure(404, 'NOT_FOUND');
      if (child['archivedAt'] !== null) {
        return failure(409, 'RECORD_STATE_CONFLICT', { record: kind, archived: true });
      }
      if (kind === 'UseMapping') {
        const refused = this.mappingRefusal({ ...child, ...request });
        if (refused) return refused;
      }
      Object.assign(child, request, { rowVersion: child.rowVersion + 1, updatedAt: NOW });
      const material =
        kind !== 'CaseWork' || Object.keys(request).some((field) => field !== 'notes');
      if (material) this.touchCase(owner, true);
      return this.reply(200, kind, child);
    }
    if (kind === 'ReportedItem') {
      const video = videoIdOf(String(request['rawUrl']));
      if ('reason' in video) {
        return failure(422, 'REPORTED_URL_UNSUPPORTED', { field: 'rawUrl', reason: video.reason });
      }
      const duplicate = [...this.rows.ReportedItem.values()].find(
        (row) => row['caseId'] === caseId && row['externalItemId'] === video.id,
      );
      if (duplicate)
        return failure(409, 'DUPLICATE_REPORTED_ITEM', { reportedItemId: duplicate.id });
      const row = this.seed('ReportedItem', {
        ...request,
        caseId,
        externalItemId: video.id,
        normalizedUrl: `https://www.youtube.com/watch?v=${video.id}`,
      });
      this.touchCase(owner, true);
      return this.reply(201, 'ReportedItem', row);
    }
    if (kind === 'UseMapping') {
      const refused =
        this.childRefusal('CaseWork', caseId, request['caseWorkId'], 'caseWorkId') ??
        this.childRefusal('ReportedItem', caseId, request['reportedItemId'], 'reportedItemId') ??
        this.mappingRefusal(request);
      if (refused) return refused;
      const duplicate = [...this.rows.UseMapping.values()].find(
        (row) =>
          row['caseWorkId'] === request['caseWorkId'] &&
          row['reportedItemId'] === request['reportedItemId'] &&
          row['occurrence'] === request['occurrence'],
      );
      if (duplicate) return failure(409, 'DUPLICATE_USE_MAPPING', { useMappingId: duplicate.id });
    }
    const row = this.seed(kind, { ...request, caseId });
    this.touchCase(owner, true);
    return this.reply(201, kind, row);
  }

  /** Mapping value rules: a known end after its start; a review needs a reviewed basis source. */
  private mappingRefusal(mapping: Record<string, unknown>): Response | null {
    for (const [start, end] of [
      ['sourceStartMs', 'sourceEndMs'],
      ['reportedStartMs', 'reportedEndMs'],
    ] as const) {
      const a = mapping[start];
      const b = mapping[end];
      if (typeof a === 'string' && typeof b === 'string' && BigInt(b) <= BigInt(a)) {
        return failure(422, 'TIME_RANGE_INVALID', { fields: [start, end] });
      }
    }
    if (mapping['provenance'] === 'DOCUMENT_REVIEWED') {
      const basis = this.sources.get(String(mapping['basisSourceId']));
      if (!basis) return failure(422, 'REVIEW_UNSUPPORTED', { reason: 'NO_BASIS_SOURCE' });
      if (basis['reportedProvenance'] !== 'DOCUMENT_REVIEWED') {
        return failure(422, 'REVIEW_UNSUPPORTED', { reason: 'SOURCE_NOT_REVIEWED' });
      }
    }
    return null;
  }

  /** A new fact (revision 1) or a new revision of the current one, with its stored supports. */
  private recordFact(
    owner: Row,
    request: Record<string, unknown>,
    head: (Record<string, unknown> & { id: string }) | null,
  ): Response {
    const caseId = owner.id;
    const targets = {
      WORK: 'caseWorkId',
      REPORTED_ITEM: 'reportedItemId',
      USE: 'mappingId',
    } as const;
    const scopeKind = String(request['scopeKind']) as keyof typeof targets | 'CASE';
    for (const field of ['caseWorkId', 'reportedItemId', 'mappingId']) {
      const wanted = scopeKind !== 'CASE' && targets[scopeKind] === field;
      const given = typeof request[field] === 'string';
      if (wanted !== given) {
        return failure(422, 'FACT_SCOPE_INVALID', {
          field,
          scopeKind,
          reason: wanted ? 'TARGET_REQUIRED' : 'TARGET_NOT_ALLOWED',
        });
      }
    }
    if (head) {
      if (this.facts.some((other) => other['supersedesFactId'] === head.id)) {
        const current = this.factHeads(caseId).find(
          (fact) => fact['factGroupId'] === head['factGroupId'],
        );
        return failure(409, 'REVISION_NOT_HEAD', { headId: current?.id });
      }
      const changed = ['factType', 'scopeKind', 'caseWorkId', 'reportedItemId', 'mappingId'].filter(
        (field) => (request[field] ?? null) !== head[field],
      );
      if (changed.length > 0) return failure(422, 'REVISION_SCOPE_CHANGE', { fields: changed });
    }
    if (scopeKind !== 'CASE') {
      const field = targets[scopeKind];
      const kind = (
        { caseWorkId: 'CaseWork', reportedItemId: 'ReportedItem', mappingId: 'UseMapping' } as const
      )[field];
      const refused = this.childRefusal(kind, caseId, request[field], field);
      if (refused) return refused;
    }
    const supports = (request['sources'] ?? []) as Array<{ caseSourceId: string }>;
    let reviewed = false;
    for (const [index, support] of supports.entries()) {
      const field = `sources.${index}.caseSourceId`;
      const link = this.rows.CaseSource.get(support.caseSourceId);
      if (!link) return failure(422, 'REFERENCE_NOT_FOUND', { field });
      if (link['caseId'] !== caseId) return failure(422, 'CROSS_CASE_REFERENCE', { field });
      if (link['linkState'] !== 'LINKED') {
        return failure(409, 'RECORD_STATE_CONFLICT', {
          record: 'CaseSource',
          linkState: link['linkState'],
          field,
        });
      }
      const source = this.sources.get(String(link['sourceId']));
      if (source?.['reportedProvenance'] === 'DOCUMENT_REVIEWED') reviewed = true;
    }
    if (request['provenance'] === 'DOCUMENT_REVIEWED' && !reviewed) {
      return failure(422, 'REVIEW_UNSUPPORTED', {
        field: 'provenance',
        reason: 'NO_REVIEWED_SOURCE',
      });
    }
    const { sources, ...fields } = request;
    const fact = this.seedFact({
      caseWorkId: null,
      reportedItemId: null,
      mappingId: null,
      rawProvenance: null,
      resolutionState: 'UNASSESSED',
      assertedByLabel: null,
      assertedAsOf: null,
      limitations: null,
      ...fields,
      caseId,
      ...(head
        ? {
            factGroupId: head['factGroupId'],
            revision: Number(head['revision']) + 1,
            supersedesFactId: head.id,
          }
        : {}),
    });
    this.factSupports.set(fact.id, (sources ?? []) as unknown[]);
    this.touchCase(owner, true);
    return json(201, { data: fact, meta: { requestId: 'r', affectedResources: [] } });
  }

  private caseSourceRequest(
    method: string,
    id: string,
    action: string | undefined,
    headers: Record<string, string>,
    body: unknown,
  ): Response {
    const link = this.rows.CaseSource.get(id);
    if (!link) return failure(404, 'NOT_FOUND');
    if (method === 'GET' && action === undefined) return this.reply(200, 'CaseSource', link);
    if (method !== 'POST' || action !== 'link-state') return failure(404, 'NOT_FOUND');
    const precondition = this.precondition('CaseSource', link, headers);
    if (precondition) return precondition;
    const owner = this.rows.CaseRecord.get(String(link['caseId']));
    if (owner?.['archivedAt']) {
      return failure(409, 'RECORD_STATE_CONFLICT', { record: 'CaseRecord', archived: true });
    }
    const request = body as { state: string; reason: string };
    if (link['linkState'] === request.state) {
      return failure(409, 'RECORD_STATE_CONFLICT', {
        linkState: link['linkState'],
        requested: request.state,
      });
    }
    Object.assign(link, {
      linkState: request.state,
      stateReason: request.reason,
      rowVersion: link.rowVersion + 1,
      updatedAt: NOW,
    });
    if (owner) this.touchCase(owner, true);
    return this.reply(200, 'CaseSource', link);
  }

  private coverageSignerRequest(
    method: string,
    id: string,
    headers: Record<string, string>,
  ): Response {
    const association = this.rows.CoverageSigner.get(id);
    if (!association) return failure(404, 'NOT_FOUND');
    if (method === 'GET') return this.reply(200, 'CoverageSigner', association);
    const precondition = this.precondition('CoverageSigner', association, headers);
    if (precondition) return precondition;
    const coverage = this.rows.MandateCoverage.get(String(association['coverageId']));
    const frozen = coverage ? this.frozen(this.versionOf(coverage)) : null;
    if (frozen) return frozen;
    if (method !== 'DELETE') return failure(404, 'NOT_FOUND');
    this.rows.CoverageSigner.delete(id);
    if (coverage) {
      this.bump('MandateCoverage', coverage.id);
      this.bump('MandateVersion', String(coverage['mandateVersionId']));
    }
    return new Response(null, { status: 204 });
  }
}

let root: Root | undefined;
let container: HTMLElement | undefined;
let navigateTo: ((path: string) => void) | undefined;

/** Captures the router's navigate function so a test can move between URLs in the same app. */
function NavigationProbe() {
  const navigate = useNavigate();
  navigateTo = (path: string) => void navigate(path);
  return null;
}

/**
 * In-app navigation to another URL (like history back/forward between two records of the same
 * page): the page's route element stays mounted and only its parameters change.
 */
export async function go(path: string): Promise<void> {
  if (!navigateTo) throw new Error('nothing rendered');
  const navigate = navigateTo;
  await act(async () => navigate(path));
}

export async function render(api: FakeDirectory, path: string): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <StrictMode>
        <MemoryRouter initialEntries={[path]}>
          <NavigationProbe />
          <App api={createApiClient(api.fetch)} />
        </MemoryRouter>
      </StrictMode>,
    );
  });
}

/** Unmounts the rendered app (to render another page of the same fake backend). */
export async function unmount(): Promise<void> {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  navigateTo = undefined;
}

afterEach(unmount);

export async function waitFor(check: () => boolean, label: string): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 3000) {
      throw new Error(
        `timed out waiting for ${label}\n${container?.textContent?.slice(0, 1500) ?? ''}`,
      );
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

export const all = (selector: string) =>
  [...(container?.querySelectorAll(selector) ?? [])] as HTMLElement[];
export const q = (selector: string) => container?.querySelector<HTMLElement>(selector) ?? null;
export const pageText = () => container?.textContent ?? '';

export function byText(selector: string, text: string | RegExp): HTMLElement {
  const found = all(selector).find((element) =>
    typeof text === 'string'
      ? element.textContent?.trim() === text
      : text.test(element.textContent ?? ''),
  );
  if (!found) throw new Error(`no ${selector} with text ${String(text)}`);
  return found;
}

export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

export async function type(selector: string, value: string): Promise<void> {
  const element = q(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!element) throw new Error(`no field ${selector}`);
  await act(async () => {
    const prototype = Object.getPrototypeOf(element) as object;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
    );
  });
}

export async function submit(form: HTMLElement | null): Promise<void> {
  await act(async () => {
    (form as HTMLFormElement).requestSubmit();
  });
}

export const until = (text: string | RegExp) =>
  waitFor(
    () => (typeof text === 'string' ? pageText().includes(text) : text.test(pageText())),
    String(text),
  );
