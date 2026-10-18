import { Injectable, computed, effect, inject } from '@angular/core';
import { THEME_SCHEMA, validateTheme, type ThemeDefinition } from 'schema';
import { isObject, type Json, type JsonObject, type Path } from './doc-ops';
import { DOCUMENT_ID, DocumentState, readDraft, writeDraft, type EditorIssue } from './document-state';
import { SchemaReader, type Schema } from './schema-info';

/**
 * The theme (design tokens) as an editor document. It is a single object with nested groups (colours, typography,
 * shape, layout): the root is always selected and the panel shows everything, group by group.
 */

export const THEME = new SchemaReader(THEME_SCHEMA as unknown as Schema);

/** Starting theme: the colours of the light theme of the demo (they are data of the document, not styles of the editor). */
export function emptyTheme(): JsonObject {
  return {
    schemaVersion: '1.0',
    theme: 'new-theme',
    label: 'New theme',
    mode: 'light',
    tokens: {
      colors: { primary: '#1f5fbf', onPrimary: '#ffffff', background: '#f4f6f9', surface: '#ffffff', onSurface: '#1b2430', border: '#d5dbe3' },
    },
  };
}

/** The theme open in a window of the workspace (one store per window; the draft under `DOCUMENT_ID`). */
@Injectable()
export class ThemeStore extends DocumentState {
  private readonly id = inject(DOCUMENT_ID);
  /** The theme as a valid definition, or null if it has errors (the preview stays at the last valid version). */
  readonly definition = computed<ThemeDefinition | null>(() => (this.errorCount() === 0 ? (this.doc() as unknown as ThemeDefinition) : null));

  constructor() {
    super();
    this.doc.set(objectDraft(readDraft(this.id)) ?? emptyTheme());
    effect(() => writeDraft(this.id, this.doc()));
  }

  protected selectable(_doc: Json, path: Path): boolean {
    return path.length === 0;
  }

  ownerOf(): Path {
    return [];
  }

  override load(doc: Json): void {
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

function objectDraft(value: unknown): Json | null {
  return isObject(value as Json) ? (value as Json) : null;
}
