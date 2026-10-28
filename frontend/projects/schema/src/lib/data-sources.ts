import type { DataSourceDefinition, DataSourceEntry, DataSourceReference, DataSourcesDefinition, ScreenDefinition } from './types';

/** A problem found resolving the references of a screen to the data sources of the project. */
export interface ResolutionIssue {
  /** Position in the screen (JSON Pointer), for example `/dataSources/list/ref`. */
  path: string;
  message: string;
}

/** The entry refers to a data source of the project (`{ "ref": "orders/list" }`). */
export function isDataSourceReference(entry: DataSourceEntry | undefined): entry is DataSourceReference {
  return typeof entry === 'object' && entry !== null && typeof (entry as DataSourceReference).ref === 'string';
}

/** The definition of an entry written in the screen; undefined for a reference (to resolve first) or a missing entry. */
export function inlineDataSource(entry: DataSourceEntry | undefined): DataSourceDefinition | undefined {
  return entry && !isDataSourceReference(entry) ? entry : undefined;
}

/**
 * The url of a data source of a document with a base address: base and url joined by a single slash
 * (`/api/orders` + `/{{ params.id }}` → `/api/orders/{{ params.id }}`); without a base the url as it is. Both can hold
 * expressions, evaluated later as every url (so a base such as `{{ settings.ordersApi }}` works).
 */
export function joinUrl(baseUrl: string | undefined, url: string): string {
  if (!baseUrl) return url;
  const base = baseUrl.replace(/\/+$/, '');
  const path = url.replace(/^\/+/, '');
  return path ? `${base}/${path}` : base || '/';
}

/** Document and name of a reference: `orders/list` → `['orders', 'list']`. */
export function splitReference(ref: string): [document: string, name: string] {
  const slash = ref.indexOf('/');
  return slash < 0 ? [ref, ''] : [ref.slice(0, slash), ref.slice(slash + 1)];
}

/** Identifiers of the data sources documents the screen refers to, without repetitions, in order. */
export function referencedDocuments(screen: Pick<ScreenDefinition, 'dataSources'>): string[] {
  const found = Object.values(screen.dataSources ?? {})
    .filter(isDataSourceReference)
    .map((entry) => splitReference(entry.ref)[0]);
  return [...new Set(found)];
}

/**
 * The screen with every reference replaced by the referenced definition: its url with the `baseUrl` of the document in front,
 * `params` of the reference added to those of the definition (same name: the reference wins), `body` replacing the definition's. A reference that does not resolve (document or
 * name missing) is left out, with a problem: fail-closed, the screen sees no data source with that name.
 */
export function resolveDataSources(
  screen: ScreenDefinition,
  documents: Readonly<Record<string, DataSourcesDefinition | undefined>>,
): { screen: ScreenDefinition; issues: ResolutionIssue[] } {
  const entries = Object.entries(screen.dataSources ?? {});
  if (!entries.some(([, entry]) => isDataSourceReference(entry))) return { screen, issues: [] };
  const issues: ResolutionIssue[] = [];
  const resolved: Record<string, DataSourceDefinition> = {};
  for (const [name, entry] of entries) {
    if (!isDataSourceReference(entry)) {
      resolved[name] = entry;
      continue;
    }
    const [documentId, sourceName] = splitReference(entry.ref);
    const document = documents[documentId];
    const target = document?.sources[sourceName];
    if (!target) {
      const message = document ? `data source «${sourceName}» not found in «${documentId}»` : `data sources document «${documentId}» not found`;
      issues.push({ path: `/dataSources/${name}/ref`, message });
      continue;
    }
    const definition: DataSourceDefinition = { ...target, url: joinUrl(document.baseUrl, target.url) };
    if (entry.params) definition.params = { ...target.params, ...entry.params };
    if (entry.body !== undefined) definition.body = entry.body;
    resolved[name] = definition;
  }
  return { screen: { ...screen, dataSources: resolved }, issues };
}
