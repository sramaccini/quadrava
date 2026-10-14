import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { I18n, checkScreenExpressions } from 'core';
import { ExpressionEngine } from 'expressions';
import { validateScreen, type ScreenDefinition } from 'schema';
import { fromPointer, getIn, insertAt, isObject, moveBy, moveTo, removeAt, samePath, setIn, startsWith, toPointer, type Json, type JsonObject, type Path } from './doc-ops';
import { DocumentState, type EditorIssue } from './document-state';
import { childSlots, ownerOf, targetAt } from './schema-info';
import { emptyScreen, ensureSource, freshId, nodeTemplate, uniqueInputName, usedIds, withFreshIds } from './templates';
import { collectTexts, makeKey, translatable, usedKeys, type TextEntry } from './texts';

export type { EditorIssue } from './document-state';

/** Bozza salvata nel browser: il documento e i dati di esempio dell'anteprima. */
interface Draft {
  doc: Json;
  samples: Record<string, Json>;
  translations: Translations;
  /** Lingue delle traduzioni (oltre a quelle con testi già scritti). */
  languages?: string[];
  /** Lingua predefinita: quella dei testi di ripiego scritti nelle schermate. */
  defaultLanguage?: string;
}

/** Traduzioni scritte nell'editor: lingua → chiave → testo. */
export type Translations = Record<string, Record<string, string>>;

/** Lingue di partenza delle traduzioni (quelle della demo); se ne possono aggiungere altre nel pannello «Testi». */
export const EDITOR_LOCALES = ['it', 'en'];
/** Codice di una lingua: due o tre lettere minuscole, con la variante del paese facoltativa (`pt-BR`). */
export const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

const DRAFT_KEY = 'lc.editor.draft';
/** Proprietà che collocano un nodo nel suo contenitore: avvolgendolo passano al contenitore nuovo. */
const WRAP_PLACEMENT = ['region', 'span', 'grow'];
/** Nome di un data source: lo si scrive nelle espressioni e nei passi, quindi un identificativo semplice. */
export const SOURCE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Stato dell'editor: il documento della schermata, l'elemento selezionato, la cronologia per annullare e ripetere,
 * i problemi trovati (schema, espressioni, riferimenti) e i dati di esempio dell'anteprima. La bozza si salva da sola
 * nel browser a ogni modifica.
 */
@Injectable({ providedIn: 'root' })
export class EditorStore extends DocumentState {
  private readonly i18n = inject(I18n);
  private readonly engine = new ExpressionEngine({ can: () => true });
  private readonly t = (key: string, params: Record<string, unknown> = {}): string => this.i18n.t(key, params);

  private readonly draft = readDraft();
  /** Vista centrale dell'editor: anteprima, JSON o data source. */
  readonly view = signal<'preview' | 'json' | 'sources' | 'texts'>('preview');
  /** Risposte finte per data source, usate solo dall'anteprima. */
  readonly samples = signal<Record<string, Json>>(this.draft?.samples ?? {});
  /**
   * Traduzioni scritte nell'editor e non ancora nei cataloghi dell'applicazione: si esportano con «Esporta traduzioni»
   * e intanto valgono già nell'anteprima.
   */
  readonly translations = signal<Translations>(this.draft?.translations ?? {});
  /**
   * Lingue in cui si scrivono le traduzioni: quelle della demo, quelle aggiunte e quelle che hanno già testi. La prima
   * resta la predefinita (il ripiego scritto nel testo vale per lei).
   */
  readonly languages = signal<string[]>(mergeLanguages(this.draft?.languages ?? EDITOR_LOCALES, Object.keys(this.draft?.translations ?? {})));
  /**
   * Lingua predefinita del progetto: quella dei testi di ripiego scritti in `t('chiave', 'Testo')`. Per lei il ripiego
   * basta (non manca nessuna traduzione), «Rendi traducibile» le assegna il testo, non si può togliere; l'anteprima la
   * usa quando manca una traduzione.
   */
  readonly defaultLanguage = signal<string>(this.draft?.defaultLanguage && LANGUAGE_CODE.test(this.draft.defaultLanguage) ? this.draft.defaultLanguage : EDITOR_LOCALES[0]);

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
    super();
    this.doc.set(this.draft?.doc ?? emptyScreen((k) => this.t(k)));
    // Le traduzioni della bozza valgono subito nell'anteprima.
    for (const [locale, messages] of Object.entries(this.translations())) this.i18n.addMessages(locale, messages);
    effect(() => {
      const draft: Draft = { doc: this.doc(), samples: this.samples(), translations: this.translations(), languages: this.languages(), defaultLanguage: this.defaultLanguage() };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // Archiviazione piena o non disponibile: la bozza resta solo in memoria.
      }
    });
  }

  protected selectable(doc: Json, path: Path): boolean {
    return targetAt(doc, path) !== null;
  }

  ownerOf(doc: Json, path: Path): Path {
    return ownerOf(doc, path);
  }

  /** `source`, `call`, `refresh` suggeriscono i data source della schermata, `navigate` le schermate note. */
  override suggestions(property: string): string[] {
    if (['source', 'call', 'refresh'].includes(property)) return this.sourceNames();
    if (property === 'navigate') return this.knownScreens();
    return [];
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
  addNode(kind: string, at = this.insertionPoint()): void {
    const doc = this.doc();
    const template = uniqueInputName(doc, nodeTemplate(kind, (k) => this.t(k)));
    const node: JsonObject = { id: freshId(doc, String(template['type'])), ...template };
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

  /**
   * Nodi selezionati insieme (Ctrl+clic, Maiusc+clic nella struttura): fratelli dello stesso elenco, in ordine. Vuoto =
   * selezione semplice (`selection`). L'elemento principale resta `selection` (proprietà, anteprima).
   */
  readonly multi = signal<Path[]>([]);
  /** I nodi su cui agiscono i comandi: quelli selezionati insieme, altrimenti l'elemento selezionato. */
  readonly selectedPaths = computed<Path[]>(() => (this.multi().length > 1 ? this.multi() : [this.selection()]));

  /** Punto fermo degli intervalli (Maiusc+clic, Maiusc+frecce): l'ultimo nodo scelto senza Maiusc. */
  private anchor: Path | null = null;

  override select(path: Path): void {
    this.multi.set([]);
    this.anchor = path;
    super.select(path);
  }

  override undo(): void {
    this.multi.set([]);
    super.undo();
  }

  override redo(): void {
    this.multi.set([]);
    super.redo();
  }

  override apply(next: Json, options: { select?: Path; coalesce?: string } = {}): void {
    if (next !== this.doc()) this.multi.set([]);
    super.apply(next, options);
  }

  /**
   * Ctrl+clic: aggiunge o toglie un nodo dalla selezione. Vale tra fratelli dello stesso elenco; un nodo di un altro
   * elenco riparte da una selezione semplice.
   */
  toggleSelect(path: Path): void {
    const doc = this.doc();
    if (targetAt(doc, path)?.kind !== 'node') return this.select(path);
    const current = this.selectedPaths().filter((p) => targetAt(doc, p)?.kind === 'node');
    if (!current.length || !current.every((p) => sameList(p, path))) return this.select(path);
    const has = current.some((p) => samePath(p, path));
    const next = sortSiblings(has ? current.filter((p) => !samePath(p, path)) : [...current, path]);
    if (!next.length) return this.select([]);
    this.multi.set(next.length > 1 ? next : []);
    this.anchor = has ? next[next.length - 1] : path;
    super.select(this.anchor);
  }

  /** Maiusc+clic: seleziona i fratelli dal nodo selezionato a quello indicato (stesso elenco). */
  selectRange(path: Path): void {
    const doc = this.doc();
    const anchor = this.anchor && targetAt(doc, this.anchor) ? this.anchor : this.selection();
    if (targetAt(doc, path)?.kind !== 'node' || targetAt(doc, anchor)?.kind !== 'node' || !sameList(anchor, path)) return this.select(path);
    const [from, to] = [anchor.at(-1) as number, path.at(-1) as number].sort((a, b) => a - b);
    const list = path.slice(0, -1);
    const range: Path[] = [];
    for (let i = from; i <= to; i++) range.push([...list, i]);
    this.multi.set(range.length > 1 ? range : []);
    super.select(path);
  }

  /** Avvolge più nodi fratelli in un contenitore nuovo, al posto del primo e nell'ordine in cui stavano. */
  wrapMany(paths: Path[], kind: 'section' | 'box' | 'grid'): void {
    const doc = this.doc();
    const nodes = sortSiblings(paths.filter((p) => targetAt(doc, p)?.kind === 'node'));
    if (nodes.length < 2 || !nodes.every((p) => sameList(p, nodes[0]))) return nodes.length === 1 ? this.wrap(nodes[0], kind) : undefined;
    const list = nodes[0].slice(0, -1);
    const items = getIn(doc, list) as Json[];
    const indexes = new Set(nodes.map((p) => p.at(-1) as number));
    const first = Math.min(...indexes);
    const inner = nodes.map((p) => ({ ...(getIn(doc, p) as JsonObject) }));
    // La collocazione nel contenitore di prima passa al contenitore nuovo (quella del primo nodo).
    const placement: JsonObject = {};
    for (const key of WRAP_PLACEMENT) {
      if (key in inner[0]) placement[key] = inner[0][key];
      for (const node of inner) delete node[key];
    }
    const wrapper: JsonObject = { id: freshId(doc, kind), ...nodeTemplate(kind, (k) => this.t(k)), ...placement, components: inner };
    const rest = items.flatMap((item, i) => (i === first ? [wrapper] : indexes.has(i) ? [] : [item]));
    this.apply(setIn(doc, list, rest), { select: [...list, first] });
  }

  /** Elimina più nodi fratelli insieme (un solo passo da annullare). */
  removeMany(paths: Path[]): void {
    const doc = this.doc();
    const nodes = sortSiblings(paths.filter((p) => targetAt(doc, p)?.kind === 'node'));
    if (nodes.length < 2 || !nodes.every((p) => sameList(p, nodes[0]))) return nodes.length === 1 ? this.remove(nodes[0]) : undefined;
    const list = nodes[0].slice(0, -1);
    const indexes = new Set(nodes.map((p) => p.at(-1) as number));
    const rest = (getIn(doc, list) as Json[]).filter((_, i) => !indexes.has(i));
    const index = Math.min(Math.min(...indexes), rest.length - 1);
    const next = setIn(doc, list, rest);
    this.apply(next, { select: index >= 0 ? [...list, index] : ownerOf(next, list) });
  }

  /**
   * Avvolge un nodo in un contenitore nuovo (sezione, box, griglia) che prende il suo posto. Le proprietà che dicono
   * dove sta il nodo nel contenitore di prima (`region`, `span`, `grow`) passano al contenitore nuovo.
   */
  wrap(path: Path, kind: 'section' | 'box' | 'grid'): void {
    const doc = this.doc();
    const node = getIn(doc, path);
    if (targetAt(doc, path)?.kind !== 'node' || !isObject(node)) return;
    const inner: JsonObject = { ...node };
    const placement: JsonObject = {};
    for (const key of WRAP_PLACEMENT) {
      if (key in inner) {
        placement[key] = inner[key];
        delete inner[key];
      }
    }
    const template = nodeTemplate(kind, (k) => this.t(k));
    const wrapper: JsonObject = { id: freshId(doc, kind), ...template, ...placement, components: [inner] };
    this.apply(setIn(doc, path, wrapper), { select: path });
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

  /** Lingue in cui manca la traduzione di un testo con chiave (nella predefinita basta il ripiego scritto nel testo). */
  missingLocales(entry: TextEntry): string[] {
    if (!entry.key) return [];
    return this.languages().filter((locale) => !this.translation(locale, entry.key!) && !(locale === this.defaultLanguage() && entry.fallback));
  }

  /** Aggiunge una lingua per le traduzioni. Restituisce false se il codice non è valido o la lingua c'è già. */
  addLanguage(code: string): boolean {
    const locale = code.trim();
    if (!LANGUAGE_CODE.test(locale) || this.languages().includes(locale)) return false;
    this.languages.update((all) => [...all, locale]);
    return true;
  }

  /** Rende predefinita una delle lingue (va in testa all'elenco). */
  setDefaultLanguage(locale: string): boolean {
    if (!this.languages().includes(locale)) return false;
    this.defaultLanguage.set(locale);
    this.languages.update((all) => [locale, ...all.filter((l) => l !== locale)]);
    return true;
  }

  /** Toglie una lingua e le traduzioni scritte nell'editor per lei (la predefinita resta). */
  removeLanguage(locale: string): boolean {
    if (locale === this.defaultLanguage() || !this.languages().includes(locale)) return false;
    this.languages.update((all) => all.filter((l) => l !== locale));
    this.translations.update(({ [locale]: _removed, ...rest }) => rest);
    return true;
  }

  /**
   * Importa traduzioni: `{ "<lingua>": { "<chiave>": "testo" } }` (il formato di «Esporta traduzioni»). Le lingue nuove
   * si aggiungono; i testi sostituiscono quelli scritti nell'editor. Restituisce quanti testi sono stati letti, o null
   * se il contenuto non ha questa forma (lingue con codici non validi o testi non di tipo stringa).
   */
  importTranslations(data: unknown): number | null {
    if (!isObject(data as Json)) return null;
    const entries = Object.entries(data as Record<string, unknown>);
    const valid = entries.every(
      ([locale, texts]) => LANGUAGE_CODE.test(locale) && isObject(texts as Json) && Object.values(texts as Record<string, unknown>).every((t) => typeof t === 'string'),
    );
    if (!valid || !entries.length) return null;
    let count = 0;
    for (const [locale, texts] of entries as [string, Record<string, string>][]) {
      if (!this.languages().includes(locale)) this.languages.update((all) => [...all, locale]);
      this.translations.update((all) => ({ ...all, [locale]: { ...all[locale], ...texts } }));
      const nonEmpty = Object.fromEntries(Object.entries(texts).filter(([, t]) => t));
      this.i18n.addMessages(locale, nonEmpty);
      count += Object.keys(texts).length;
    }
    return count;
  }

  /** Testi da sistemare: semplici (non traducibili) o con traduzioni mancanti. */
  readonly textsToFix = computed(() => {
    this.translations();
    return collectTexts(this.doc()).filter((e) => e.kind === 'plain' || this.missingLocales(e).length).length;
  });

  /** Il testo di una chiave in una lingua: quello scritto nell'editor, altrimenti quello del catalogo. */
  translation(locale: string, key: string): string | undefined {
    return this.translations()[locale]?.[key] ?? this.i18n.raw(key, locale);
  }

  setTranslation(locale: string, key: string, text: string): void {
    this.translations.update((all) => ({ ...all, [locale]: { ...all[locale], [key]: text } }));
    // Un testo vuoto resta nella bozza (da completare) ma non sostituisce quello del catalogo nell'anteprima.
    if (text) this.i18n.addMessages(locale, { [key]: text });
  }

  /**
   * Rende traducibile un testo semplice: lo sostituisce con `{{ t('chiave', 'Testo') }}` (chiave nuova dal testo) e
   * scrive il testo come traduzione nella lingua predefinita. Restituisce la chiave, o null se il testo non si converte.
   */
  makeTranslatable(path: Path): string | null {
    const doc = this.doc();
    const text = getIn(doc, path);
    if (typeof text !== 'string' || text.includes('{{')) return null;
    const used = usedKeys(collectTexts(doc));
    for (const locale of Object.keys(this.translations())) Object.keys(this.translations()[locale]).forEach((k) => used.add(k));
    const screen = isObject(doc) && typeof doc['screen'] === 'string' ? doc['screen'] : '';
    const key = makeKey(screen, text, used);
    const value = translatable(key, text);
    if (!value) return null;
    this.apply(setIn(doc, path, value));
    this.setTranslation(this.defaultLanguage(), key, text);
    return key;
  }

  setSample(source: string, value: Json | undefined): void {
    this.samples.update((all) => {
      const next = { ...all };
      if (value === undefined) delete next[source];
      else next[source] = value;
      return next;
    });
  }

  /**
   * Aggiunge più data source in un solo passo da annullare (importazione da OpenAPI). I nomi già usati non si
   * sovrascrivono; i dati di esempio si impostano solo per i data source nuovi. Restituisce i nomi aggiunti.
   */
  importSources(entries: { name: string; source: JsonObject; sample?: Json }[]): string[] {
    const existing = new Set(this.sourceNames());
    const fresh = entries.filter((e) => SOURCE_NAME.test(e.name) && !existing.has(e.name));
    if (!fresh.length) return [];
    let next = this.doc();
    for (const entry of fresh) next = setIn(next, ['dataSources', entry.name], entry.source);
    this.apply(next);
    for (const entry of fresh) if (entry.sample !== undefined) this.setSample(entry.name, entry.sample);
    return fresh.map((e) => e.name);
  }

  /** Apre un documento (file, esempio, nuova schermata): azzera cronologia e selezione. */
  load(doc: Json, samples: Record<string, Json> = {}): void {
    this.reset(doc);
    this.samples.set(samples);
    this.translations.set({});
  }

  newScreen(): void {
    this.load(emptyScreen((k) => this.t(k)));
  }

  protected check(doc: Json): EditorIssue[] {
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
    if (!isObject(parsed as unknown as Json) || parsed.doc === undefined) return null;
    const translations = isObject(parsed.translations as unknown as Json) ? parsed.translations : {};
    const languages = Array.isArray(parsed.languages) ? parsed.languages.filter((l) => typeof l === 'string' && LANGUAGE_CODE.test(l)) : undefined;
    const defaultLanguage = typeof parsed.defaultLanguage === 'string' ? parsed.defaultLanguage : undefined;
    return { doc: parsed.doc, samples: isObject(parsed.samples) ? parsed.samples : {}, translations, languages, defaultLanguage };
  } catch {
    return null;
  }
}

/** Lingue senza ripetizioni, nell'ordine: prima quelle indicate, poi le altre. */
function mergeLanguages(first: readonly string[], more: readonly string[]): string[] {
  return [...new Set([...first, ...more].filter((l) => LANGUAGE_CODE.test(l)))];
}

/** Due percorsi nello stesso elenco (fratelli). */
function sameList(a: Path, b: Path): boolean {
  return a.length === b.length && typeof a.at(-1) === 'number' && typeof b.at(-1) === 'number' && samePath(a.slice(0, -1), b.slice(0, -1));
}

/** Percorsi di fratelli in ordine di posizione, senza ripetizioni. */
function sortSiblings(paths: Path[]): Path[] {
  const seen = new Set<string>();
  return paths
    .filter((p) => {
      const key = p.join('/');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.at(-1) as number) - (b.at(-1) as number));
}
