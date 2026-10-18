import { Injectable, computed, effect, inject } from '@angular/core';
import { ICON_TYPES } from 'components';
import { I18n, checkScreenExpressions } from 'core';
import { ExpressionEngine } from 'expressions';
import { NAVIGATION_SCHEMA, validateNavigation, type NavigationDefinition } from 'schema';
import { fromPointer, getIn, insertAt, isObject, moveBy, removeAt, samePath, toPointer, type Json, type JsonObject, type Path } from './doc-ops';
import { DOCUMENT_ID, DocumentState, readDraft, writeDraft, type EditorIssue } from './document-state';
import { KnownScreens } from './shared-state';
import { SchemaReader, type PropertyInfo, type Schema } from './schema-info';

/**
 * The navigation of the application (areas and three-level menus) as an editor document. Levels fixed by the
 * schema: area → group → subgroup → item; an item opens a screen.
 */

export const NAVIGATION = new SchemaReader(NAVIGATION_SCHEMA as unknown as Schema);

export type NavTarget = { kind: 'root' } | { kind: 'area' } | { kind: 'group'; level: 1 | 2 } | { kind: 'leaf' };

/** Depth of a path in the menu: 1 inside an area, 2 inside a group, 3 inside a subgroup. */
function depthOf(path: Path): number {
  return path.filter((k) => k === 'items' || k === 'children').length;
}

export function navTargetAt(doc: Json, path: Path): NavTarget | null {
  if (path.length === 0) return { kind: 'root' };
  const value = getIn(doc, path);
  if (!isObject(value) || typeof path.at(-1) !== 'number') return null;
  const list = path.at(-2);
  if (list === 'areas' && path.length === 2) return { kind: 'area' };
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

/** The list of children of an element (areas of the root, items of an area or of a group). */
export function navChildList(doc: Json, path: Path): Path | null {
  const target = navTargetAt(doc, path);
  if (!target) return null;
  if (target.kind === 'root') return ['areas'];
  if (target.kind === 'area') return [...path, 'items'];
  if (target.kind === 'group') return [...path, 'children'];
  return null;
}

/** Can a group be added in the element? (At most two levels of groups under an area.) */
export function canAddGroup(doc: Json, path: Path): boolean {
  const target = navTargetAt(doc, path);
  return target?.kind === 'area' || (target?.kind === 'group' && target.level === 1);
}

/** Properties shown in the panel for an element (the children are managed in the outline). */
export function navProperties(target: NavTarget): PropertyInfo[] {
  const props =
    target.kind === 'root'
      ? NAVIGATION.rootProperties()
      : NAVIGATION.definitionProperties(target.kind === 'area' ? 'area' : target.kind === 'leaf' ? 'leaf' : target.level === 1 ? 'group1' : 'group2');
  return props.filter((p) => !['areas', 'items', 'children'].includes(p.name));
}

type Translate = (key: string) => string;

export function emptyNavigation(t: Translate): JsonObject {
  return { schemaVersion: '1.0', navigation: 'app', areas: [areaTemplate('area-1', 'item-1', t)] };
}

function areaTemplate(id: string, leafId: string, t: Translate): JsonObject {
  return { id, label: t('ed.nav.newArea'), items: [leafTemplate(leafId, t)] };
}

function leafTemplate(id: string, t: Translate, screen = 'new-screen'): JsonObject {
  return { id, label: t('ed.nav.newLeaf'), screen };
}

/** The navigation open in a window of the workspace (one store per window; the draft under `DOCUMENT_ID`). */
@Injectable()
export class NavigationStore extends DocumentState {
  private readonly i18n = inject(I18n);
  private readonly engine = new ExpressionEngine({ can: () => true });
  private readonly t = (key: string, params: Record<string, unknown> = {}): string => this.i18n.t(key, params);

  private readonly id = inject(DOCUMENT_ID);
  /** Known screens (examples, registry, open documents): suggested for the items and checked. */
  readonly knownScreens = inject(KnownScreens).names;
  readonly target = computed(() => navTargetAt(this.doc(), this.selection()));
  /** The navigation as a valid definition, or null if it has errors. */
  readonly definition = computed<NavigationDefinition | null>(() => (this.errorCount() === 0 ? (this.doc() as unknown as NavigationDefinition) : null));
  /** Permissions referenced by the menu (`requires`), to simulate the profiles in the preview. */
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
    this.doc.set(objectDraft(readDraft(this.id)) ?? emptyNavigation((k) => this.t(k)));
    effect(() => writeDraft(this.id, this.doc()));
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
      const areas = getIn(this.doc(), ['areas']);
      return Array.isArray(areas) ? areas.map((u) => (isObject(u) ? String(u['id'] ?? '') : '')).filter(Boolean) : [];
    }
    return [];
  }

  override load(doc: Json): void {
    this.reset(doc);
  }

  newNavigation(): void {
    this.reset(emptyNavigation((k) => this.t(k)));
  }

  /** Adds an area at the end, with an item. */
  addArea(): void {
    const doc = this.doc();
    const list = getIn(doc, ['areas']);
    const index = Array.isArray(list) ? list.length : 0;
    const node = areaTemplate(this.freshId('area'), this.freshId('item'), (k) => this.t(k));
    this.apply(insertAt(doc, ['areas'], index, node), { select: ['areas', index] });
  }

  /**
   * Where a new item (or group) goes: inside the selected area or group, otherwise next to the selected
   * element. Null if it cannot stay there (a group beyond the second level, nothing selected).
   */
  itemPoint(kind: 'leaf' | 'group', doc = this.doc(), selection = this.selection()): { list: Path; index: number } | null {
    const target = navTargetAt(doc, selection);
    if (!target || target.kind === 'root') return null;
    const inside = target.kind === 'area' || (target.kind === 'group' && (kind === 'leaf' || canAddGroup(doc, selection)));
    if (inside) {
      const list = navChildList(doc, selection)!;
      const items = getIn(doc, list);
      return { list, index: Array.isArray(items) ? items.length : 0 };
    }
    const parent = selection.slice(0, -2);
    if (kind === 'group' && !canAddGroup(doc, parent)) return null;
    return { list: selection.slice(0, -1), index: (selection.at(-1) as number) + 1 };
  }

  /** Adds an item, or a group with an item, at the point given by `itemPoint`, and selects it. */
  addItem(kind: 'leaf' | 'group'): void {
    const doc = this.doc();
    const point = this.itemPoint(kind, doc);
    if (!point) return;
    const leaf = leafTemplate(this.freshId('item'), (k) => this.t(k), this.knownScreens()[0] ?? 'new-screen');
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
    // Repeated identifiers between elements of the same list: the address of an item is the sequence of the ids.
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
    visitList(getIn(doc, ['areas']) ?? null, ['areas']);
    const fallback = getIn(doc, ['default']);
    if (typeof fallback === 'string' && !this.suggestions('default').includes(fallback)) {
      add('/default', this.t('ed.issue.unknownArea', { id: fallback }), 'warning');
    }
    return issues;
  }
}

function objectDraft(value: unknown): Json | null {
  return isObject(value as Json) ? (value as Json) : null;
}
