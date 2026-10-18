import { Injectable, signal } from '@angular/core';
import type { Json } from './doc-ops';

export const SAVED_KEY = 'lc.editor.saved';

/** Kind of editor document (a resource of the project): each one has its own editor. */
export type EditorKind = 'project' | 'screen' | 'datasources' | 'navigation' | 'theme' | 'messages';

/**
 * The last saved content of every open document (to a file or in the registry, or just opened or created), by the
 * identifier of the document, to know whether there are unsaved changes. It is remembered in the browser like the draft,
 * so it holds after a reload too.
 */
@Injectable({ providedIn: 'root' })
export class SavedDocuments {
  private readonly saved = signal<Record<string, string>>(read());

  markSaved(id: string, doc: Json): void {
    this.update({ ...this.saved(), [id]: JSON.stringify(doc) });
  }

  /** Without a reference save (a document restored from an older draft) the document there is counts. */
  ensureBaseline(id: string, doc: Json): void {
    if (this.saved()[id] === undefined) this.markSaved(id, doc);
  }

  isSaved(id: string, doc: Json): boolean {
    return this.saved()[id] === JSON.stringify(doc);
  }

  /** The document was closed: its reference save is no longer needed. */
  forget(id: string): void {
    const { [id]: _closed, ...rest } = this.saved();
    this.update(rest);
  }

  private update(next: Record<string, string>): void {
    this.saved.set(next);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      // Storage full or not available: the indicator holds until the reload.
    }
  }
}

function read(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch {
    return {};
  }
}
