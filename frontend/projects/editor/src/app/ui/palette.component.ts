import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { EditorStore } from '../model/editor-store';
import { NODE_TYPES } from '../model/schema-info';
import { INPUT_KINDS } from '../model/templates';
import { PALETTE_DRAG_TYPE } from '../preview/protocol';

/** Tipi di dati trascinati: un tipo di componente dalla tavolozza, il percorso di un nodo dalla struttura. */
export const DRAG_TYPE = PALETTE_DRAG_TYPE;
export const DRAG_NODE = 'application/x-lc-node-path';

/**
 * Gruppi della tavolozza. Un tipo dello schema non elencato qui finisce in «Altro», così nessun componente manca. Le voci
 * `input.<tipo>` aggiungono un campo a sé del tipo indicato.
 */
const GROUPS: { key: string; types: string[] }[] = [
  { key: 'layout', types: ['section', 'box', 'grid', 'border', 'tabs', 'wizard', 'text', 'text.markdown', 'alert', 'image', 'link'] },
  { key: 'fields', types: INPUT_KINDS.map((k) => 'input.' + k) },
  { key: 'input', types: ['form', 'filterBar', 'button'] },
  { key: 'data', types: ['table', 'dataTable', 'serverDataTable', 'detail'] },
  { key: 'view', types: ['stats', 'chart', 'progress', 'timeline', 'kanban', 'tree', 'calendar'] },
];

/**
 * Tavolozza dei componenti: un clic aggiunge il nodo nel punto di inserimento (dentro il contenitore selezionato o dopo
 * il nodo); in alternativa lo si trascina nella struttura.
 */
@Component({
  selector: 'ed-palette',
  imports: [NzIconModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; }
    section { flex: 1 1 auto; }
    h3:first-child { margin-top: 0; }
    h3 { margin: 10px 0 4px; font-size: 12px; font-weight: 600; color: var(--lc-color-muted); }
    .items { display: flex; flex-wrap: wrap; gap: 4px; }
    button {
      padding: 2px 8px; border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius); background: var(--lc-color-surface);
      color: inherit; font: inherit; font-size: 12px; cursor: pointer;
    }
    button:hover { border-color: var(--lc-color-primary); color: var(--lc-color-primary); }
    button:focus-visible { outline: 2px solid var(--lc-color-primary); outline-offset: 1px; }
  `,
  template: `
    <section class="ed-panel" [attr.aria-label]="i18n.t('ed.palette')">
      <h2 class="ed-panel-title"><span nz-icon nzType="appstore" aria-hidden="true"></span>{{ i18n.t('ed.palette') }}</h2>
      <div class="ed-panel-body">
      @for (group of groups; track group.key) {
        <h3>{{ i18n.t('ed.group.' + group.key) }}</h3>
        <div class="items">
          @for (type of group.types; track type) {
            <button type="button" draggable="true" (dragstart)="drag($event, type)" (click)="store.addNode(type)" [attr.data-type]="type" [nz-tooltip]="i18n.t('ed.addHint')">
              {{ i18n.t('ed.type.' + type) }}
            </button>
          }
        </div>
      }
      </div>
    </section>
  `,
})
export class PaletteComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);
  protected readonly groups = paletteGroups();

  protected drag(event: DragEvent, type: string): void {
    event.dataTransfer?.setData(DRAG_TYPE, type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }
}

export function paletteGroups(): { key: string; types: string[] }[] {
  const typeOf = (kind: string) => kind.split('.')[0];
  const listed = new Set(GROUPS.flatMap((g) => g.types.map(typeOf)));
  const known = GROUPS.map((g) => ({ key: g.key, types: g.types.filter((t) => NODE_TYPES.includes(typeOf(t))) }));
  const other = NODE_TYPES.filter((t) => !listed.has(t));
  return other.length ? [...known, { key: 'other', types: other }] : known;
}
