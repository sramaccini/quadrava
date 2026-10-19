import { RegistryClient, RegistryError, type DocumentSummary, type ReviewAction } from './registry-client';

/** What can be done on several documents at once: the review actions on their latest version, or its publication. */
export type BulkAction = ReviewAction | 'publish';

/** The outcome for one document: done, or the reason the registry gave (for example «the author cannot approve»). */
export interface BulkOutcome {
  document: DocumentSummary;
  ok: boolean;
  reason?: string;
  status?: number;
}

/** Key of a document of the application: `kind/id`. */
export function documentKey(document: Pick<DocumentSummary, 'kind' | 'id'>): string {
  return `${document.kind}/${document.id}`;
}

/** The latest version needs a step before it is published in the environment (not approved, or not yet published there). */
export function needsAttention(document: DocumentSummary, env: string): boolean {
  const latest = document.latest;
  if (!latest) return false;
  return latest.state !== 'approved' || document.publishedEnvironments?.[env] !== latest.hash;
}

/** Whether the action applies to the state of the latest version (a request from a draft or a rejected version, a decision on one in review, the publication of an approved one). */
export function applies(action: BulkAction, document: DocumentSummary): boolean {
  const state = document.latest?.state ?? 'draft';
  if (action === 'request') return state === 'draft' || state === 'rejected';
  if (action === 'approve' || action === 'reject') return state === 'in-review';
  return state === 'approved';
}

/**
 * Applies an action to the latest version of every document, one after the other: each one succeeds or fails on its own (the
 * registry decides: four-eyes principle, protected environments, references). The order is the one of publication, so
 * data sources and screens come before the navigation that refers to them.
 */
export async function applyToMany(client: RegistryClient, appId: string, env: string, action: BulkAction, documents: readonly DocumentSummary[], note?: string): Promise<BulkOutcome[]> {
  const order = ['datasources', 'screen', 'theme', 'messages', 'navigation'];
  const sorted = [...documents].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.id.localeCompare(b.id));
  const outcomes: BulkOutcome[] = [];
  for (const document of sorted) {
    const hash = document.latest?.hash;
    if (!hash || !applies(action, document)) {
      outcomes.push({ document, ok: false, reason: 'skipped' });
      continue;
    }
    try {
      if (action === 'publish') await client.publish(appId, document.kind, document.id, env, hash);
      else await client.review(appId, document.kind, document.id, hash, action, note || undefined);
      outcomes.push({ document, ok: true });
    } catch (e) {
      outcomes.push({ document, ok: false, status: e instanceof RegistryError ? e.status : 0, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return outcomes;
}
