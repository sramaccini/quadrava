import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { I18n, checkScreenExpressions } from 'core';
import { ExpressionEngine } from 'expressions';
import { validateScreen, type ScreenDefinition } from 'schema';
import { fromPointer, getIn, insertAt, isObject, moveBy, moveTo, removeAt, samePath, setIn, startsWith, toPointer, type Json, type JsonObject, type Path } from './doc-ops';
import { childSlots, ownerOf, targetAt } from './schema-info';
import { emptyScreen, ensureSource, freshId, nodeTemplate, usedIds, withFreshIds } from './templates';

/** Un problema del documento, collegato all'elemento (nodo, scheda, passo o schermata) che lo contiene. */
export interface EditorIssue {
  /** Elemento selezionabile a cui appartiene il problema. */
  owner: Path;
  /** Posizione precisa (JSON Pointer). */
  pointer: string;
  message: string;
  /** Gli errori impediscono l'anteprima e la pubblicazione; gli avvisi no. */
  severity: 'error' | 'warning';
}

/** Bozza salvata nel browser: il documento e i dati di esempio dell'anteprima. */
interface Draft {
  doc: Json;
  samples: Record<string, Json>;
}

const DRAFT_KEY = 'lc.editor.draft';
/** Nome di un data source: lo si scrive nelle espressioni e nei passi, quindi un identificativo semplice. */
export const SOURCE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const HISTORY_LIMIT = 200;
/** Modifiche alla stessa proprietà più vicine di così diventano un solo passo di annullamento (si scrive lettera per lettera). */
const COALESCE_MS = 1000;

/**
 * Stato dell'editor: il documento della schermata, l'elemento selezionato, la cronologia per annullare e ripetere,
 * i problemi trovati (schema, espressioni, riferimenti) e i dati di esempio dell'anteprima. La bozza si salva da sola
 * nel browser a ogni modifica.
 */
@Injectable({ providedIn: 'root' })
export class EditorStore {
  private readonly i18n = inject(I18n);
  private readonly engine = new ExpressionEngine({ can: () => true });
  private readonly t = (key: string, params: Record<string, unknown> = {}): string => this.i18n.t(key, params);

  private readonly draft = readDraft();
  readonly doc = signal<Json>(this.draft?.doc ?? emptyScreen((k) => this.t(k)));
  /** Percorso dell'elemento selezionato; vuoto = la schermata. */
  readonly selection = signal<Path>([]);
  /** Vista centrale dell'editor: anteprima, JSON o data source. */
  readonly view = signal<'preview' | 'json' | 'sources'>('preview');
  /** Risposte finte per data source, usate solo dall'anteprima. */
  readonly samples = signal<Record<string, Json>>(this.draft?.samples ?? {});

  private readonly past = signal<Json[]>([]);
  private readonly future = signal<Json[]>([]);
  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);
  private coalesce: { key: string; at: number } | null = null;

  readonly issues = computed<EditorIssue[]>(() => this.check(this.doc()));
  readonly errorCount = computed(() => this.issues().filter((i) => i.severity === 'error').length);
  /** Il documento come schermata valida, oppure null se ha errori (l'anteprima mostra allora l'ultima versione valida). */
  readonly definition = computed<ScreenDefinition | null>(() => (this.errorCount() === 0 ? (this.doc() as unknown as ScreenDefinition) : null));
  readonly target = computed(() => targetAt(this.doc(), this.selection()));
  /** Schermate note (gli esempi), suggerite nei passi `navigate`. */
  readonly knownScreens = signal<string[]>([]);
  /** Nomi dei data source della schermata. */
  readonly sourceNames = computed(() => {
    const sources = getIn(this.doc(), ['dataSources']);
    return isObject(sources) ? Object.keys(sources) : [];
  });

  constructor() {
    effect(() => {
      const draft: Draft = { doc: this.doc(), samples: this.samples() };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // Archiviazione piena o non disponibile: la bozza resta solo in memoria.
      }
    });
  }

  select(path: Path): void {
    this.selection.set(targetAt(this.doc(), path) ? path : []);
  }

  /** Percorso dell'elemento (nodo, scheda, passo) con questo identificativo, o null. */
  pathOfId(id: string): Path | null {
    const doc = this.doc();
    const visit = (value: Json, path: Path): Path | null => {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const found = visit(value[i], [...path, i]);
          if (found) return found;
        }
        return null;
      }
      if (!isObject(value)) return null;
      if (value['id'] === id && targetAt(doc, path)) return path;
      for (const [key, child] of Object.entries(value)) {
        if (key === 'dataSources') continue;
        const found = visit(child, [...path, key]);
        if (found) return found;
      }
      return null;
    };
    return visit(doc, []);
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
    else if (!targetAt(next, this.selection())) this.selection.set(ownerOf(next, this.selection()));
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
    if (!targetAt(this.doc(), this.selection())) this.selection.set(ownerOf(this.doc(), this.selection()));
  }

  redo(): void {
    const [next, ...rest] = this.future();
    if (next === undefined) return;
    this.past.update((list) => [...list, this.doc()]);
    this.future.set(rest);
    this.coalesce = null;
    this.doc.set(next);
    if (!targetAt(this.doc(), this.selection())) this.selection.set(ownerOf(this.doc(), this.selection()));
  }

  /** Dove va un nodo nuovo: dentro l'elemento selezionato se è un contenitore, altrimenti subito dopo. */
  insertionPoint(): { list: Path; index: number } {
    const doc = this.doc();
    const selection = this.selection();
    const [slot] = childSlots(doc, selection);
    if (slot) {
      const list = getIn(doc, slot.path);
      return { list: slot.path, index: Array.isArray(list) ? list.length : 0 };
    }
    const target = targetAt(doc, selection);
    if (target?.kind === 'node') return { list: selection.slice(0, -1), index: (selection.at(-1) as number) + 1 };
    // Un nodo con schede o passi: il nodo nuovo va dopo di lui.
    const components = getIn(doc, ['components']);
    return { list: ['components'], index: Array.isArray(components) ? components.length : 0 };
  }

  /** Aggiunge un nodo del tipo indicato (dal suo modello) e lo seleziona; crea il data source che usa, se manca. */
  addNode(type: string, at = this.insertionPoint()): void {
    const doc = this.doc();
    const node: JsonObject = { id: freshId(doc, type), ...nodeTemplate(type, (k) => this.t(k)) };
    const next = insertAt(ensureSource(doc, node), at.list, at.index, node);
    const list = getIn(next, at.list) as Json[];
    this.apply(next, { select: [...at.list, Math.min(at.index, list.length - 1)] });
  }

  /** Aggiunge una scheda (tabs) o un passo (wizard) al nodo indicato. */
  addContainerItem(path: Path): void {
    const node = getIn(this.doc(), path);
    if (!isObject(node)) return;
    const key = node['type'] === 'tabs' ? 'tabs' : node['type'] === 'wizard' ? 'steps' : null;
    if (!key) return;
    const items = Array.isArray(node[key]) ? (node[key] as Json[]) : [];
    const label = this.t(key === 'tabs' ? 'ed.tpl.tab' : 'ed.tpl.step') + ' ' + (items.length + 1);
    this.apply(insertAt(this.doc(), [...path, key], items.length, { label, components: [] }), { select: [...path, key, items.length] });
  }

  remove(path: Path): void {
    if (!path.length) return;
    const next = removeAt(this.doc(), path);
    const list = getIn(next, path.slice(0, -1));
    const index = path.at(-1) as number;
    const sibling = Array.isArray(list) && list.length ? [...path.slice(0, -1), Math.min(index, list.length - 1)] : null;
    this.apply(next, { select: sibling && targetAt(next, sibling) ? sibling : ownerOf(next, path.slice(0, -1)) });
  }

  duplicate(path: Path): void {
    const doc = this.doc();
    const value = getIn(doc, path);
    if (value === undefined || typeof path.at(-1) !== 'number') return;
    const copy = withFreshIds(doc, value);
    const at = [...path.slice(0, -1), (path.at(-1) as number) + 1];
    this.apply(insertAt(doc, path.slice(0, -1), at.at(-1) as number, copy), { select: at });
  }

  move(path: Path, delta: number): void {
    const result = moveBy(this.doc(), path, delta);
    if (samePath(result.path, path)) return;
    this.apply(result.doc, { select: result.path });
  }

  /** Sposta un nodo in un altro elenco di nodi (trascinamento nella struttura). */
  moveNode(from: Path, toList: Path, index: number): boolean {
    if (startsWith(toList, from)) return false;
    const result = moveTo(this.doc(), from, toList, index);
    if (!result) return false;
    this.apply(result.doc, { select: result.path });
    return true;
  }

  /** Nodo copiato o tagliato, da incollare nel punto di inserimento (anche in un altro contenitore). */
  readonly clipboard = signal<Json | null>(null);

  copy(path: Path): void {
    if (targetAt(this.doc(), path)?.kind !== 'node') return;
    this.clipboard.set(getIn(this.doc(), path) ?? null);
  }

  cut(path: Path): void {
    if (targetAt(this.doc(), path)?.kind !== 'node') return;
    this.copy(path);
    this.remove(path);
  }

  /** Incolla il nodo copiato nel punto di inserimento, con identificativi nuovi se quelli copiati sono già usati. */
  paste(): void {
    const node = this.clipboard();
    if (!isObject(node)) return;
    const at = this.insertionPoint();
    const doc = this.doc();
    const used = usedIds(doc);
    const copy = [...usedIds(node)].some((id) => used.has(id)) ? withFreshIds(doc, node) : node;
    const next = insertAt(ensureSource(doc, copy as JsonObject), at.list, at.index, copy);
    this.apply(next, { select: [...at.list, at.index] });
  }

  /** Aggiunge un data source GET con un nome libero e lo restituisce. */
  addSource(): string {
    const names = new Set(this.sourceNames());
    let name = 'dati';
    for (let n = 2; names.has(name); n++) name = `dati${n}`;
    this.apply(setIn(this.doc(), ['dataSources', name], { type: 'rest', method: 'GET', url: `/api/${name}` }));
    return name;
  }

  /**
   * Rinomina un data source, aggiornando i nodi che lo usano (`source`), i passi che lo chiamano (`call`, `refresh`)
   * e i dati di esempio. Restituisce false se il nome non è valido o è già usato.
   */
  renameSource(from: string, to: string): boolean {
    if (from === to) return true;
    if (!SOURCE_NAME.test(to) || this.sourceNames().includes(to)) return false;
    const doc = this.doc();
    const sources = getIn(doc, ['dataSources']) as JsonObject;
    // Stesso ordine di prima, con il nome nuovo al posto del vecchio.
    const renamed = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k === from ? to : k, v]));
    const replace = (value: Json, path: Path): Json => {
      if (Array.isArray(value)) return value.map((v, i) => replace(v, [...path, i]));
      if (!isObject(value)) return value;
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, ['source', 'call', 'refresh'].includes(k) && v === from && path[0] !== 'dataSources' ? to : replace(v, [...path, k])]),
      );
    };
    this.apply({ ...(replace(doc, []) as JsonObject), dataSources: renamed });
    const sample = this.samples()[from];
    if (sample !== undefined) {
      this.setSample(from, undefined);
      this.setSample(to, sample);
    }
    return true;
  }

  removeSource(name: string): void {
    this.apply(setIn(this.doc(), ['dataSources', name], undefined));
    this.setSample(name, undefined);
  }

  setSample(source: string, value: Json | undefined): void {
    this.samples.update((all) => {
      const next = { ...all };
      if (value === undefined) delete next[source];
      else next[source] = value;
      return next;
    });
  }

  /** Apre un documento (file, esempio, nuova schermata): azzera cronologia e selezione. */
  load(doc: Json, samples: Record<string, Json> = {}): void {
    this.doc.set(doc);
    this.samples.set(samples);
    this.past.set([]);
    this.future.set([]);
    this.coalesce = null;
    this.selection.set([]);
  }

  newScreen(): void {
    this.load(emptyScreen((k) => this.t(k)));
  }

  private check(doc: Json): EditorIssue[] {
    const issues: EditorIssue[] = [];
    const add = (pointer: string, message: string, severity: EditorIssue['severity']): void => {
      issues.push({ owner: ownerOf(doc, fromPointer(pointer)), pointer, message, severity });
    };
    const result = validateScreen(doc);
    if (!result.valid) result.issues.forEach((i) => add(i.path, i.message, 'error'));
    checkScreenExpressions(doc, this.engine).forEach((p) => add(p.path, p.message, 'error'));
    this.checkReferences(doc, add);
    return issues;
  }

  /** Controlli che lo schema non fa: data source inesistenti e identificativi ripetuti. */
  private checkReferences(doc: Json, add: (pointer: string, message: string, severity: EditorIssue['severity']) => void): void {
    const sources = getIn(doc, ['dataSources']);
    const names = new Set(isObject(sources) ? Object.keys(sources) : []);
    const seen = new Set<string>();
    const visit = (value: Json, path: Path): void => {
      if (Array.isArray(value)) return value.forEach((v, i) => visit(v, [...path, i]));
      if (!isObject(value)) return;
      if (typeof value['type'] === 'string' && typeof value['source'] === 'string' && !names.has(value['source'])) {
        add(toPointer([...path, 'source']), this.t('ed.issue.unknownSource', { name: value['source'] }), 'warning');
      }
      for (const [key, step] of [['call', value['call']], ['refresh', value['refresh']]] as const) {
        if (typeof step === 'string' && !names.has(step)) add(toPointer([...path, key]), this.t('ed.issue.unknownSource', { name: step }), 'warning');
      }
      if (typeof value['id'] === 'string' && path.at(-2) !== 'dataSources') {
        if (seen.has(value['id'])) add(toPointer([...path, 'id']), this.t('ed.issue.duplicateId', { id: value['id'] }), 'error');
        seen.add(value['id']);
      }
      for (const [key, child] of Object.entries(value)) if (key !== 'dataSources' || path.length) visit(child, [...path, key]);
    };
    visit(doc, []);
  }
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return isObject(parsed as unknown as Json) && parsed.doc !== undefined ? { doc: parsed.doc, samples: isObject(parsed.samples) ? parsed.samples : {} } : null;
  } catch {
    return null;
  }
}
