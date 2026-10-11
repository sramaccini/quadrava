import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { I18n, formatValue, type FormatLabels, runSteps, type FormattedValue, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ActionDefinition, ColumnDefinition, SortSpec, TableColumnDefinition, TableNode } from 'schema';
import { TONE_COLORS } from './shared';
import { asSort, sortRows, type Row } from './table-data';

type NzSortOrder = 'ascend' | 'descend' | null;

const DEFAULT_PAGE_SIZE = 10;

/**
 * Tabella con azioni di riga. Contratto della risposta del data source: un array di righe oppure
 * `{ items: [...], total: n, size: n }` per la paginazione lato server. Una riga può contenere `_perm`
 * con i permessi sulla riga (es. `row._perm.update`).
 */
@Component({
  selector: 'lc-table',
  imports: [NzTableModule, NzTagModule, NzButtonModule, NzPaginationModule, NzAlertModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .wrap { overflow-x: auto; overflow-y: hidden; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .pager { display: flex; justify-content: flex-end; padding-top: var(--lc-gap, 12px); }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    <div [attr.aria-busy]="source().status === 'loading'">
      @if (source().status === 'error') {
        <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
      } @else {
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
                <th scope="col"><span class="visually-hidden">Azioni</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index) {
              <tr>
                @for (column of columns(); track column.field) {
                  <td [nzAlign]="numeric(column) ? 'right' : 'left'">
                    @if (cell(row, column); as view) {
                      @if (view.tone) {
                        <nz-tag [nzColor]="color(view.tone)">{{ view.text }}</nz-tag>
                      } @else {
                        {{ view.text }}
                      }
                    }
                  </td>
                }
                @if (node().rowActions?.length) {
                  <td>
                    <div class="actions">
                      @for (action of node().rowActions; track $index) {
                        @if (runtime().isVisible(action, { row: row })) {
                          <span nz-tooltip [nzTooltipTitle]="action.tooltip ? runtime().text(action.tooltip, { row: row }) : null">
                            <button nz-button nzSize="small" type="button" [disabled]="busy() || !runtime().isEnabled(action, { row: row })" (click)="run(action, row)">
                              {{ runtime().text(action.label, { row: row }) }}
                            </button>
                          </span>
                        }
                      }
                    </div>
                  </td>
                }
              </tr>
            }
          </tbody>
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
    return column.format === 'currency' || column.format === 'percent';
  }

  protected goTo(page: number): void {
    this.runtime().setState('page', Math.max(0, page));
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
