import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { I18n, checkScreenExpressions } from 'core';
import { ExpressionEngine } from 'expressions';
import { splitReference, validateScreen, type ScreenDefinition } from 'schema';
import { fromPointer, getIn, insertAt, isObject, moveBy, moveTo, removeAt, samePath, setIn, startsWith, toPointer, type Json, type JsonObject, type Path } from './doc-ops';
import { DataSourceList, SOURCE_NAME } from './datasources-store';
import { DOCUMENT_ID, DocumentState, readDraft, writeDraft, type EditorIssue } from './document-state';
import { KnownDataSources, KnownScreens, KnownTranslations, NodeClipboard } from './shared-state';
import { childSlots, ownerOf, targetAt } from './schema-info';
import { emptyScreen, ensureSource, freshId, nodeTemplate, uniqueInputName, usedIds, withFreshIds } from './templates';
import { collectTexts, makeKey, translatable, usedKeys, type TextEntry } from './texts';

export type { EditorIssue } from './document-state';

/** Draft saved in the browser: the document and the sample data of the preview. */
interface Draft {
  doc: Json;
  samples: Record<string, Json>;
  translations: Translations;
  /** Languages of the translations (besides those with texts already written). */
  languages?: string[];
  /** Default language: the one of the fallback texts written in the screens. */
  defaultLanguage?: string;
}

/** Translations written in the editor: language → key → text. */
export type Translations = Record<string, Record<string, string>>;

/** Starting languages of the translations (those of the demo); others can be added in the «Texts» panel. */
export const EDITOR_LOCALES = ['en', 'it'];
/** Code of a language: two or three lower-case letters, with an optional country variant (`pt-BR`). */
export const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

/** Properties placing a node in its container: when it is wrapped they move to the new container. */
const WRAP_PLACEMENT = ['region', 'span', 'grow'];
export { SOURCE_NAME } from './datasources-store';

/**
 * State of the editor: the screen document, the selected element, the history for undo and redo,
 * the problems found (schema, expressions, references) and the sample data of the preview. The draft saves itself
 * in the browser at every change, under the identifier of the document (`DOCUMENT_ID`): every window has its own store.
 */
@Injectable()
export class EditorStore extends DocumentState implements DataSourceList {
  readonly listPath: Path = ['dataSources'];
  private readonly i18n = inject(I18n);
  private readonly engine = new ExpressionEngine({ can: () => true });
  private readonly t = (key: string, params: Record<string, unknown> = {}): string => this.i18n.t(key, params);

  private readonly id = inject(DOCUMENT_ID);
  private readonly draft = screenDraft(readDraft(this.id));
  /** Central view of the editor: preview, JSON or data sources. */
  readonly view = signal<'preview' | 'json' | 'sources' | 'texts'>('preview');
  /** Fake responses for data sources, used only by the preview. */
  readonly samples = signal<Record<string, Json>>(this.draft?.samples ?? {});
  /**
   * Translations written in the editor and not yet in the application's catalogues: they are exported with «Export translations»
   * and meanwhile they already apply in the preview.
   */
  readonly translations = signal<Translations>(this.draft?.translations ?? {});
  /**
   * Languages in which translations are written: those of the demo, those added and those that already have texts. The first
   * stays the default one (the fallback written in the text is for it).
   */
  readonly languages = signal<string[]>(mergeLanguages(this.draft?.languages ?? EDITOR_LOCALES, Object.keys(this.draft?.translations ?? {})));
  /**
   * Default language of the project: the one of the fallback texts written in `t('key', 'Text')`. For it the fallback
   * is enough (no translation is missing), «Make translatable» gives it the text, it cannot be removed; the preview
   * uses it when a translation is missing.
   */
  readonly defaultLanguage = signal<string>(this.draft?.defaultLanguage && LANGUAGE_CODE.test(this.draft.defaultLanguage) ? this.draft.defaultLanguage : EDITOR_LOCALES[0]);

  /** The document as a valid screen, or null if it has errors (the preview then shows the last valid version). */
  readonly definition = computed<ScreenDefinition | null>(() => (this.errorCount() === 0 ? (this.doc() as unknown as ScreenDefinition) : null));
  readonly target = computed(() => targetAt(this.doc(), this.selection()));
  /**
   * Languages and catalogues of the project (null without a project). With a project the languages are those of the
   * project, the texts come from its catalogues and the translations written here go into them when the screen is saved.
   */
  private readonly projectTexts = inject(KnownTranslations).project;
  /** Data sources documents of the project, to check the references of the data sources (null without a project). */
  private readonly projectSources = inject(KnownDataSources).documents;
  /** Known screens (project, registry, open documents), suggested in the `navigate` steps. */
  readonly knownScreens = inject(KnownScreens).names;
  /** Names of the data sources of the screen. */
  readonly sourceNames = computed(() => {
    const sources = getIn(this.doc(), ['dataSources']);
    return isObject(sources) ? Object.keys(sources) : [];
  });

  constructor() {
    super();
    this.doc.set(this.draft?.doc ?? emptyScreen((k) => this.t(k)));
    // The translations of the draft apply at once in the preview.
    for (const [locale, messages] of Object.entries(this.translations())) this.i18n.addMessages(locale, messages);
    // With a project, its languages and its default language.
    effect(() => {
      const project = this.projectTexts();
      if (!project) return;
      this.languages.set(mergeLanguages([project.defaultLanguage], project.languages));
      this.defaultLanguage.set(project.defaultLanguage);
    });
    effect(() => {
      const draft: Draft = { doc: this.doc(), samples: this.samples(), translations: this.translations(), languages: this.languages(), defaultLanguage: this.defaultLanguage() };
      writeDraft(this.id, draft);
    });
  }

  protected selectable(doc: Json, path: Path): boolean {
    return targetAt(doc, path) !== null;
  }

  ownerOf(doc: Json, path: Path): Path {
    return ownerOf(doc, path);
  }

  /** Names of the sequences of the screen (`actions`). */
  readonly actionNames = computed(() => {
    const actions = getIn(this.doc(), ['actions']);
    return isObject(actions) ? Object.keys(actions) : [];
  });

  /**
   * `source`, `call`, `refresh` suggest the data sources of the screen, `navigate` the known screens, `run` the
   * named sequences.
   */
  override suggestions(property: string): string[] {
    if (['source', 'call', 'refresh'].includes(property)) return this.sourceNames();
    if (property === 'navigate') return this.knownScreens();
    if (property === 'run') return this.actionNames();
    return [];
  }

  /** Path of the element (node, tab, step) with this identifier, or null. */
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

  /** Where a new node goes: inside the selected element if it is a container, otherwise right after it. */
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
    // A node with tabs or steps: the new node goes after it.
    const components = getIn(doc, ['components']);
    return { list: ['components'], index: Array.isArray(components) ? components.length : 0 };
  }

  /** Adds a node of the given type (from its template) and selects it; creates the data source it uses, if missing. */
  addNode(kind: string, at = this.insertionPoint()): void {
    const doc = this.doc();
    const template = uniqueInputName(doc, nodeTemplate(kind, (k) => this.t(k)));
    const node: JsonObject = { id: freshId(doc, String(template['type'])), ...template };
    const next = insertAt(ensureSource(doc, node), at.list, at.index, node);
    const list = getIn(next, at.list) as Json[];
    this.apply(next, { select: [...at.list, Math.min(at.index, list.length - 1)] });
  }

  /** Adds a tab (tabs) or a step (wizard) to the given node. */
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

  /** Moves a node to another list of nodes (dragging in the outline). */
  moveNode(from: Path, toList: Path, index: number): boolean {
    if (startsWith(toList, from)) return false;
    const result = moveTo(this.doc(), from, toList, index);
    if (!result) return false;
    this.apply(result.doc, { select: result.path });
    return true;
  }

  /**
   * Nodes selected together (Ctrl+click, Shift+click in the outline): siblings of the same list, in order. Empty =
   * simple selection (`selection`). The main element stays `selection` (properties, preview).
   */
  readonly multi = signal<Path[]>([]);
  /** The nodes the commands act on: those selected together, otherwise the selected element. */
  readonly selectedPaths = computed<Path[]>(() => (this.multi().length > 1 ? this.multi() : [this.selection()]));

  /** Anchor of ranges (Shift+click, Shift+arrows): the last node chosen without Shift. */
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
   * Ctrl+click: adds or removes a node from the selection. It works between siblings of the same list; a node of another
   * list starts again from a simple selection.
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

  /** Shift+click: selects the siblings from the selected node to the given one (same list). */
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

  /** Wraps several sibling nodes in a new container, in place of the first and in the order they were in. */
  wrapMany(paths: Path[], kind: 'section' | 'box' | 'grid'): void {
    const doc = this.doc();
    const nodes = sortSiblings(paths.filter((p) => targetAt(doc, p)?.kind === 'node'));
    if (nodes.length < 2 || !nodes.every((p) => sameList(p, nodes[0]))) return nodes.length === 1 ? this.wrap(nodes[0], kind) : undefined;
    const list = nodes[0].slice(0, -1);
    const items = getIn(doc, list) as Json[];
    const indexes = new Set(nodes.map((p) => p.at(-1) as number));
    const first = Math.min(...indexes);
    const inner = nodes.map((p) => ({ ...(getIn(doc, p) as JsonObject) }));
    // The placement in the previous container moves to the new container (that of the first node).
    const placement: JsonObject = {};
    for (const key of WRAP_PLACEMENT) {
      if (key in inner[0]) placement[key] = inner[0][key];
      for (const node of inner) delete node[key];
    }
    const wrapper: JsonObject = { id: freshId(doc, kind), ...nodeTemplate(kind, (k) => this.t(k)), ...placement, components: inner };
    const rest = items.flatMap((item, i) => (i === first ? [wrapper] : indexes.has(i) ? [] : [item]));
    this.apply(setIn(doc, list, rest), { select: [...list, first] });
  }

  /** Deletes several sibling nodes together (a single step to undo). */
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
   * Wraps a node in a new container (section, box, grid) that takes its place. The properties saying
   * where the node sits in the previous container (`region`, `span`, `grow`) move to the new container.
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

  /** Node copied or cut, to paste at the insertion point (also in another container or in another open screen). */
  readonly clipboard = inject(NodeClipboard).node;

  copy(path: Path): void {
    if (targetAt(this.doc(), path)?.kind !== 'node') return;
    this.clipboard.set(getIn(this.doc(), path) ?? null);
  }

  cut(path: Path): void {
    if (targetAt(this.doc(), path)?.kind !== 'node') return;
    this.copy(path);
    this.remove(path);
  }

  /** Pastes the copied node at the insertion point, with new identifiers if the copied ones are already in use. */
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

  /** Adds a GET data source with a free name and returns it. */
  addSource(): string {
    const names = new Set(this.sourceNames());
    let name = 'data';
    for (let n = 2; names.has(name); n++) name = `data${n}`;
    this.apply(setIn(this.doc(), ['dataSources', name], { type: 'rest', method: 'GET', url: `/api/${name}` }));
    return name;
  }

  /**
   * Renames a data source, updating the nodes using it (`source`), the steps calling it (`call`, `refresh`)
   * and the sample data. Returns false if the name is not valid or already in use.
   */
  renameSource(from: string, to: string): boolean {
    if (from === to) return true;
    if (!SOURCE_NAME.test(to) || this.sourceNames().includes(to)) return false;
    const doc = this.doc();
    const sources = getIn(doc, ['dataSources']) as JsonObject;
    // Same order as before, with the new name in place of the old one.
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

  /** Languages missing the translation of a keyed text (in the default one the fallback written in the text is enough). */
  missingLocales(entry: TextEntry): string[] {
    if (!entry.key) return [];
    return this.languages().filter((locale) => !this.translation(locale, entry.key!) && !(locale === this.defaultLanguage() && entry.fallback));
  }

  /** Adds a language for the translations. Returns false if the code is not valid or the language is already there. */
  addLanguage(code: string): boolean {
    const locale = code.trim();
    if (this.projectTexts() || !LANGUAGE_CODE.test(locale) || this.languages().includes(locale)) return false;
    this.languages.update((all) => [...all, locale]);
    return true;
  }

  /** Makes one of the languages the default (it goes to the top of the list). */
  setDefaultLanguage(locale: string): boolean {
    if (this.projectTexts() || !this.languages().includes(locale)) return false;
    this.defaultLanguage.set(locale);
    this.languages.update((all) => [locale, ...all.filter((l) => l !== locale)]);
    return true;
  }

  /** Removes a language and the translations written in the editor for it (the default one stays). */
  removeLanguage(locale: string): boolean {
    if (this.projectTexts() || locale === this.defaultLanguage() || !this.languages().includes(locale)) return false;
    this.languages.update((all) => all.filter((l) => l !== locale));
    this.translations.update(({ [locale]: _removed, ...rest }) => rest);
    return true;
  }

  /**
   * Imports translations: `{ "<language>": { "<key>": "text" } }` (the format of «Export translations»). New languages
   * are added; the texts replace those written in the editor. Returns how many texts were read, or null
   * if the content does not have this shape (languages with invalid codes or texts that are not strings).
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
      // With a project only its languages are taken (they are added in the settings of the project).
      if (this.projectTexts() && !this.languages().includes(locale)) continue;
      if (!this.languages().includes(locale)) this.languages.update((all) => [...all, locale]);
      this.translations.update((all) => ({ ...all, [locale]: { ...all[locale], ...texts } }));
      const nonEmpty = Object.fromEntries(Object.entries(texts).filter(([, t]) => t));
      this.i18n.addMessages(locale, nonEmpty);
      count += Object.keys(texts).length;
    }
    return count;
  }

  /** Texts to fix: plain (not translatable) or with missing translations. */
  readonly textsToFix = computed(() => {
    this.translations();
    return collectTexts(this.doc()).filter((e) => e.kind === 'plain' || this.missingLocales(e).length).length;
  });

  /** The text of a key in a language: the one written in the editor, otherwise the catalogue's (the project's, with a project). */
  translation(locale: string, key: string): string | undefined {
    const project = this.projectTexts();
    return this.translations()[locale]?.[key] ?? (project ? project.catalogues[locale]?.[key] : this.i18n.raw(key, locale));
  }

  /** Translations written here and not yet in the catalogues of the project (they go there when the screen is saved). */
  readonly pendingTranslations = computed(() => Object.values(this.translations()).some((texts) => Object.keys(texts).length > 0));

  setTranslation(locale: string, key: string, text: string): void {
    this.translations.update((all) => ({ ...all, [locale]: { ...all[locale], [key]: text } }));
    // An empty text stays in the draft (to be completed) but does not replace the catalogue's in the preview.
    if (text) this.i18n.addMessages(locale, { [key]: text });
  }

  /**
   * Makes a plain text translatable: replaces it with `{{ t('key', 'Text') }}` (a new key from the text) and
   * writes the text as the translation in the default language. Returns the key, or null if the text does not convert.
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
   * Adds several data sources in a single step to undo (import from OpenAPI). Names already in use are not
   * overwritten; sample data are set only for the new data sources. Returns the names added.
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

  /** Opens a document (file, example, new screen): clears history and selection. */
  override load(doc: Json, samples: Record<string, Json> = {}): void {
    this.reset(doc);
    this.samples.set(samples);
    this.translations.set({});
  }

  newScreen(title?: string, screen?: string): void {
    this.load(emptyScreen((k) => this.t(k), title, screen));
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
    this.checkProjectSources(doc, add);
    return issues;
  }

  /** References to the data sources of the project that do not resolve: the runtime would leave them out. */
  private checkProjectSources(doc: Json, add: (pointer: string, message: string, severity: EditorIssue['severity']) => void): void {
    const documents = this.projectSources();
    const sources = getIn(doc, ['dataSources']);
    if (!documents || !isObject(sources)) return;
    for (const [name, entry] of Object.entries(sources)) {
      const ref = isObject(entry) ? entry['ref'] : undefined;
      if (typeof ref !== 'string') continue;
      const [document, source] = splitReference(ref);
      const pointer = toPointer(['dataSources', name, 'ref']);
      if (!documents[document]) add(pointer, this.t('ed.issue.unknownDataSources', { document }), 'warning');
      else if (!documents[document].sources[source]) add(pointer, this.t('ed.issue.unknownProjectSource', { ref }), 'warning');
    }
  }

  /** Checks the schema does not do: data sources that do not exist and repeated identifiers. */
  private checkReferences(doc: Json, add: (pointer: string, message: string, severity: EditorIssue['severity']) => void): void {
    const sources = getIn(doc, ['dataSources']);
    const names = new Set(isObject(sources) ? Object.keys(sources) : []);
    const declared = getIn(doc, ['actions']);
    const actions = new Set(isObject(declared) ? Object.keys(declared) : []);
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
      if (typeof value['run'] === 'string' && !actions.has(value['run'])) {
        add(toPointer([...path, 'run']), this.t('ed.issue.unknownAction', { name: value['run'] }), 'warning');
      }
      // Only the identifiers of the elements of the screen (nodes, tabs, steps): an `id` elsewhere (the `args` of a step,
      // a parameter) is a value, which may repeat.
      if (typeof value['id'] === 'string' && targetAt(doc, path) !== null) {
        if (seen.has(value['id'])) add(toPointer([...path, 'id']), this.t('ed.issue.duplicateId', { id: value['id'] }), 'error');
        seen.add(value['id']);
      }
      for (const [key, child] of Object.entries(value)) if (key !== 'dataSources' || path.length) visit(child, [...path, key]);
    };
    visit(doc, []);
  }
}

/** The draft read from the browser, if it has the expected shape. */
function screenDraft(value: unknown): Draft | null {
  if (!isObject(value as Json)) return null;
  const parsed = value as Draft;
  if (parsed.doc === undefined) return null;
  const translations = isObject(parsed.translations as unknown as Json) ? parsed.translations : {};
  const languages = Array.isArray(parsed.languages) ? parsed.languages.filter((l) => typeof l === 'string' && LANGUAGE_CODE.test(l)) : undefined;
  const defaultLanguage = typeof parsed.defaultLanguage === 'string' ? parsed.defaultLanguage : undefined;
  return { doc: parsed.doc, samples: isObject(parsed.samples) ? parsed.samples : {}, translations, languages, defaultLanguage };
}

/** Languages without repetitions, in order: first the given ones, then the others. */
function mergeLanguages(first: readonly string[], more: readonly string[]): string[] {
  return [...new Set([...first, ...more].filter((l) => LANGUAGE_CODE.test(l)))];
}

/** Two paths in the same list (siblings). */
function sameList(a: Path, b: Path): boolean {
  return a.length === b.length && typeof a.at(-1) === 'number' && typeof b.at(-1) === 'number' && samePath(a.slice(0, -1), b.slice(0, -1));
}

/** Paths of siblings in position order, without repetitions. */
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
