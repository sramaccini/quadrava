import type { ProjectSnapshot } from 'core';
import type { Json } from './doc-ops';
import { documentId, MANIFEST_PATH, NAVIGATION_PATH, resourceAt, resourcePath, type ProjectResource, type ResourceKind } from './project';

/** A document open in a window: its kind, its file (null if not saved yet) and its current content. */
export interface OpenDocument {
  readonly kind: ResourceKind;
  readonly path: string | null;
  readonly doc: Json;
}

const TABLES: Partial<Record<ResourceKind, 'screens' | 'dataSources' | 'themes'>> = { screen: 'screens', datasources: 'dataSources', theme: 'themes' };

/**
 * The project as Studio sees it, for the runtime of «Run project» (ADR-16): the files of the project, with the documents
 * open in the windows in their place (unsaved changes included, a window not saved yet under the identifier of its
 * document) and the translation catalogues as the screens see them. A file that cannot be read is left out: the runtime
 * then reports the missing document as it would from any other source.
 */
export async function projectSnapshot(
  resources: readonly ProjectResource[],
  read: (path: string) => Promise<Json>,
  open: readonly OpenDocument[],
  catalogues: Readonly<Record<string, Record<string, string>>>,
): Promise<ProjectSnapshot> {
  const files = new Map<string, Json>();
  await Promise.all(
    resources
      .filter((r) => r.kind !== 'messages')
      .map(async (r) => {
        try {
          files.set(r.path, await read(r.path));
        } catch {
          // Not JSON, or gone: left out.
        }
      }),
  );
  for (const document of open) {
    const resource = document.path ? resourceAt(document.path) : null;
    const id = resource?.id ?? documentId(document.kind, document.doc);
    if (id === null) continue;
    files.set(resource?.path ?? resourcePath(document.kind, id), document.doc);
  }
  const snapshot = { manifest: files.get(MANIFEST_PATH) ?? null, navigation: files.get(NAVIGATION_PATH) ?? null, screens: {}, dataSources: {}, themes: {}, messages: { ...catalogues } };
  for (const [path, doc] of files) {
    const resource = resourceAt(path);
    const table = resource ? TABLES[resource.kind] : undefined;
    if (resource && table) (snapshot[table] as Record<string, Json>)[resource.id] = doc;
  }
  return snapshot;
}
