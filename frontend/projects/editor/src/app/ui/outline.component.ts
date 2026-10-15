import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { getIn, isObject, samePath, startsWith, type Json, type Path } from '../model/doc-ops';
import { dropPoint, zoneAt, type DropZone } from '../model/drop';
import { EditorStore } from '../model/editor-store';
import { childSlots, containerItems, ownerOf, targetAt } from '../model/schema-info';
import { ContextMenuComponent } from './context-menu.component';
import { DockPinComponent } from './dock-pin.component';
import type { MenuItem } from './menu-bar.component';
import { DRAG_NODE, DRAG_TYPE } from './palette.component';
import { fallbackText } from '../model/templates';

/** A row of the outline: a node, a tab or a step, with its own children. */
export interface OutlineItem {
  path: Path;
  /** Stable key to remember the closed branches: the identifier of the node, or the path. */
  key: string;
  /** Text to search in: type, label, detail, identifier. */
  search: string;
  kind: 'node' | 'tab' | 'step';
  type?: string;
  label: string;
  detail: string;
  severity: 'error' | 'warning' | null;
  children: OutlineItem[];
  /** Node with tabs or steps: they can be added. */
  canAddItem: boolean;
  first: boolean;
  last: boolean;
}

/** Properties that best describe a node in the outline, in order of preference. */
const DETAIL_KEYS = ['title', 'label', 'text', 'source', 'bind'];

/**
 * Outline of the screen: the tree of the nodes (with tabs and steps), selectable. The selected element shows
 * the commands to move, duplicate, cut and delete it; nodes with problems have a mark next to them.
 * A component can be dragged from the palette, or a node of the outline, before, after or inside another row.
 */
@Component({
  selector: 'ed-outline',
  imports: [ContextMenuComponent, DockPinComponent, NgTemplateOutlet, NzButtonModule, NzIconModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './outline.component.scss',
  templateUrl: './outline.component.html',
})
export class OutlineComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Closed branches (keys of the rows). */
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());
  /** Text searched in the outline. */
  protected readonly query = signal('');
  /** Open context menu: on which row and where. */
  protected readonly menu = signal<{ item: OutlineItem; x: number; y: number } | null>(null);

  constructor() {
    // Selecting a node (also from the preview) opens the branches containing it.
    effect(() => {
      const selection = this.store.selection();
      const closed = this.collapsed();
      const open = this.ancestors(this.items(), selection).filter((key) => closed.has(key));
      if (open.length) this.collapsed.set(new Set([...closed].filter((key) => !open.includes(key))));
    });
  }

  protected readonly screenLabel = computed(() => {
    const doc = this.store.doc();
    const name = isObject(doc) && typeof doc['screen'] === 'string' ? doc['screen'] : '';
    return name;
  });

  protected readonly screenSeverity = computed(() => this.severityOf([]));

  protected readonly items = computed<OutlineItem[]>(() => {
    const doc = this.store.doc();
    return this.list(doc, ['components']);
  });

  /** The rows to show: all, or those matching the search with the branches containing them. */
  protected readonly shown = computed<OutlineItem[]>(() => {
    const query = normalize(this.query().trim());
    if (!query) return this.items();
    const filter = (items: OutlineItem[]): OutlineItem[] =>
      items.flatMap((item) => {
        const children = filter(item.children);
        return item.search.includes(query) || children.length ? [{ ...item, children }] : [];
      });
    return filter(this.items());
  });

  protected readonly searching = computed(() => this.query().trim() !== '');

  /** The rows matching the search (to highlight them). */
  protected matches(item: OutlineItem): boolean {
    const query = normalize(this.query().trim());
    return query !== '' && item.search.includes(query);
  }

  /** A branch is open if it was not closed; during a search they are all open. */
  protected isOpen(item: OutlineItem): boolean {
    return this.searching() || !this.collapsed().has(item.key);
  }

  protected toggle(item: OutlineItem): void {
    const next = new Set(this.collapsed());
    if (next.has(item.key)) next.delete(item.key);
    else next.add(item.key);
    this.collapsed.set(next);
  }

  protected collapseAll(): void {
    const keys: string[] = [];
    const visit = (items: OutlineItem[]) =>
      items.forEach((item) => {
        if (item.children.length) keys.push(item.key);
        visit(item.children);
      });
    visit(this.items());
    // The branch with the selected element stays open.
    const keep = this.ancestors(this.items(), this.store.selection());
    this.collapsed.set(new Set(keys.filter((key) => !keep.includes(key))));
  }

  protected expandAll(): void {
    this.collapsed.set(new Set());
  }

  /** Arrows on the row: right opens the branch, left closes it; the menu key or Shift+F10 open the menu. */
  protected rowKey(event: KeyboardEvent, item: OutlineItem): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.extend(item, event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'ArrowRight' && item.children.length && !this.isOpen(item)) {
      event.preventDefault();
      this.toggle(item);
    } else if (event.key === 'ArrowLeft' && item.children.length && this.isOpen(item) && !this.searching()) {
      event.preventDefault();
      this.toggle(item);
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.openMenu(item, box.left + 16, box.bottom);
    }
  }

  /** Click on a row: Ctrl (or Cmd) adds or removes it from the selection, Shift selects the range, otherwise it selects. */
  protected rowClick(event: MouseEvent, item: OutlineItem): void {
    if (event.ctrlKey || event.metaKey) this.store.toggleSelect(item.path);
    else if (event.shiftKey) this.store.selectRange(item.path);
    else this.store.select(item.path);
  }

  /** The row is part of a selection of several nodes. */
  protected inMulti(path: Path): boolean {
    const multi = this.store.multi();
    return multi.length > 1 && multi.some((p) => samePath(p, path));
  }

  /** Shift+arrow up or down: extends the selection to the previous or next sibling and moves the focus there. */
  private extend(item: OutlineItem, delta: number): void {
    const index = item.path.at(-1);
    if (item.kind !== 'node' || typeof index !== 'number') return;
    const next = [...item.path.slice(0, -1), index + delta];
    if (targetAt(this.store.doc(), next)?.kind !== 'node') return;
    this.store.selectRange(next);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`.row[data-path="${CSS.escape(next.join('/'))}"]`)?.focus());
  }

  protected contextMenu(event: MouseEvent, item: OutlineItem): void {
    event.preventDefault();
    this.openMenu(item, event.clientX, event.clientY);
  }

  private openMenu(item: OutlineItem, x: number, y: number): void {
    // On a node of the multiple selection the menu applies to all; elsewhere the row is selected.
    if (!this.inMulti(item.path)) this.store.select(item.path);
    this.menu.set({ item, x, y });
  }

  /** The menu closed: the focus goes back to the row (the command may have moved it elsewhere). */
  protected menuClosed(): void {
    const item = this.menu()?.item;
    this.menu.set(null);
    if (!item) return;
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body && !this.host.nativeElement.contains(active)) return;
      const path = this.store.selection().join('/');
      this.host.nativeElement.querySelector<HTMLElement>(`.row[data-path="${CSS.escape(path)}"]`)?.focus();
    });
  }

  /** Context menu items for a row: the outline commands, «Wrap in…» and the container. */
  protected menuItems(item: OutlineItem): MenuItem[] {
    const t = (key: string) => this.i18n.t(key);
    if (this.inMulti(item.path)) {
      const paths = this.store.multi();
      const n = { n: paths.length };
      return [
        { id: 'wrap-section', label: this.i18n.t('ed.ctx.wrapManySection', n), run: () => this.store.wrapMany(paths, 'section') },
        { id: 'wrap-box', label: this.i18n.t('ed.ctx.wrapManyBox', n), run: () => this.store.wrapMany(paths, 'box') },
        { id: 'wrap-grid', label: this.i18n.t('ed.ctx.wrapManyGrid', n), run: () => this.store.wrapMany(paths, 'grid') },
        { id: 'delete', label: this.i18n.t('ed.ctx.deleteMany', n), shortcut: t('ed.key.delete'), separator: true, run: () => this.store.removeMany(paths) },
      ];
    }
    const path = item.path;
    const node = item.kind === 'node';
    const items: MenuItem[] = [];
    if (node) {
      items.push(
        { id: 'cut', label: t('ed.menu.cut'), shortcut: 'Ctrl+X', run: () => this.store.cut(path) },
        { id: 'copy', label: t('ed.menu.copy'), shortcut: 'Ctrl+C', run: () => this.store.copy(path) },
        { id: 'paste', label: t('ed.menu.paste'), shortcut: 'Ctrl+V', disabled: !this.store.clipboard(), run: () => this.store.paste() },
      );
    }
    items.push(
      { id: 'duplicate', label: t('ed.menu.duplicate'), shortcut: 'Ctrl+D', separator: node, run: () => this.store.duplicate(path) },
      { id: 'delete', label: t('ed.menu.delete'), shortcut: t('ed.key.delete'), run: () => this.store.remove(path) },
      { id: 'move-up', label: t('ed.menu.moveUp'), shortcut: 'Alt+↑', separator: true, disabled: item.first, run: () => this.store.move(path, -1) },
      { id: 'move-down', label: t('ed.menu.moveDown'), shortcut: 'Alt+↓', disabled: item.last, run: () => this.store.move(path, 1) },
    );
    if (item.canAddItem) {
      items.push({ id: 'add-item', label: t(item.type === 'tabs' ? 'ed.addTab' : 'ed.addStep'), run: () => this.store.addContainerItem(path) });
    }
    if (node) {
      items.push(
        { id: 'wrap-section', label: t('ed.ctx.wrapSection'), separator: true, run: () => this.store.wrap(path, 'section') },
        { id: 'wrap-box', label: t('ed.ctx.wrapBox'), run: () => this.store.wrap(path, 'box') },
        { id: 'wrap-grid', label: t('ed.ctx.wrapGrid'), run: () => this.store.wrap(path, 'grid') },
      );
    }
    const parent = ownerOf(this.store.doc(), path.slice(0, -1));
    items.push({ id: 'select-parent', label: t('ed.ctx.selectParent'), separator: true, run: () => this.store.select(parent) });
    return items;
  }

  /** Keys of the branches containing the path. */
  private ancestors(items: OutlineItem[], path: Path): string[] {
    for (const item of items) {
      if (path.length > item.path.length && startsWith(path, item.path)) return [item.key, ...this.ancestors(item.children, path)];
    }
    return [];
  }

  private list(doc: Json, listPath: Path): OutlineItem[] {
    const list = getIn(doc, listPath);
    if (!Array.isArray(list)) return [];
    return list.map((_, i) => this.item(doc, [...listPath, i], i === 0, i === list.length - 1)).filter((item): item is OutlineItem => item !== null);
  }

  private item(doc: Json, path: Path, first: boolean, last: boolean): OutlineItem | null {
    const target = targetAt(doc, path);
    const value = getIn(doc, path);
    if (!target || target.kind === 'screen' || !isObject(value)) return null;
    const children: OutlineItem[] = [];
    if (target.kind === 'node') {
      const items = containerItems(doc, path);
      items.forEach((itemPath, i) => {
        const child = this.item(doc, itemPath, i === 0, i === items.length - 1);
        if (child) children.push(child);
      });
    }
    for (const slot of childSlots(doc, path)) children.push(...this.list(doc, slot.path));
    const type = target.kind === 'node' ? target.type : undefined;
    const label = target.kind === 'node' ? this.i18n.t('ed.type.' + target.type) : this.i18n.t('ed.' + target.kind);
    const detail = detailOf(value);
    const id = typeof value['id'] === 'string' ? value['id'] : '';
    return {
      path,
      key: id ? 'id:' + id : path.join('/'),
      search: normalize([label, detail, type ?? '', id].join(' ')),
      kind: target.kind,
      type,
      label,
      detail,
      severity: this.severityOf(path),
      children,
      canAddItem: type === 'tabs' || type === 'wizard',
      first,
      last,
    };
  }

  /** The most serious problem of the element (not of the children, which have their own mark). */
  private severityOf(path: Path): 'error' | 'warning' | null {
    const own = this.store.issues().filter((i) => samePath(i.owner, path));
    if (own.some((i) => i.severity === 'error')) return 'error';
    return own.length ? 'warning' : null;
  }

  /** Row under the pointer during a drag, with the zone (before, after, inside). */
  protected readonly dropHint = signal<{ key: string; zone: DropZone } | null>(null);
  /** Node dragged from the outline (so as not to drop it inside itself). */
  private dragged: Path | null = null;

  protected dragStart(event: DragEvent, item: OutlineItem): void {
    if (item.kind !== 'node' || !event.dataTransfer) return;
    this.dragged = item.path;
    event.dataTransfer.setData(DRAG_NODE, JSON.stringify(item.path));
    event.dataTransfer.effectAllowed = 'move';
  }

  protected dragEnd(): void {
    this.dragged = null;
    this.dropHint.set(null);
  }

  protected dragOver(event: DragEvent, path: Path): void {
    const types = event.dataTransfer?.types ?? [];
    if (!types.includes(DRAG_TYPE) && !types.includes(DRAG_NODE)) return;
    const zone = this.zone(event, path);
    if (!dropPoint(this.store.doc(), path, zone, this.dragged ?? undefined)) return;
    // Drop allowed here.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = types.includes(DRAG_NODE) ? 'move' : 'copy';
    const key = path.join('/');
    const hint = this.dropHint();
    if (hint?.key !== key || hint.zone !== zone) this.dropHint.set({ key, zone });
  }

  protected dragLeave(event: DragEvent, path: Path): void {
    const related = event.relatedTarget as Node | null;
    if (related && (event.currentTarget as Node).contains(related)) return;
    if (this.dropHint()?.key === path.join('/')) this.dropHint.set(null);
  }

  protected drop(event: DragEvent, path: Path): void {
    event.preventDefault();
    const data = event.dataTransfer;
    const zone = this.zone(event, path);
    this.dropHint.set(null);
    if (!data) return;
    const type = data.getData(DRAG_TYPE);
    const node = data.getData(DRAG_NODE);
    const from = node ? (JSON.parse(node) as Path) : null;
    const point = dropPoint(this.store.doc(), path, zone, from ?? undefined);
    if (!point) return;
    if (type) this.store.addNode(type, point);
    else if (from) this.store.moveNode(from, point.list, point.index);
    this.dragged = null;
  }

  protected hintOf(path: Path): DropZone | null {
    const hint = this.dropHint();
    return hint && hint.key === path.join('/') ? hint.zone : null;
  }

  private zone(event: DragEvent, path: Path): DropZone {
    const row = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const doc = this.store.doc();
    const target = targetAt(doc, path);
    const canContain = !!target && (target.kind !== 'node' || childSlots(doc, path).length > 0);
    return zoneAt(event.clientY - row.top, row.height, canContain);
  }

  protected isSelected(path: Path): boolean {
    return samePath(this.store.selection(), path);
  }

  /** The selected element is inside this one (to highlight the branch). */
  protected containsSelection(path: Path): boolean {
    const selection = this.store.selection();
    return selection.length > path.length && startsWith(selection, path);
  }
}

function detailOf(value: Record<string, Json>): string {
  // A standalone field: label (or name) and field type.
  const field = value['field'];
  if (value['type'] === 'input' && field !== null && typeof field === 'object' && !Array.isArray(field)) {
    const text = typeof field['label'] === 'string' && field['label'].trim() ? field['label'] : field['name'];
    return [typeof text === 'string' ? fallbackText(text) : '', field['type']].filter(Boolean).join(' · ');
  }
  for (const key of DETAIL_KEYS) {
    const text = value[key];
    if (typeof text === 'string' && text.trim()) return fallbackText(text);
  }
  return typeof value['id'] === 'string' ? value['id'] : '';
}

/** Text for the search: lower-case and without accents. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
