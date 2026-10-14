import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { EditorStore } from '../model/editor-store';
import { DockPinComponent } from './dock-pin.component';
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
 * il nodo); in alternativa lo si trascina nella struttura. La casella in cima filtra mentre si scrive (nome o tipo,
 * senza badare ad accenti e maiuscole): Invio aggiunge il primo trovato, Esc svuota.
 */
@Component({
  selector: 'ed-palette',
  imports: [DockPinComponent, NzIconModule, NzTooltipModule],
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
    .search {
      width: 100%; height: 26px; margin-bottom: 4px; padding: 0 8px; border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius);
      background: var(--lc-color-surface); color: inherit; font: inherit; font-size: 12px;
    }
    .search:focus-visible { outline: 2px solid var(--lc-color-primary); outline-offset: -1px; }
    .first { border-color: var(--lc-color-primary); }
    .none { margin: 6px 0 0; font-size: 12px; color: var(--lc-color-muted); }
  `,
  template: `
    <section class="ed-panel" [attr.aria-label]="i18n.t('ed.palette')">
      <h2 class="ed-panel-title"><span nz-icon nzType="appstore" aria-hidden="true"></span>{{ i18n.t('ed.palette') }}<ed-dock-pin panel="palette" /></h2>
      <div class="ed-panel-body">
      <input
        class="search"
        type="search"
        data-palette-search
        [attr.aria-label]="i18n.t('ed.paletteSearch')"
        [placeholder]="i18n.t('ed.paletteSearch')"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        (keydown.enter)="addFirst()"
        (keydown.escape)="query.set('')"
      />
      @for (group of shown(); track group.key) {
        <h3>{{ i18n.t('ed.group.' + group.key) }}</h3>
        <div class="items">
          @for (type of group.types; track type) {
            <button
              type="button"
              draggable="true"
              [class.first]="query() && type === firstMatch()"
              (dragstart)="drag($event, type)"
              (click)="store.addNode(type)"
              [attr.data-type]="type"
              [nz-tooltip]="i18n.t('ed.addHint')"
            >
              {{ i18n.t('ed.type.' + type) }}
            </button>
          }
        </div>
      } @empty {
        <p class="none">{{ i18n.t('ed.paletteNoMatch') }}</p>
      }
      </div>
    </section>
  `,
})
export class PaletteComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);
  protected readonly groups = paletteGroups();
  protected readonly query = signal('');
  /** Gruppi con i soli componenti che corrispondono alla ricerca (nome nella lingua dell'editor, o tipo). */
  protected readonly shown = computed(() => {
    const query = normalize(this.query().trim());
    this.i18n.locale();
    if (!query) return this.groups;
    return this.groups
      .map((group) => ({ ...group, types: group.types.filter((type) => normalize(this.i18n.t('ed.type.' + type) + ' ' + type).includes(query)) }))
      .filter((group) => group.types.length);
  });
  protected readonly firstMatch = computed(() => this.shown()[0]?.types[0] ?? null);

  /** Invio nella ricerca: aggiunge il primo componente trovato. */
  protected addFirst(): void {
    const type = this.query().trim() ? this.firstMatch() : null;
    if (type) this.store.addNode(type);
  }

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

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
