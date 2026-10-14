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

/** Una riga della struttura: un nodo, una scheda o un passo, con i propri figli. */
export interface OutlineItem {
  path: Path;
  /** Chiave stabile per ricordare i rami chiusi: l'identificativo del nodo, o il percorso. */
  key: string;
  /** Testo in cui cercare: tipo, etichetta, dettaglio, identificativo. */
  search: string;
  kind: 'node' | 'tab' | 'step';
  type?: string;
  label: string;
  detail: string;
  severity: 'error' | 'warning' | null;
  children: OutlineItem[];
  /** Nodo con schede o passi: si possono aggiungere. */
  canAddItem: boolean;
  first: boolean;
  last: boolean;
}

/** Proprietà che descrivono meglio un nodo nella struttura, in ordine di preferenza. */
const DETAIL_KEYS = ['title', 'label', 'text', 'source', 'bind'];

/**
 * Struttura della schermata: l'albero dei nodi (con schede e passi), selezionabile. L'elemento selezionato mostra
 * i comandi per spostarlo, duplicarlo, tagliarlo ed eliminarlo; i nodi con problemi hanno un segno accanto.
 * Si può trascinare un componente dalla tavolozza o un nodo della struttura prima, dopo o dentro un'altra riga.
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
  /** Rami chiusi (chiavi delle righe). */
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());
  /** Testo cercato nella struttura. */
  protected readonly query = signal('');
  /** Menu contestuale aperto: su quale riga e dove. */
  protected readonly menu = signal<{ item: OutlineItem; x: number; y: number } | null>(null);

  constructor() {
    // Selezionando un nodo (anche dall'anteprima) i rami che lo contengono si aprono.
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

  /** Le righe da mostrare: tutte, oppure quelle che corrispondono alla ricerca con i rami che le contengono. */
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

  /** Le righe che corrispondono alla ricerca (per evidenziarle). */
  protected matches(item: OutlineItem): boolean {
    const query = normalize(this.query().trim());
    return query !== '' && item.search.includes(query);
  }

  /** Un ramo è aperto se non è stato chiuso; durante una ricerca sono tutti aperti. */
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
    // Il ramo con l'elemento selezionato resta aperto.
    const keep = this.ancestors(this.items(), this.store.selection());
    this.collapsed.set(new Set(keys.filter((key) => !keep.includes(key))));
  }

  protected expandAll(): void {
    this.collapsed.set(new Set());
  }

  /** Frecce sulla riga: destra apre il ramo, sinistra lo chiude; il tasto menu o Maiusc+F10 aprono il menu. */
  protected rowKey(event: KeyboardEvent, item: OutlineItem): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight' && item.children.length && !this.isOpen(item)) {
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

  protected contextMenu(event: MouseEvent, item: OutlineItem): void {
    event.preventDefault();
    this.openMenu(item, event.clientX, event.clientY);
  }

  private openMenu(item: OutlineItem, x: number, y: number): void {
    this.store.select(item.path);
    this.menu.set({ item, x, y });
  }

  /** Il menu si è chiuso: il fuoco torna alla riga (il comando può averlo spostato altrove). */
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

  /** Voci del menu contestuale per una riga: i comandi della struttura, «Avvolgi in…» e il contenitore. */
  protected menuItems(item: OutlineItem): MenuItem[] {
    const t = (key: string) => this.i18n.t(key);
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

  /** Chiavi dei rami che contengono il percorso. */
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

  /** Il problema più grave dell'elemento (non dei figli, che hanno il proprio segno). */
  private severityOf(path: Path): 'error' | 'warning' | null {
    const own = this.store.issues().filter((i) => samePath(i.owner, path));
    if (own.some((i) => i.severity === 'error')) return 'error';
    return own.length ? 'warning' : null;
  }

  /** Riga sotto il puntatore durante un trascinamento, con la zona (prima, dopo, dentro). */
  protected readonly dropHint = signal<{ key: string; zone: DropZone } | null>(null);
  /** Nodo trascinato dalla struttura (per non farlo cadere dentro sé stesso). */
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
    // Rilascio permesso qui.
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

  /** L'elemento selezionato è dentro questo (per evidenziare il ramo). */
  protected containsSelection(path: Path): boolean {
    const selection = this.store.selection();
    return selection.length > path.length && startsWith(selection, path);
  }
}

function detailOf(value: Record<string, Json>): string {
  // Un campo a sé: etichetta (o nome) e tipo del campo.
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

/** Testo per la ricerca: minuscolo e senza accenti. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
