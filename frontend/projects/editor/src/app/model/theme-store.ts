import { Injectable, computed, effect } from '@angular/core';
import { THEME_SCHEMA, validateTheme, type ThemeDefinition } from 'schema';
import { isObject, type Json, type JsonObject, type Path } from './doc-ops';
import { DocumentState, type EditorIssue } from './document-state';
import { SchemaReader, type Schema } from './schema-info';

/**
 * Il tema (design token) come documento dell'editor. È un solo oggetto con gruppi annidati (colori, tipografia,
 * forma, layout): si seleziona sempre la radice e il pannello mostra tutto, gruppo per gruppo.
 */

export const THEME = new SchemaReader(THEME_SCHEMA as unknown as Schema);

/** Tema di partenza: i colori del tema chiaro della demo (sono dati del documento, non stili dell'editor). */
export function emptyTheme(): JsonObject {
  return {
    schemaVersion: '1.0',
    theme: 'nuovo-tema',
    label: 'Nuovo tema',
    mode: 'light',
    tokens: {
      colors: { primary: '#1f5fbf', onPrimary: '#ffffff', background: '#f4f6f9', surface: '#ffffff', onSurface: '#1b2430', border: '#d5dbe3' },
    },
  };
}

const DRAFT_KEY = 'lc.editor.theme';

@Injectable({ providedIn: 'root' })
export class ThemeStore extends DocumentState {
  /** Il tema come definizione valida, oppure null se ha errori (l'anteprima resta all'ultima versione valida). */
  readonly definition = computed<ThemeDefinition | null>(() => (this.errorCount() === 0 ? (this.doc() as unknown as ThemeDefinition) : null));

  constructor() {
    super();
    this.doc.set(readDraft() ?? emptyTheme());
    effect(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(this.doc()));
      } catch {
        // Archiviazione non disponibile: la bozza resta in memoria.
      }
    });
  }

  protected selectable(_doc: Json, path: Path): boolean {
    return path.length === 0;
  }

  ownerOf(): Path {
    return [];
  }

  load(doc: Json): void {
    this.reset(doc);
  }

  newTheme(): void {
    this.reset(emptyTheme());
  }

  protected check(doc: Json): EditorIssue[] {
    const result = validateTheme(doc);
    return result.valid ? [] : result.issues.map((i) => ({ owner: [], pointer: i.path, message: i.message, severity: 'error' as const }));
  }
}

function readDraft(): Json | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Json) : null;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
