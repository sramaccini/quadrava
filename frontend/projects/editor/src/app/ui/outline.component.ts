import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { getIn, isObject, samePath, startsWith, type Json, type Path } from '../model/doc-ops';
import { dropPoint, zoneAt, type DropZone } from '../model/drop';
import { EditorStore } from '../model/editor-store';
import { childSlots, containerItems, targetAt } from '../model/schema-info';
import { DRAG_NODE, DRAG_TYPE } from './palette.component';
import { fallbackText } from '../model/templates';

/** Una riga della struttura: un nodo, una scheda o un passo, con i propri figli. */
export interface OutlineItem {
  path: Path;
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
  imports: [NgTemplateOutlet, NzButtonModule, NzIconModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './outline.component.scss',
  templateUrl: './outline.component.html',
})
export class OutlineComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);

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
    return {
      path,
      kind: target.kind,
      type,
      label: target.kind === 'node' ? this.i18n.t('ed.type.' + target.type) : this.i18n.t('ed.' + target.kind),
      detail: detailOf(value),
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
  for (const key of DETAIL_KEYS) {
    const text = value[key];
    if (typeof text === 'string' && text.trim()) return fallbackText(text);
  }
  return typeof value['id'] === 'string' ? value['id'] : '';
}
