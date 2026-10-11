import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { getIn, isObject, samePath, startsWith, type Json, type Path } from '../model/doc-ops';
import { EditorStore } from '../model/editor-store';
import { childSlots, containerItems, targetAt } from '../model/schema-info';

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
    if (typeof text === 'string' && text.trim()) return shorten(text);
  }
  return typeof value['id'] === 'string' ? value['id'] : '';
}

/** Testo breve per la struttura: le espressioni `t('chiave', 'Ripiego')` mostrano il ripiego. */
function shorten(text: string): string {
  const quoted = /t\(\s*(['"])(?:\\.|(?!\1).)*\1\s*,\s*(['"])((?:\\.|(?!\2).)*)\2/.exec(text);
  const fallback = quoted ? quoted[3].replace(/\\(.)/g, '$1') : null;
  const plain = (fallback ?? text).replace(/\s+/g, ' ').trim();
  return plain.length > 40 ? plain.slice(0, 39) + '…' : plain;
}
