import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ICON_TYPES } from 'components';
import { I18n, checkScreenExpressions } from 'core';
import { ExpressionEngine } from 'expressions';
import { NAVIGATION_SCHEMA, validateNavigation, type NavigationDefinition } from 'schema';
import { fromPointer, getIn, insertAt, isObject, moveBy, removeAt, samePath, toPointer, type Json, type JsonObject, type Path } from './doc-ops';
import { DocumentState, type EditorIssue } from './document-state';
import { SchemaReader, type PropertyInfo, type Schema } from './schema-info';

/**
 * La navigazione dell'applicazione (casi d'uso e menu a tre livelli) come documento dell'editor. Livelli fissati dallo
 * schema: caso d'uso → gruppo → sottogruppo → voce; una voce apre una schermata.
 */

export const NAVIGATION = new SchemaReader(NAVIGATION_SCHEMA as unknown as Schema);

export type NavTarget = { kind: 'root' } | { kind: 'useCase' } | { kind: 'group'; level: 1 | 2 } | { kind: 'leaf' };

/** Profondità di un percorso nel menu: 1 dentro un caso d'uso, 2 dentro un gruppo, 3 dentro un sottogruppo. */
function depthOf(path: Path): number {
  return path.filter((k) => k === 'items' || k === 'children').length;
}

export function navTargetAt(doc: Json, path: Path): NavTarget | null {
  if (path.length === 0) return { kind: 'root' };
  const value = getIn(doc, path);
  if (!isObject(value) || typeof path.at(-1) !== 'number') return null;
  const list = path.at(-2);
  if (list === 'useCases' && path.length === 2) return { kind: 'useCase' };
  if (list !== 'items' && list !== 'children') return null;
  const depth = depthOf(path);
  if (Array.isArray(value['children']) && depth < 3) return { kind: 'group', level: depth as 1 | 2 };
  return { kind: 'leaf' };
}

export function navOwnerOf(doc: Json, path: Path): Path {
  for (let end = path.length; end > 0; end--) {
    const candidate = path.slice(0, end);
    if (navTargetAt(doc, candidate)) return candidate;
  }
  return [];
}

/** L'elenco dei figli di un elemento (casi d'uso della radice, voci di un caso d'uso o di un gruppo). */
export function navChildList(doc: Json, path: Path): Path | null {
  const target = navTargetAt(doc, path);
  if (!target) return null;
  if (target.kind === 'root') return ['useCases'];
  if (target.kind === 'useCase') return [...path, 'items'];
  if (target.kind === 'group') return [...path, 'children'];
  return null;
}

/** Nell'elemento si può aggiungere un gruppo? (Al massimo due livelli di gruppi sotto un caso d'uso.) */
export function canAddGroup(doc: Json, path: Path): boolean {
  const target = navTargetAt(doc, path);
  return target?.kind === 'useCase' || (target?.kind === 'group' && target.level === 1);
}

/** Proprietà mostrate nel pannello per un elemento (i figli si gestiscono nella struttura). */
export function navProperties(target: NavTarget): PropertyInfo[] {
  const props =
    target.kind === 'root'
      ? NAVIGATION.rootProperties()
      : NAVIGATION.definitionProperties(target.kind === 'useCase' ? 'useCase' : target.kind === 'leaf' ? 'leaf' : target.level === 1 ? 'group1' : 'group2');
  return props.filter((p) => !['useCases', 'items', 'children'].includes(p.name));
}

type Translate = (key: string) => string;

export function emptyNavigation(t: Translate): JsonObject {
  return { schemaVersion: '1.0', navigation: 'applicazione', useCases: [useCaseTemplate('caso-1', 'voce-1', t)] };
}

function useCaseTemplate(id: string, leafId: string, t: Translate): JsonObject {
  return { id, label: t('ed.nav.newUseCase'), items: [leafTemplate(leafId, t)] };
}

function leafTemplate(id: string, t: Translate, screen = 'nuova-schermata'): JsonObject {
  return { id, label: t('ed.nav.newLeaf'), screen };
}

const DRAFT_KEY = 'lc.editor.navigation';

@Injectable({ providedIn: 'root' })
export class NavigationStore extends DocumentState {
  private readonly i18n = inject(I18n);
  private readonly engine = new ExpressionEngine({ can: () => true });
  private readonly t = (key: string, params: Record<string, unknown> = {}): string => this.i18n.t(key, params);

  /** Schermate note (gli esempi): suggerite per le voci e controllate. */
  readonly knownScreens = signal<string[]>([]);
  readonly target = computed(() => navTargetAt(this.doc(), this.selection()));
  /** La navigazione come definizione valida, oppure null se ha errori. */
  readonly definition = computed<NavigationDefinition | null>(() => (this.errorCount() === 0 ? (this.doc() as unknown as NavigationDefinition) : null));
  /** Permessi citati dal menu (`requires`), per simulare i profili nell'anteprima. */
  readonly permissions = computed(() => {
    const found = new Set<string>();
    const visit = (value: Json): void => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (isObject(value)) {
        if (typeof value['requires'] === 'string') found.add(value['requires']);
        Object.values(value).forEach(visit);
      }
    };
    visit(this.doc());
    return [...found].sort();
  });

  constructor() {
    super();
    this.doc.set(readDraft() ?? emptyNavigation((k) => this.t(k)));
    effect(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(this.doc()));
      } catch {
        // Archiviazione non disponibile: la bozza resta in memoria.
      }
    });
  }

  protected selectable(doc: Json, path: Path): boolean {
    return navTargetAt(doc, path) !== null;
  }

  ownerOf(doc: Json, path: Path): Path {
    return navOwnerOf(doc, path);
  }

  override suggestions(property: string): string[] {
    if (property === 'screen') return this.knownScreens();
    if (property === 'icon') return Object.keys(ICON_TYPES).sort();
    if (property === 'requires') return this.permissions();
    if (property === 'default') {
      const useCases = getIn(this.doc(), ['useCases']);
      return Array.isArray(useCases) ? useCases.map((u) => (isObject(u) ? String(u['id'] ?? '') : '')).filter(Boolean) : [];
    }
    return [];
  }

  load(doc: Json): void {
    this.reset(doc);
  }

  newNavigation(): void {
    this.reset(emptyNavigation((k) => this.t(k)));
  }

  /** Aggiunge un caso d'uso in fondo, con una voce. */
  addUseCase(): void {
    const doc = this.doc();
    const list = getIn(doc, ['useCases']);
    const index = Array.isArray(list) ? list.length : 0;
    const node = useCaseTemplate(this.freshId('caso'), this.freshId('voce'), (k) => this.t(k));
    this.apply(insertAt(doc, ['useCases'], index, node), { select: ['useCases', index] });
  }

  /**
   * Dove va una voce (o un gruppo) nuova: dentro il caso d'uso o il gruppo selezionato, altrimenti accanto all'elemento
   * selezionato. Null se lì non può stare (un gruppo oltre il secondo livello, niente selezionato).
   */
  itemPoint(kind: 'leaf' | 'group', doc = this.doc(), selection = this.selection()): { list: Path; index: number } | null {
    const target = navTargetAt(doc, selection);
    if (!target || target.kind === 'root') return null;
    const inside = target.kind === 'useCase' || (target.kind === 'group' && (kind === 'leaf' || canAddGroup(doc, selection)));
    if (inside) {
      const list = navChildList(doc, selection)!;
      const items = getIn(doc, list);
      return { list, index: Array.isArray(items) ? items.length : 0 };
    }
    const parent = selection.slice(0, -2);
    if (kind === 'group' && !canAddGroup(doc, parent)) return null;
    return { list: selection.slice(0, -1), index: (selection.at(-1) as number) + 1 };
  }

  /** Aggiunge una voce, o un gruppo con una voce, nel punto indicato da `itemPoint`, e la seleziona. */
  addItem(kind: 'leaf' | 'group'): void {
    const doc = this.doc();
    const point = this.itemPoint(kind, doc);
    if (!point) return;
    const leaf = leafTemplate(this.freshId('voce'), (k) => this.t(k), this.knownScreens()[0] ?? 'nuova-schermata');
    const node = kind === 'leaf' ? leaf : { id: this.freshId('gruppo'), label: this.t('ed.nav.newGroup'), children: [leaf] };
    this.apply(insertAt(doc, point.list, point.index, node), { select: [...point.list, point.index] });
  }

  remove(path: Path): void {
    if (!path.length) return;
    const next = removeAt(this.doc(), path);
    const list = getIn(next, path.slice(0, -1));
    const index = path.at(-1) as number;
    const sibling = Array.isArray(list) && list.length ? [...path.slice(0, -1), Math.min(index, list.length - 1)] : null;
    this.apply(next, { select: sibling && navTargetAt(next, sibling) ? sibling : navOwnerOf(next, path.slice(0, -1)) });
  }

  duplicate(path: Path): void {
    const doc = this.doc();
    const value = getIn(doc, path);
    if (!isObject(value) || typeof path.at(-1) !== 'number') return;
    const copy = this.withFreshIds(value);
    const at = (path.at(-1) as number) + 1;
    this.apply(insertAt(doc, path.slice(0, -1), at, copy), { select: [...path.slice(0, -1), at] });
  }

  move(path: Path, delta: number): void {
    const result = moveBy(this.doc(), path, delta);
    if (samePath(result.path, path)) return;
    this.apply(result.doc, { select: result.path });
  }

  private usedIds(): Set<string> {
    const used = new Set<string>();
    const visit = (value: Json): void => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (isObject(value)) {
        if (typeof value['id'] === 'string') used.add(value['id']);
        Object.values(value).forEach(visit);
      }
    };
    visit(this.doc());
    return used;
  }

  private freshId(base: string, used = this.usedIds()): string {
    for (let n = 1; ; n++) {
      const id = `${base}-${n}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  }

  private withFreshIds(value: Json, used = this.usedIds()): Json {
    if (Array.isArray(value)) return value.map((v) => this.withFreshIds(v, used));
    if (!isObject(value)) return value;
    const copy: JsonObject = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.withFreshIds(v, used)]));
    if (typeof copy['id'] === 'string') copy['id'] = this.freshId(copy['id'].replace(/-\d+$/, ''), used);
    return copy;
  }

  protected check(doc: Json): EditorIssue[] {
    const issues: EditorIssue[] = [];
    const add = (pointer: string, message: string, severity: EditorIssue['severity']): void => {
      issues.push({ owner: navOwnerOf(doc, fromPointer(pointer)), pointer, message, severity });
    };
    const result = validateNavigation(doc);
    if (!result.valid) result.issues.forEach((i) => add(i.path, i.message, 'error'));
    checkScreenExpressions(doc, this.engine).forEach((p) => add(p.path, p.message, 'error'));
    // Identificativi ripetuti tra elementi dello stesso elenco: l'indirizzo di una voce è la sequenza degli id.
    const visitList = (list: Json, path: Path): void => {
      if (!Array.isArray(list)) return;
      const seen = new Set<string>();
      list.forEach((item, i) => {
        if (!isObject(item)) return;
        const id = item['id'];
        if (typeof id === 'string') {
          if (seen.has(id)) add(toPointer([...path, i, 'id']), this.t('ed.issue.duplicateId', { id }), 'error');
          seen.add(id);
        }
        for (const key of ['items', 'children']) visitList(item[key], [...path, i, key]);
        const screen = item['screen'];
        const known = this.knownScreens();
        if (typeof screen === 'string' && known.length && !known.includes(screen)) {
          add(toPointer([...path, i, 'screen']), this.t('ed.issue.unknownScreen', { screen }), 'warning');
        }
      });
    };
    visitList(getIn(doc, ['useCases']) ?? null, ['useCases']);
    const fallback = getIn(doc, ['default']);
    if (typeof fallback === 'string' && !this.suggestions('default').includes(fallback)) {
      add('/default', this.t('ed.issue.unknownUseCase', { id: fallback }), 'warning');
    }
    return issues;
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
