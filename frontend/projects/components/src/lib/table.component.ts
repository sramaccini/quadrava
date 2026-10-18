import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { I18n, NodeHostComponent, formatValue, type FormatLabels, runSteps, type FormattedValue, type ScreenRuntime, type Scope } from 'core';
import { BusyComponent } from './busy.component';
import { TableFooterComponent } from './table-footer.component';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { inlineDataSource, type ActionDefinition, type ColumnDefinition, type SortSpec, type Step, type TableColumnDefinition, type TableNode } from 'schema';
import { RowActionsComponent } from './row-actions.component';
import { TONE_COLORS } from './shared';
import { aggregate, asSort, sortRows, type Row } from './table-data';

type NzSortOrder = 'ascend' | 'descend' | null;

const DEFAULT_PAGE_SIZE = 10;

/**
 * Table with row actions. Contract of the data source response: an array of rows or
 * `{ items: [...], total: n, size: n }` for server-side paging. A row can contain `_perm`
 * with the permissions on the row (e.g. `row._perm.update`).
 */
@Component({
  selector: 'lc-table',
  imports: [BusyComponent, TableFooterComponent, NodeHostComponent, RowActionsComponent, NzTableModule, NzTagModule, NzButtonModule, NzAlertModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .wrap { overflow-x: auto; overflow-y: hidden; }
    .expand-cell { width: 48px; }
    .cell-link { padding: 0; border: 0; background: none; font: inherit; color: var(--ant-primary-color, var(--lc-color-primary, #1f5fbf)); cursor: pointer; text-align: inherit; }
    .cell-link:hover, .cell-link:focus-visible { text-decoration: underline; }
    .cell-link:disabled { cursor: not-allowed; opacity: 0.6; }
    .totals td { font-weight: 600; }
    .totals .kind { font-weight: 400; color: var(--lc-color-muted, #5d6b7a); margin-right: 4px; }
    .expanded-body { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); padding: 4px 0; }
    .menu-row { display: inline-flex; align-items: center; gap: 8px; }
    .bulk { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding-bottom: var(--lc-gap, 12px); }
    .bulk .count { color: var(--lc-color-muted, #5d6b7a); margin-right: 4px; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    <div>
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
        <lc-busy [busy]="source().status === 'loading' || refreshing()" [immediate]="refreshing()" [empty]="!rows().length">
        <div class="wrap">
        <nz-table
          nzSize="middle"
          [nzData]="rows()"
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
                    <lc-row-actions [actions]="node().rowActions!" [inline]="node().rowActionsInline" [row]="row" [runtime]="runtime()" [scope]="scope()" [busy]="busy()" (run)="run($event, row)" />
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
        </lc-busy>
        <!-- While loading the place stays empty: lc-busy shows it. -->
        <ng-template #empty>
          @if (source().status !== 'loading') {
            <span role="status">{{ i18n.t('lc.noResults') }}</span>
          }
        </ng-template>
        @if (paged() || node().refreshable) {
          <lc-table-footer
            [refreshable]="!!node().refreshable"
            [busy]="source().status === 'loading'"
            [page]="page()"
            [pageSize]="pageSize()"
            [total]="paged() ? total() : 0"
            (pageChange)="goTo($event)"
            (refresh)="reload()"
            (refreshingChange)="refreshing.set($event)"
          />
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
  /** Columns visible to the user: `visibleIf` and `hiddenIf` apply to columns too. */
  protected readonly columns = computed(() => this.node().columns.filter((c) => this.runtime().isVisible(c, this.scope())));

  protected readonly source = computed(() => this.runtime().source(this.node().source));
  /** Rows as they arrive from the service. */
  private readonly loaded = computed<Row[]>(() => {
    const data = this.source().data;
    if (Array.isArray(data)) return data as Row[];
    const items = (data as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? (items as Row[]) : [];
  });
  protected readonly paged = computed(() => inlineDataSource(this.runtime().definition.dataSources?.[this.node().source])?.paging === 'server');
  /** Sorting without shared state (no `sort.bind`): it starts from `sort.default`. */
  private readonly localSort = linkedSignal<SortSpec | null>(() => this.node().sort?.default ?? null);
  /** Current sorting: from the screen state if there is `sort.bind`, otherwise local. */
  protected readonly sort = computed<SortSpec | null>(() => {
    const bind = this.node().sort?.bind;
    return bind ? asSort(this.runtime().getState(bind)) : this.localSort();
  });
  /** With server paging and `sort.bind` the service decides the order; in every other case it sorts in the page. */
  private readonly serverSorted = computed(() => this.paged() && !!this.node().sort?.bind);
  private reportedLocalSort = false;
  protected readonly rows = computed<Row[]>(() => {
    const rows = this.loaded();
    const sort = this.sort();
    if (!sort || this.serverSorted()) return rows;
    if (this.paged() && !this.reportedLocalSort) {
      this.reportedLocalSort = true;
      this.runtime().report(`table ${this.node().source}`, 'sorting without sort.bind with server paging: only the current page is sorted');
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
  /** If the service does not declare the total, only the current page is shown (no next page). */
  protected readonly total = computed(() => {
    const total = (this.source().data as { total?: unknown } | null)?.total;
    return typeof total === 'number' ? total : (this.page() + 1) * this.pageSize();
  });

  /** Field that identifies a row in the selection. */
  private readonly key = computed(() => this.node().selection?.key ?? 'id');
  /** Keys of the selected rows, from the screen state. */
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
  /** Bulk actions see the selected rows in `selection`. */
  protected readonly bulkScope = computed<Scope>(() => ({ ...this.scope(), selection: this.selectedRows() }));

  constructor() {
    // The selection applies to the loaded rows: keys no longer there (new page, new filters, removed rows) are dropped.
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
    // Sorting a column NG-ZORRO also resets the others: resetting a column that is not the sorted one does not count.
    if (!order && this.sort()?.field !== column.field) return;
    const next: SortSpec | null = order === 'ascend' ? { field: column.field, direction: 'asc' } : order === 'descend' ? { field: column.field, direction: 'desc' } : null;
    const bind = this.node().sort?.bind;
    if (!bind) {
      this.localSort.set(next);
      return;
    }
    this.runtime().setState(bind, next);
    // A new sorting goes back to the first page, like a new filter.
    if (this.paged()) this.runtime().setState('page', 0);
  }

  protected numeric(column: ColumnDefinition): boolean {
    return column.format === 'number' || column.format === 'currency' || column.format === 'percent';
  }

  /** There is a totals row if at least one visible column has `aggregate`. */
  protected readonly hasTotals = computed(() => this.columns().some((c) => !!c.aggregate));

  /** Value of the totals row for a column, with the format of the column (plain number for the count). */
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

/** «Refresh» button of the footer: it reloads the data source like the `refresh` step. */
  /** From the click on «Refresh» while its icon turns: the central spinner appears right away. */
  protected readonly refreshing = signal(false);

  protected reload(): void {
    void this.runtime().refresh(this.node().source);
  }

  protected goTo(page: number): void {
    this.runtime().setState('page', Math.max(0, page));
  }

  /** Open rows (by key, or by position if the row has no key). */
  private readonly expanded = signal<ReadonlySet<unknown>>(new Set());
  /** Scope of every row, created once per row: a new object at every render would rebuild the nodes of the open area. */
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
