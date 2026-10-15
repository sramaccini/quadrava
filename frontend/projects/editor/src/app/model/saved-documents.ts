import { Injectable, signal } from '@angular/core';
import type { Json } from './doc-ops';

export const SAVED_KEY = 'lc.editor.saved';

/** Tipo di documento dell'editor: uno per modalità. */
export type EditorKind = 'screen' | 'navigation' | 'theme';

/**
 * L'ultimo contenuto salvato di ogni tipo di documento (su file o nel registro, oppure appena aperto o creato), per
 * sapere se ci sono modifiche non salvate. Si ricorda nel browser come la bozza, così vale anche dopo una ricarica.
 */
@Injectable({ providedIn: 'root' })
export class SavedDocuments {
  private readonly saved = signal<Partial<Record<EditorKind, string>>>(read());

  markSaved(kind: EditorKind, doc: Json): void {
    this.saved.update((s) => ({ ...s, [kind]: JSON.stringify(doc) }));
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(this.saved()));
    } catch {
      // Storage pieno o non disponibile: l'indicatore vale fino alla ricarica.
    }
  }

  /** Al primo avvio non c'è un salvataggio di riferimento: vale il documento che c'è (non ci sono modifiche da perdere). */
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
