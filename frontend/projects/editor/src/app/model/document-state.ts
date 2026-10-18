import { InjectionToken, computed, signal } from '@angular/core';
import { setIn, toPointer, type Json, type Path } from './doc-ops';

/** A problem of the document, linked to the selectable element containing it. */
export interface EditorIssue {
  /** Selectable element the problem belongs to. */
  owner: Path;
  /** Precise position (JSON Pointer). */
  pointer: string;
  message: string;
  /** Errors prevent the preview and the publication; warnings do not. */
  severity: 'error' | 'warning';
}

/**
 * Identifier of the open document (one per window of the workspace): its draft in the browser is kept under it, so
 * several documents of the same kind do not overwrite each other.
 */
export const DOCUMENT_ID = new InjectionToken<string>('DOCUMENT_ID');

/** Key of the draft of a document in the browser storage. */
export function draftKey(id: string): string {
  return `lc.editor.doc.${id}`;
}

/** The draft of a document saved in the browser, or null. */
export function readDraft(id: string): unknown {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** Saves the draft of a document in the browser (storage full or not available: it stays only in memory). */
export function writeDraft(id: string, draft: unknown): void {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(draft));
  } catch {
    // Storage full or not available: the draft stays only in memory.
  }
}

const HISTORY_LIMIT = 200;
/** Changes to the same property closer than this become a single undo step (one types letter by letter). */
const COALESCE_MS = 1000;

/**
 * A document edited in the editor (a screen, the navigation, a theme): the JSON, the selected element, the history
 * for undo and redo and the problems found. Every kind of document says which elements are selected and how it is
 * checked. The fields generated from the schema (`ed-fields`) work on this class, whatever the document. Every window
 * of the workspace has its own instance (see `Workspace`).
 */
export abstract class DocumentState {
  readonly doc = signal<Json>(null);
  /** Path of the selected element; empty = the root of the document. */
  readonly selection = signal<Path>([]);

  private readonly past = signal<Json[]>([]);
  private readonly future = signal<Json[]>([]);
  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);
  private coalesce: { key: string; at: number } | null = null;

  readonly issues = computed<EditorIssue[]>(() => this.check(this.doc()));
  readonly errorCount = computed(() => this.issues().filter((i) => i.severity === 'error').length);

  /** Problems of the document. */
  protected abstract check(doc: Json): EditorIssue[];
  /** Is there a selectable element at this path? */
  protected abstract selectable(doc: Json, path: Path): boolean;
  /** The nearest selectable element containing the path. */
  abstract ownerOf(doc: Json, path: Path): Path;

  /** Opens a document (file, example, registry version): clears history and selection. */
  abstract load(doc: Json): void;

  /** Values suggested while typing a text property (data sources, screens, icons…). */
  suggestions(_property: string): string[] {
    return [];
  }

  select(path: Path): void {
    this.selection.set(this.selectable(this.doc(), path) ? path : []);
  }

  /** Replaces the document recording the step in the history. `coalesce` merges close changes to the same property. */
  apply(next: Json, options: { select?: Path; coalesce?: string } = {}): void {
    const previous = this.doc();
    if (next === previous) return;
    const now = Date.now();
    const merge = options.coalesce !== undefined && this.coalesce?.key === options.coalesce && now - this.coalesce.at < COALESCE_MS;
    if (!merge) this.past.update((list) => [...list, previous].slice(-HISTORY_LIMIT));
    this.coalesce = options.coalesce !== undefined ? { key: options.coalesce, at: now } : null;
    this.future.set([]);
    this.doc.set(next);
    if (options.select) this.selection.set(options.select);
    else this.keepSelection();
  }

  /** Sets (or with `undefined` removes) the value at a path. */
  setValue(path: Path, value: Json | undefined): void {
    this.apply(setIn(this.doc(), path, value), { coalesce: toPointer(path) });
  }

  undo(): void {
    const past = this.past();
    if (!past.length) return;
    this.future.update((list) => [this.doc(), ...list]);
    this.past.set(past.slice(0, -1));
    this.coalesce = null;
    this.doc.set(past.at(-1)!);
    this.keepSelection();
  }

  redo(): void {
    const [next, ...rest] = this.future();
    if (next === undefined) return;
    this.past.update((list) => [...list, this.doc()]);
    this.future.set(rest);
    this.coalesce = null;
    this.doc.set(next);
    this.keepSelection();
  }

  /** Replaces the document without history (opening a file, new document). */
  protected reset(doc: Json): void {
    this.doc.set(doc);
    this.past.set([]);
    this.future.set([]);
    this.coalesce = null;
    this.selection.set([]);
  }

  /** If the selected element is no longer there, the one that contained it is selected. */
  private keepSelection(): void {
    const doc = this.doc();
    if (!this.selectable(doc, this.selection())) this.selection.set(this.ownerOf(doc, this.selection()));
  }
}
