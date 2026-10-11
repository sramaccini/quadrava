import { computed, signal } from '@angular/core';
import { setIn, toPointer, type Json, type Path } from './doc-ops';

/** Un problema del documento, collegato all'elemento selezionabile che lo contiene. */
export interface EditorIssue {
  /** Elemento selezionabile a cui appartiene il problema. */
  owner: Path;
  /** Posizione precisa (JSON Pointer). */
  pointer: string;
  message: string;
  /** Gli errori impediscono l'anteprima e la pubblicazione; gli avvisi no. */
  severity: 'error' | 'warning';
}

const HISTORY_LIMIT = 200;
/** Modifiche alla stessa proprietà più vicine di così diventano un solo passo di annullamento (si scrive lettera per lettera). */
const COALESCE_MS = 1000;

/**
 * Un documento modificato nell'editor (una schermata, la navigazione): il JSON, l'elemento selezionato, la cronologia
 * per annullare e ripetere e i problemi trovati. Ogni tipo di documento dice quali elementi si selezionano e come si
 * controlla. I campi generati dallo schema (`ed-fields`) lavorano su questa classe, qualunque sia il documento.
 */
export abstract class DocumentState {
  readonly doc = signal<Json>(null);
  /** Percorso dell'elemento selezionato; vuoto = la radice del documento. */
  readonly selection = signal<Path>([]);

  private readonly past = signal<Json[]>([]);
  private readonly future = signal<Json[]>([]);
  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);
  private coalesce: { key: string; at: number } | null = null;

  readonly issues = computed<EditorIssue[]>(() => this.check(this.doc()));
  readonly errorCount = computed(() => this.issues().filter((i) => i.severity === 'error').length);

  /** Problemi del documento. */
  protected abstract check(doc: Json): EditorIssue[];
  /** C'è un elemento selezionabile a questo percorso? */
  protected abstract selectable(doc: Json, path: Path): boolean;
  /** L'elemento selezionabile più vicino che contiene il percorso. */
  abstract ownerOf(doc: Json, path: Path): Path;

  /** Valori suggeriti mentre si scrive una proprietà di testo (data source, schermate, icone…). */
  suggestions(_property: string): string[] {
    return [];
  }

  select(path: Path): void {
    this.selection.set(this.selectable(this.doc(), path) ? path : []);
  }

  /** Sostituisce il documento registrando il passo nella cronologia. `coalesce` unisce le modifiche ravvicinate alla stessa proprietà. */
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

  /** Imposta (o con `undefined` toglie) il valore in un percorso. */
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

  /** Sostituisce il documento senza cronologia (apertura di un file, documento nuovo). */
  protected reset(doc: Json): void {
    this.doc.set(doc);
    this.past.set([]);
    this.future.set([]);
    this.coalesce = null;
    this.selection.set([]);
  }

  /** Se l'elemento selezionato non c'è più, si seleziona quello che lo conteneva. */
  private keepSelection(): void {
    const doc = this.doc();
    if (!this.selectable(doc, this.selection())) this.selection.set(this.ownerOf(doc, this.selection()));
  }
}
