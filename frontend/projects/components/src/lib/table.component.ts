import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { I18n, NodeHostComponent, formatValue, type FormatLabels, runSteps, type FormattedValue, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ActionDefinition, ColumnDefinition, SortSpec, Step, TableColumnDefinition, TableNode } from 'schema';
import { IconComponent } from './icon.component';
import { TONE_COLORS } from './shared';
import { aggregate, asSort, sortRows, type Row } from './table-data';

type NzSortOrder = 'ascend' | 'descend' | null;

const DEFAULT_PAGE_SIZE = 10;

/**
 * Tabella con azioni di riga. Contratto della risposta del data source: un array di righe oppure
 * `{ items: [...], total: n, size: n }` per la paginazione lato server. Una riga può contenere `_perm`
 * con i permessi sulla riga (es. `row._perm.update`).
 */
@Component({
  selector: 'lc-table',
  imports: [IconComponent, NodeHostComponent, NzTableModule, NzTagModule, NzButtonModule, NzDropdownModule, NzMenuModule, NzPaginationModule, NzAlertModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .wrap { overflow-x: auto; overflow-y: hidden; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .more { padding-inline: 6px; }
    .expand-cell { width: 48px; }
    .cell-link { padding: 0; border: 0; background: none; font: inherit; color: var(--ant-primary-color, var(--lc-color-primary, #1f5fbf)); cursor: pointer; text-align: inherit; }
    .cell-link:hover, .cell-link:focus-visible { text-decoration: underline; }
    .cell-link:disabled { cursor: not-allowed; opacity: 0.6; }
    .totals td { font-weight: 600; }
    .totals .kind { font-weight: 400; color: var(--lc-color-muted, #5d6b7a); margin-right: 4px; }
    .expanded-body { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); padding: 4px 0; }
    .menu-row { display: inline-flex; align-items: center; gap: 8px; }
    .pager { display: flex; justify-content: flex-end; padding-top: var(--lc-gap, 12px); }
    .bulk { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding-bottom: var(--lc-gap, 12px); }
    .bulk .count { color: var(--lc-color-muted, #5d6b7a); margin-right: 4px; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    <div [attr.aria-busy]="source().status === 'loading'">
      @if (source().status === 'error') {
        <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
      } @else {
        @if (node().bulkActions?.length) {
          <div class="bulk" role="toolbar" [attr.aria-label]="i18n.t('lc.actions')">
            <span class="count" aria-live="polite">{{ i18n.t('lc.selectedRows', { n: selectedRows().length }) }}</span>
            @for (action of node().bulkActions; track $index) {
              @if (runtime().isVisible(action, bulkScope())) {
                <span nz-tooltip [nzTooltipTitle]="action.tooltip ? runtime().text(action.tooltip, bulkScope()) : null">
                  <button nz-button type="button" [nzLoading]="busy()" [disabled]="busy() || !runtime().isEnabled(action, bulkScope())" (click)="runBulk(action)">
                    {{ runtime().text(action.label, bulkScope()) }}
                  </button>
                </span>
              }
            }
          </div>
        }
        <div class="wrap">
        <nz-table
          nzSize="middle"
          [nzData]="rows()"
          [nzLoading]="source().status === 'loading' && rows().length > 0"
          [nzFrontPagination]="false"
          [nzShowPagination]="false"
          [nzNoResult]="empty"
        >
          <thead>
            <tr>
              @if (node().expand) {
                <th class="expand-cell"><span class="visually-hidden">{{ i18n.t('lc.details') }}</span></th>
              }
              @if (node().selection) {
                <th nzWidth="48px" [nzChecked]="allSelected()" [nzIndeterminate]="someSelected()" [nzLabel]="i18n.t('lc.selectAll')" (nzCheckedChange)="selectAll($event)"></th>
              }
              @for (column of columns(); track column.field) {
                <th
                  scope="col"
                  [nzAlign]="numeric(column) ? 'right' : 'left'"
                  [nzShowSort]="!!column.sortable"
                  [nzSortFn]="!!column.sortable"
                  [nzSortOrder]="order(column)"
                  (nzSortOrderChange)="setSort(column, $event)"
                  [attr.aria-sort]="ariaSort(column)"
                  nz-tooltip
                  [nzTooltipTitle]="column.tooltip ? runtime().text(column.tooltip, scope()) : null"
                >{{ runtime().text(column.label, scope()) || column.field }}</th>
              }
              @if (node().rowActions?.length) {
                <th scope="col"><span class="visually-hidden">{{ i18n.t('lc.actions') }}</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index) {
              <tr [class.ant-table-row-selected]="isSelected(row)">
                @if (node().expand) {
                  <td class="expand-cell">
                    @if (canExpand(row)) {
                      <button
                        type="button"
                        class="ant-table-row-expand-icon"
                        [class.ant-table-row-expand-icon-expanded]="isExpanded(row)"
                        [class.ant-table-row-expand-icon-collapsed]="!isExpanded(row)"
                        [attr.aria-expanded]="isExpanded(row)"
                        [attr.aria-label]="i18n.t(isExpanded(row) ? 'lc.collapseRow' : 'lc.expandRow')"
                        (click)="toggleExpand(row)"
                      ></button>
                    }
                  </td>
                }
                @if (node().selection) {
                  <td [nzChecked]="isSelected(row)" [nzLabel]="i18n.t('lc.selectRow')" (nzCheckedChange)="toggle(row, $event)"></td>
                }
                @for (column of columns(); track column.field) {
                  <td [nzAlign]="numeric(column) ? 'right' : 'left'">
                    @if (cell(row, column); as view) {
                      @if (column.onClick) {
                        <button type="button" class="cell-link" [disabled]="busy()" (click)="runCell(column.onClick, row)">
                          @if (view.tone) {
                            <nz-tag [nzColor]="color(view.tone)">{{ view.text }}</nz-tag>
                          } @else {
                            {{ view.text }}
                          }
                        </button>
                      } @else if (view.tone) {
                        <nz-tag [nzColor]="color(view.tone)">{{ view.text }}</nz-tag>
                      } @else {
                        {{ view.text }}
                      }
                    }
                  </td>
                }
                @if (node().rowActions?.length) {
                  <td>
                    @let actions = actionsOf(row);
                    <div class="actions">
                      @for (action of actions.inline; track $index) {
                        <span nz-tooltip [nzTooltipTitle]="action.tooltip ? runtime().text(action.tooltip, { row: row }) : null">
                          <button nz-button nzSize="small" type="button" [disabled]="busy() || !runtime().isEnabled(action, { row: row })" (click)="run(action, row)">
                            {{ runtime().text(action.label, { row: row }) }}
                          </button>
                        </span>
                      }
                      @if (actions.menu.length) {
                        <button nz-button nzSize="small" nzType="text" class="more" type="button" nz-dropdown nzTrigger="click" nzPlacement="bottomRight" [nzDropdownMenu]="rowMenu"
                          [disabled]="busy()" [attr.aria-label]="i18n.t('lc.moreActions')" aria-haspopup="menu">
                          <lc-icon name="more" />
                        </button>
                        <nz-dropdown-menu #rowMenu="nzDropdownMenu">
                          <ul nz-menu>
                            @for (action of actions.menu; track $index) {
                              <li nz-menu-item class="lc-row-action" [nzDisabled]="!runtime().isEnabled(action, { row: row })" (click)="runtime().isEnabled(action, { row: row }) && run(action, row)"
                                nz-tooltip nzTooltipPlacement="left" [nzTooltipTitle]="action.tooltip ? runtime().text(action.tooltip, { row: row }) : null">
                                {{ runtime().text(action.label, { row: row }) }}
                              </li>
                            }
                          </ul>
                        </nz-dropdown-menu>
                      }
                    </div>
                  </td>
                }
              </tr>
              @if (node().expand && isExpanded(row)) {
                <tr class="lc-extra-row ant-table-expanded-row">
                  <td [attr.colspan]="colspan()">
                    <div class="expanded-body">
                      @for (child of node().expand!.components; track $index) {
                        <lc-node [node]="child" [runtime]="runtime()" [scope]="rowScope(row)" />
                      }
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
          @if (hasTotals() && rows().length) {
            <tfoot nzSummary>
              <tr class="totals">
                @if (node().expand) {
                  <td></td>
                }
                @if (node().selection) {
                  <td></td>
                }
                @for (column of columns(); track column.field; let first = $first) {
                  <td [nzAlign]="numeric(column) ? 'right' : 'left'">
                    @if (column.aggregate) {
                      @if (column.aggregate !== 'sum') {
                        <span class="kind">{{ i18n.t('lc.aggregate.' + column.aggregate) }}</span>
                      }
                      {{ totalOf(column) }}
                    } @else if (first) {
                      {{ i18n.t('lc.total') }}
                    }
                  </td>
                }
                @if (node().rowActions?.length) {
                  <td></td>
                }
              </tr>
            </tfoot>
          }
        </nz-table>
        </div>
        <ng-template #empty>
          @if (source().status === 'loading') {
            <span role="status">{{ i18n.t('lc.loading') }}</span>
          } @else {
            <span role="status">{{ i18n.t('lc.noResults') }}</span>
          }
        </ng-template>
        @if (paged()) {
          <div class="pager">
            <nz-pagination [nzPageIndex]="page() + 1" [nzPageSize]="pageSize()" [nzTotal]="total()" (nzPageIndexChange)="goTo($event - 1)" />
          </div>
        }
      }
    </div>
  `,
})
export class TableComponent {
  readonly node = input.required<TableNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly busy = signal(false);

  protected readonly i18n = inject(I18n);
  private readonly labels = (): FormatLabels => ({ yes: this.i18n.t('lc.yes'), no: this.i18n.t('lc.no'), translate: (key, fallback) => this.i18n.t(key, {}, fallback) });
  /** Colonne visibili all'utente: `visibleIf` e `hiddenIf` valgono anche per le colonne. */
  protected readonly columns = computed(() => this.node().columns.filter((c) => this.runtime().isVisible(c, this.scope())));

  protected readonly source = computed(() => this.runtime().source(this.node().source));
  /** Righe così come arrivano dal servizio. */
  private readonly loaded = computed<Row[]>(() => {
    const data = this.source().data;
    if (Array.isArray(data)) return data as Row[];
    const items = (data as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? (items as Row[]) : [];
  });
  protected readonly paged = computed(() => this.runtime().definition.dataSources?.[this.node().source]?.paging === 'server');
  /** Ordinamento senza stato condiviso (nessun `sort.bind`): parte da `sort.default`. */
  private readonly localSort = linkedSignal<SortSpec | null>(() => this.node().sort?.default ?? null);
  /** Ordinamento corrente: dallo stato della schermata se c'è `sort.bind`, altrimenti locale. */
  protected readonly sort = computed<SortSpec | null>(() => {
    const bind = this.node().sort?.bind;
    return bind ? asSort(this.runtime().getState(bind)) : this.localSort();
  });
  /** Con paging server e `sort.bind` l'ordine lo decide il servizio; in tutti gli altri casi si ordina in pagina. */
  private readonly serverSorted = computed(() => this.paged() && !!this.node().sort?.bind);
  private reportedLocalSort = false;
  protected readonly rows = computed<Row[]>(() => {
    const rows = this.loaded();
    const sort = this.sort();
    if (!sort || this.serverSorted()) return rows;
    if (this.paged() && !this.reportedLocalSort) {
      this.reportedLocalSort = true;
      this.runtime().report(`tabella ${this.node().source}`, 'ordinamento senza sort.bind con paging server: ordinata solo la pagina corrente');
    }
    return sortRows(rows, sort, this.i18n.intlLocale());
  });
  protected readonly page = computed(() => {
    const page = this.runtime().state()['page'];
    return typeof page === 'number' ? page : 0;
  });
  protected readonly pageSize = computed(() => {
    const size = (this.source().data as { size?: unknown } | null)?.size;
    return typeof size === 'number' && size > 0 ? size : DEFAULT_PAGE_SIZE;
  });
  /** Se il servizio non dichiara il totale, si mostra solo la pagina corrente (nessuna pagina successiva). */
  protected readonly total = computed(() => {
    const total = (this.source().data as { total?: unknown } | null)?.total;
    return typeof total === 'number' ? total : (this.page() + 1) * this.pageSize();
  });

  /** Campo che identifica una riga nella selezione. */
  private readonly key = computed(() => this.node().selection?.key ?? 'id');
  /** Chiavi delle righe selezionate, dallo stato della schermata. */
  private readonly selectedKeys = computed<unknown[]>(() => {
    const selection = this.node().selection;
    const value = selection ? this.runtime().getState(selection.bind) : null;
    return Array.isArray(value) ? value : [];
  });
  protected readonly selectedRows = computed<Row[]>(() => {
    const keys = new Set(this.selectedKeys());
    const key = this.key();
    return this.rows().filter((row) => keys.has(row[key]));
  });
  protected readonly allSelected = computed(() => this.rows().length > 0 && this.selectedRows().length === this.rows().length);
  protected readonly someSelected = computed(() => this.selectedRows().length > 0 && !this.allSelected());
  /** Le azioni multiple vedono le righe selezionate in `selection`. */
  protected readonly bulkScope = computed<Scope>(() => ({ ...this.scope(), selection: this.selectedRows() }));

  constructor() {
    // La selezione vale per le righe caricate: le chiavi che non ci sono più (nuova pagina, nuovi filtri, righe tolte) si scartano.
    effect(() => {
      const selection = this.node().selection;
      if (!selection || this.source().status !== 'ready') return;
      const key = this.key();
      const present = new Set(this.loaded().map((row) => row[key]));
      const keys = untracked(() => this.selectedKeys());
      const kept = keys.filter((k) => present.has(k));
      if (kept.length !== keys.length) untracked(() => this.runtime().setState(selection.bind, kept));
    });
  }

  protected isSelected(row: Row): boolean {
    return this.node().selection ? this.selectedKeys().includes(row[this.key()]) : false;
  }

  protected toggle(row: Row, checked: boolean): void {
    const selection = this.node().selection;
    if (!selection) return;
    const value = row[this.key()];
    const keys = this.selectedKeys().filter((k) => k !== value);
    this.runtime().setState(selection.bind, checked ? [...keys, value] : keys);
  }

  protected selectAll(checked: boolean): void {
    const selection = this.node().selection;
    if (!selection) return;
    const key = this.key();
    this.runtime().setState(selection.bind, checked ? this.rows().map((row) => row[key]) : []);
  }

  protected async runBulk(action: ActionDefinition): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await runSteps(this.runtime(), action.onClick, this.bulkScope());
    } finally {
      this.busy.set(false);
    }
  }

  protected cell(row: Record<string, unknown>, column: ColumnDefinition): FormattedValue {
    return formatValue(row[column.field], column, this.i18n.intlLocale(), this.labels());
  }

  protected color(tone: NonNullable<FormattedValue['tone']>): string {
    return TONE_COLORS[tone];
  }

  protected order(column: TableColumnDefinition): NzSortOrder {
    const sort = this.sort();
    if (!column.sortable || sort?.field !== column.field) return null;
    return sort.direction === 'asc' ? 'ascend' : 'descend';
  }

  protected ariaSort(column: TableColumnDefinition): string | null {
    if (!column.sortable) return null;
    const order = this.order(column);
    return order === 'ascend' ? 'ascending' : order === 'descend' ? 'descending' : 'none';
  }

  protected setSort(column: TableColumnDefinition, order: string | null): void {
    // Ordinando una colonna NG-ZORRO azzera anche le altre: l'azzeramento di una colonna che non è quella ordinata non conta.
    if (!order && this.sort()?.field !== column.field) return;
    const next: SortSpec | null = order === 'ascend' ? { field: column.field, direction: 'asc' } : order === 'descend' ? { field: column.field, direction: 'desc' } : null;
    const bind = this.node().sort?.bind;
    if (!bind) {
      this.localSort.set(next);
      return;
    }
    this.runtime().setState(bind, next);
    // Un ordinamento nuovo riporta alla prima pagina, come un filtro nuovo.
    if (this.paged()) this.runtime().setState('page', 0);
  }

  protected numeric(column: ColumnDefinition): boolean {
    return column.format === 'number' || column.format === 'currency' || column.format === 'percent';
  }

  /** C'è una riga dei totali se almeno una colonna visibile ha `aggregate`. */
  protected readonly hasTotals = computed(() => this.columns().some((c) => !!c.aggregate));

  /** Valore della riga dei totali per una colonna, con il formato della colonna (numero semplice per il conteggio). */
  protected totalOf(column: TableColumnDefinition): string {
    if (!column.aggregate) return '';
    const value = aggregate(this.rows(), column.field, column.aggregate);
    if (value === null) return '';
    const spec: ColumnDefinition =
      column.aggregate === 'count' ? { field: column.field, format: 'number', decimals: 0 } : this.numeric(column) ? column : { field: column.field, format: 'number' };
    return formatValue(value, spec, this.i18n.intlLocale(), this.labels()).text;
  }

  protected async runCell(steps: Step[], row: Row): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await runSteps(this.runtime(), steps, { ...this.scope(), row });
    } finally {
      this.busy.set(false);
    }
  }

  protected goTo(page: number): void {
    this.runtime().setState('page', Math.max(0, page));
  }

  /** Righe aperte (per chiave, o per posizione se la riga non ha chiave). */
  private readonly expanded = signal<ReadonlySet<unknown>>(new Set());
  /** Scope di ogni riga, creato una volta per riga: un oggetto nuovo a ogni disegno ricostruirebbe i nodi dell'area aperta. */
  private readonly scopes = new WeakMap<Row, Scope>();
  protected readonly colspan = computed(
    () => this.columns().length + (this.node().expand ? 1 : 0) + (this.node().selection ? 1 : 0) + (this.node().rowActions?.length ? 1 : 0),
  );

  private expandKey(row: Row): unknown {
    const value = row[this.key()];
    return value === undefined || value === null ? this.rows().indexOf(row) : value;
  }

  protected canExpand(row: Row): boolean {
    const expandIf = this.node().expand?.expandIf;
    return expandIf ? this.runtime().engine.evaluateCondition(expandIf, this.runtime().context(this.rowScope(row)), { whenMissing: true }) : true;
  }

  protected isExpanded(row: Row): boolean {
    return this.expanded().has(this.expandKey(row));
  }

  protected toggleExpand(row: Row): void {
    const key = this.expandKey(row);
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected rowScope(row: Row): Scope {
    let scope = this.scopes.get(row);
    if (!scope) this.scopes.set(row, (scope = { ...this.scope(), row }));
    return scope;
  }

  /** Azioni visibili di una riga, divise tra pulsanti e menu «⋯» secondo `rowActionsInline`. */
  protected actionsOf(row: Row): { inline: ActionDefinition[]; menu: ActionDefinition[] } {
    const visible = (this.node().rowActions ?? []).filter((action) => this.runtime().isVisible(action, { row }));
    const inline = this.node().rowActionsInline;
    if (inline === undefined || visible.length <= inline) return { inline: visible, menu: [] };
    return { inline: visible.slice(0, inline), menu: visible.slice(inline) };
  }

  protected async run(action: ActionDefinition, row: Record<string, unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await runSteps(this.runtime(), action.onClick, { ...this.scope(), row });
    } finally {
      this.busy.set(false);
    }
  }
}
