// What a PromptSnapshot freezes besides the context itself (P4E) — pure functions of the exact
// context the prompt is generated from: no database, clock or randomness.
import {
  codePointLength,
  type ContextView,
  type ProductionContext,
  type SourceManifestEntry,
} from '@tb/contracts';
import { apiErrors } from '../../infrastructure/http/api-error.js';

const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A manifest entry's content with sorted keys (absent optional keys and nulls kept apart). */
const entryText = (entry: SourceManifestEntry) =>
  JSON.stringify(entry, Object.keys(entry).sort(byCodeUnits));

/**
 * The snapshot's source manifest: every source revision the context lists — its `sources` and its
 * `policySources` (the P4D assembly puts each source in exactly one of them) — each entry exactly
 * as the context lists it (role, provenance, limitations and pinned revision as recorded), ordered
 * by source id. Never the registry, never a newer revision, never an invented entry; a source the
 * context lists twice must be listed identically (otherwise the snapshot is refused as an integrity
 * failure).
 */
export function promptSourceManifest(context: ProductionContext): SourceManifestEntry[] {
  const bySource = new Map<string, SourceManifestEntry>();
  for (const entry of [...context.sources, ...context.policySources]) {
    const seen = bySource.get(entry.sourceId);
    if (seen !== undefined && entryText(seen) !== entryText(entry)) throw apiErrors.internal();
    bySource.set(entry.sourceId, entry);
  }
  return [...bySource.values()].sort((a, b) => byCodeUnits(a.sourceId, b.sourceId));
}

/** Contracted maximum sizes of the arrays of a PromptSnapshot (TB-SCHEMA-API-v1.2.0). */
const LIST_LIMITS: ReadonlyArray<
  readonly [string, (view: ContextView, sources: readonly SourceManifestEntry[]) => number, number]
> = [
  ['dependencyManifest', (view) => view.dependencies.length, 10000],
  ['sourceManifest', (_view, sources) => sources.length, 1000],
  ['missingItems', (view) => view.context.missing.length, 1000],
  ['conflicts', (view) => view.context.conflicts.length, 1000],
];

/** Contracted maximum of PromptSnapshot.renderedPrompt, in code points. */
export const RENDERED_PROMPT_MAXIMUM = 1_000_000;

/** 409 PROMPT_TOO_LARGE when a manifest of the snapshot would exceed its bound — never cut. */
export function assertManifestBounds(
  view: ContextView,
  sourceManifest: readonly SourceManifestEntry[],
): void {
  for (const [field, count, maximum] of LIST_LIMITS) {
    const value = count(view, sourceManifest);
    if (value > maximum) throw apiErrors.promptTooLarge(field, value, maximum);
  }
}

/** 409 PROMPT_TOO_LARGE when the rendered prompt exceeds its bound — never truncated. */
export function assertPromptSize(renderedPrompt: string): void {
  const length = codePointLength(renderedPrompt);
  if (length > RENDERED_PROMPT_MAXIMUM) {
    throw apiErrors.promptTooLarge('renderedPrompt', length, RENDERED_PROMPT_MAXIMUM);
  }
}
