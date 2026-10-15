import { Injectable, signal } from '@angular/core';
import type { Json } from './doc-ops';

export const SAVED_KEY = 'lc.editor.saved';

/** Kind of editor document: one per mode. */
export type EditorKind = 'screen' | 'navigation' | 'theme';

/**
 * The last saved content of every kind of document (to a file or in the registry, or just opened or created), to
 * know whether there are unsaved changes. It is remembered in the browser like the draft, so it holds after a reload too.
 */
@Injectable({ providedIn: 'root' })
export class SavedDocuments {
  private readonly saved = signal<Partial<Record<EditorKind, string>>>(read());

  markSaved(kind: EditorKind, doc: Json): void {
    this.saved.update((s) => ({ ...s, [kind]: JSON.stringify(doc) }));
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(this.saved()));
    } catch {
      // Storage full or not available: the indicator holds until the reload.
    }
  }

  /** At the first start there is no reference save: the document there is counts (there are no changes to lose). */
  ensureBaseline(kind: EditorKind, doc: Json): void {
    if (this.saved()[kind] === undefined) this.markSaved(kind, doc);
  }

  isSaved(kind: EditorKind, doc: Json): boolean {
    return this.saved()[kind] === JSON.stringify(doc);
  }
}

function read(): Partial<Record<EditorKind, string>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string')) as Partial<Record<EditorKind, string>>;
  } catch {
    return {};
  }
}
