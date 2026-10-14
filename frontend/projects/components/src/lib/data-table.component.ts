import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, formatValue, runSteps, type FormatLabels, type FormattedValue, type ScreenRuntime, type Scope } from 'core';
import { BusyComponent } from './busy.component';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import type { ActionDefinition, ColumnDefinition, DataColumnDefinition, DataTableNode, SortSpec } from 'schema';
import { IconComponent } from './icon.component';
import { RowActionsComponent } from './row-actions.component';
import { TONE_COLORS, nextId, parseIsoDate, toIsoDate } from './shared';
import { aggregate, distinctValues, filterRows, flattenGroups, groupRows, isActiveFilter, sortRows, type ColumnFilter, type DisplayItem, type Row } from './table-data';

const DEFAULT_PAGE_SIZE = 10;
/** Attesa dopo l'ultima battuta prima di applicare un filtro di testo (con decine di migliaia di righe conta). */
const TEXT_FILTER_DELAY_MS = 200;
type NzSortOrder = 'ascend' | 'descend' | null;

/**
 * Datatable: analizza in pagina un insieme di righe già caricato. Ogni colonna può avere un filtro nell'intestazione
 * (testo, scelta, intervallo numerico o di date), essere ordinata e servire per raggruppare (fino a tre livelli,
 * scelti dall'utente); i gruppi mostrano conteggio e totali delle colonne con `aggregate` e si aprono e chiudono.
 * Paginazione in pagina, totale generale in fondo, azioni di riga come nella tabella.
 * Pensata per decine di migliaia di righe: si disegna solo la pagina corrente, i testi formattati delle celle si
 * calcolano una volta per riga e lingua, e il filtro di testo aspetta una breve pausa tra le battute.
 */
@Component({
  selector: 'lc-data-table',
  imports: [
    BusyComponent, FormsModule, IconComponent, RowActionsComponent, NzAlertModule, NzButtonModule, NzCheckboxModule, NzDatePickerModule, NzDropdownModule, NzInputModule,
    NzPaginationModule, NzSelectModule, NzTableModule, NzTagModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding-bottom: var(--lc-gap, 12px); }
    .toolbar label { color: var(--lc-color-muted, #5d6b7a); }
    .toolbar nz-select { min-width: 260px; }
    .count { color: var(--lc-color-muted, #5d6b7a); margin-left: auto; }
    .wrap { overflow-x: auto; overflow-y: hidden; }
    .group-row > td { background: var(--lc-sider-active-bg, rgba(127, 127, 127, 0.06)); font-weight: 500; }
    .group-label { display: inline-flex; align-items: center; gap: 6px; }
    .toggle { padding: 0 4px; }
    .group-count { color: var(--lc-color-muted, #5d6b7a); font-weight: 400; }
    .totals td { font-weight: 600; }
    .kind { font-weight: 400; color: var(--lc-color-muted, #5d6b7a); margin-right: 4px; }
    .pager { display: flex; justify-content: flex-end; padding-top: var(--lc-gap, 12px); }
    .filter-panel { padding: 12px; background: var(--lc-color-surface, #fff); border-radius: var(--lc-radius, 6px); min-width: 220px; display: flex; flex-direction: column; gap: 8px; }
    .filter-panel .options { display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; }
    .filter-panel .range { display: flex; gap: 8px; }
    .filter-panel .range input { width: 110px; }
    .filter-panel .footer { display: flex; justify-content: flex-end; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    <div>
      @if (source().status === 'error') {
        <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
      } @else {
        <div class="toolbar">
          @if (groupable().length) {
            <label [for]="groupId">{{ i18n.t('lc.groupBy') }}</label>
            <nz-select [nzId]="groupId" nzMode="multiple" [nzMaxMultipleCount]="3" nzAllowClear [nzPlaceHolder]="i18n.t('lc.noGrouping')" [ngModel]="groupBy()" (ngModelChange)="setGroupBy($event)">
              @for (column of groupable(); track column.field) {
                <nz-option [nzValue]="column.field" [nzLabel]="label(column)" />
              }
            </nz-select>
          }
          @if (anyFilter()) {
            <button nz-button type="button" (click)="clearFilters()"><lc-icon name="close" />&nbsp;{{ i18n.t('lc.clearFilters') }}</button>
          }
          <span class="count" aria-live="polite">{{ i18n.t('lc.rowsCount', { n: filtered().length, total: rows().length }) }}</span>
        </div>
        <lc-busy [busy]="source().status === 'loading'" [empty]="!rows().length">
        <div class="wrap">
          <nz-table nzSize="middle" [nzData]="pageItems()" [nzFrontPagination]="false" [nzShowPagination]="false" [nzNoResult]="empty">
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
                    [nzCustomFilter]="!!column.filter"
                  >
                    {{ label(column) }}
                    @if (column.filter) {
                      <nz-filter-trigger [nzActive]="isFiltered(column)" [nzDropdownMenu]="menu" [attr.aria-label]="i18n.t('lc.filterColumn', { label: label(column) })">
                        <lc-icon name="filter" />
                        <!-- Il menu sta dentro il pulsante: un solo nodo nell'@if, così il pulsante va nel posto giusto dell'intestazione. -->
                        <nz-dropdown-menu #menu="nzDropdownMenu">
                        <div class="filter-panel" role="group" [attr.aria-label]="i18n.t('lc.filterColumn', { label: label(column) })">
                          @switch (column.filter) {
                            @case ('text') {
                              <input nz-input type="search" [placeholder]="i18n.t('lc.filterContains')" [attr.aria-label]="i18n.t('lc.filterContains')" [ngModel]="textFilter(column)" (ngModelChange)="setTextFilter(column, $event)" />
                            }
                            @case ('select') {
                              <div class="options">
                                @for (option of options()[column.field]; track $index) {
                                  <label nz-checkbox [ngModel]="isChosen(column, option.value)" (ngModelChange)="choose(column, option.value, $event)">{{ option.label }}</label>
                                }
                              </div>
                            }
                            @case ('number') {
                              <div class="range">
                                <input nz-input type="number" [placeholder]="i18n.t('lc.from')" [attr.aria-label]="i18n.t('lc.from')" [ngModel]="bound(column, 'from')" (ngModelChange)="setBound(column, 'from', $event)" />
                                <input nz-input type="number" [placeholder]="i18n.t('lc.to')" [attr.aria-label]="i18n.t('lc.to')" [ngModel]="bound(column, 'to')" (ngModelChange)="setBound(column, 'to', $event)" />
                              </div>
                            }
                            @case ('date') {
                              <nz-range-picker [ngModel]="ranges()[column.field]" (ngModelChange)="setDates(column, $event)" />
                            }
                          }
                          <div class="footer">
                            <button nz-button nzSize="small" type="button" [disabled]="!isFiltered(column)" (click)="clearFilter(column)">{{ i18n.t('lc.reset') }}</button>
                          </div>
                        </div>
                        </nz-dropdown-menu>
                      </nz-filter-trigger>
                    }
                  </th>
                }
                @if (node().rowActions?.length) {
                  <th scope="col"><span class="visually-hidden">{{ i18n.t('lc.actions') }}</span></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (item of pageItems(); track $index) {
                @if (item.kind === 'group') {
                  <tr class="group-row">
                    @for (column of columns(); track column.field; let first = $first) {
                      <td [nzAlign]="numeric(column) ? 'right' : 'left'">
                        @if (first) {
                          <span class="group-label" [style.padding-left.px]="item.group.level * 24">
                            <button nz-button nzType="text" nzSize="small" class="toggle" type="button" [attr.aria-expanded]="!collapsed().has(item.group.key)"
                              [attr.aria-label]="i18n.t('lc.toggleGroup', { label: groupLabel(item.group.field, item.group.value) })" (click)="toggleGroup(item.group.key)">
                              <lc-icon [name]="collapsed().has(item.group.key) ? 'right' : 'down'" />
                            </button>
                            {{ groupLabel(item.group.field, item.group.value) }}
                            <span class="group-count">({{ item.group.rows.length }})</span>
                          </span>
                        } @else if (column.aggregate) {
                          @if (column.aggregate !== 'sum') {
                            <span class="kind">{{ i18n.t('lc.aggregate.' + column.aggregate) }}</span>
                          }
                          {{ totalOf(column, item.group.rows) }}
                        }
                      </td>
                    }
                    @if (node().rowActions?.length) {
                      <td></td>
                    }
                  </tr>
                } @else {
                  <tr>
                    @for (column of columns(); track column.field; let first = $first) {
                      <td [nzAlign]="numeric(column) ? 'right' : 'left'" [style.padding-left.px]="first && item.level ? 16 + item.level * 24 : null">
                        @if (cell(item.row, column); as view) {
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
                        <lc-row-actions [actions]="node().rowActions!" [inline]="node().rowActionsInline" [row]="item.row" [runtime]="runtime()" [scope]="scope()" [busy]="busy()" (run)="run($event, item.row)" />
                      </td>
                    }
                  </tr>
                }
              }
            </tbody>
            @if (hasTotals() && filtered().length) {
              <tfoot nzSummary>
                <tr class="totals">
                  @for (column of columns(); track column.field; let first = $first) {
                    <td [nzAlign]="numeric(column) ? 'right' : 'left'">
                      @if (column.aggregate) {
                        @if (column.aggregate !== 'sum') {
                          <span class="kind">{{ i18n.t('lc.aggregate.' + column.aggregate) }}</span>
                        }
                        {{ totalOf(column, filtered()) }}
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
        <ng-template #empty>
          @if (source().status !== 'loading') {
            <span role="status">{{ i18n.t('lc.noResults') }}</span>
          }
        </ng-template>
        @if (items().length > pageSize()) {
          <div class="pager">
            <nz-pagination [nzPageIndex]="page() + 1" [nzPageSize]="pageSize()" [nzTotal]="items().length" (nzPageIndexChange)="page.set($event - 1)" />
          </div>
        }
      }
    </div>
  `,
})
export class DataTableComponent {
  readonly node = input.required<DataTableNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly i18n = inject(I18n);
  protected readonly groupId = nextId('lc-datatable-group');
  protected readonly busy = signal(false);
  private readonly labels = (): FormatLabels => ({ yes: this.i18n.t('lc.yes'), no: this.i18n.t('lc.no'), translate: (key, fallback) => this.i18n.t(key, {}, fallback) });

  protected readonly source = computed(() => this.runtime().source(this.node().source));
  protected readonly rows = computed<Row[]>(() => {
    const data = this.source().data;
    if (Array.isArray(data)) return data as Row[];
    const items = (data as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? (items as Row[]) : [];
  });
  protected readonly columns = computed(() => this.node().columns.filter((c) => this.runtime().isVisible(c, this.scope())));
  protected readonly groupable = computed(() => this.columns().filter((c) => c.groupable));
  private readonly byField = computed(() => new Map(this.node().columns.map((c) => [c.field, c] as const)));

  // Stato dell'utente: filtri, ordinamento, raggruppamento, gruppi chiusi, pagina.
  protected readonly filters = signal<Record<string, ColumnFilter>>({});
  protected readonly sort = linkedSignal<SortSpec | null>(() => this.node().defaultSort ?? null);
  protected readonly groupBy = linkedSignal<string[]>(() => (this.node().groupBy ?? []).filter((f) => this.byField().get(f)?.groupable).slice(0, 3));
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());
  protected readonly pageSize = computed(() => this.node().pageSize ?? DEFAULT_PAGE_SIZE);

  protected readonly filtered = computed(() => filterRows(this.rows(), this.filters(), (row, field) => this.shownText(row, field)));
  private readonly sorted = computed(() => sortRows(this.filtered(), this.sort(), this.i18n.intlLocale()));
  protected readonly items = computed<DisplayItem[]>(() => {
    const fields = this.groupBy();
    if (!fields.length) return this.sorted().map((row) => ({ kind: 'row', row, level: 0 }));
    return flattenGroups(groupRows(this.sorted(), fields, this.i18n.intlLocale()), this.collapsed(), fields.length);
  });
  /** Pagina corrente: torna alla prima quando cambiano filtri, ordinamento o gruppi. */
  protected readonly page = linkedSignal<number>(() => (this.filters(), this.sort(), this.groupBy(), 0));
  protected readonly pageItems = computed(() => {
    const size = this.pageSize();
    const last = Math.max(0, Math.ceil(this.items().length / size) - 1);
    const page = Math.min(this.page(), last);
    return this.items().slice(page * size, page * size + size);
  });

  protected readonly hasTotals = computed(() => this.columns().some((c) => !!c.aggregate));
  protected readonly anyFilter = computed(() => Object.values(this.filters()).some((f) => isActiveFilter(f)));

  /** Valori proposti dai filtri a scelta, con il testo mostrato (tradotto con valueKey). */
  protected readonly options = computed<Record<string, { value: unknown; label: string }[]>>(() =>
    Object.fromEntries(
      this.columns()
        .filter((c) => c.filter === 'select')
        .map((c) => [c.field, distinctValues(this.rows(), c.field, this.i18n.intlLocale()).map((value) => ({ value, label: this.format(value, c).text }))]),
    ),
  );
  /** Intervalli dei filtri di date come coppie di Date, una volta per valore (vedi i campi data del form). */
  protected readonly ranges = computed<Record<string, (Date | null)[]>>(() =>
    Object.fromEntries(
      this.columns()
        .filter((c) => c.filter === 'date')
        .map((c) => {
          const f = this.filters()[c.field];
          return [c.field, f?.kind === 'date' && (f.from || f.to) ? [parseIsoDate(f.from), parseIsoDate(f.to)] : []];
        }),
    ),
  );

  protected label(column: DataColumnDefinition): string {
    return this.runtime().text(column.label, this.scope()) || column.field;
  }

  private format(value: unknown, column: ColumnDefinition): FormattedValue {
    return formatValue(value, column, this.i18n.intlLocale(), this.labels());
  }

  protected cell(row: Row, column: DataColumnDefinition): FormattedValue {
    return this.format(row[column.field], column);
  }

  /** Testi mostrati già calcolati, per riga e campo; si ricominciano al cambio di lingua. */
  private readonly texts = computed(() => (this.i18n.locale(), new WeakMap<Row, Map<string, string>>()));

  private shownText(row: Row, field: string): string {
    const cache = this.texts();
    let byField = cache.get(row);
    if (!byField) cache.set(row, (byField = new Map()));
    let text = byField.get(field);
    if (text === undefined) {
      const column = this.byField().get(field);
      text = column ? this.format(row[field], column).text : String(row[field] ?? '');
      byField.set(field, text);
    }
    return text;
  }

  protected groupLabel(field: string, value: unknown): string {
    const column = this.byField().get(field);
    const text = column ? this.format(value, column).text : String(value ?? '');
    return `${column ? this.label(column) : field}: ${text || '—'}`;
  }

  protected color(tone: NonNullable<FormattedValue['tone']>): string {
    return TONE_COLORS[tone];
  }

  protected numeric(column: ColumnDefinition): boolean {
    return column.format === 'number' || column.format === 'currency' || column.format === 'percent';
  }

  protected totalOf(column: DataColumnDefinition, rows: readonly Row[]): string {
    if (!column.aggregate) return '';
    const value = aggregate(rows, column.field, column.aggregate);
    if (value === null) return '';
    const spec: ColumnDefinition =
      column.aggregate === 'count' ? { field: column.field, format: 'number', decimals: 0 } : this.numeric(column) ? column : { field: column.field, format: 'number' };
    return this.format(value, spec).text;
  }

  // Ordinamento (in pagina, come nella tabella senza paginazione lato server).
  protected order(column: DataColumnDefinition): NzSortOrder {
    const sort = this.sort();
    if (!column.sortable || sort?.field !== column.field) return null;
    return sort.direction === 'asc' ? 'ascend' : 'descend';
  }
  protected ariaSort(column: DataColumnDefinition): string | null {
    if (!column.sortable) return null;
    const order = this.order(column);
    return order === 'ascend' ? 'ascending' : order === 'descend' ? 'descending' : 'none';
  }
  protected setSort(column: DataColumnDefinition, order: string | null): void {
    if (!order && this.sort()?.field !== column.field) return;
    this.sort.set(order === 'ascend' ? { field: column.field, direction: 'asc' } : order === 'descend' ? { field: column.field, direction: 'desc' } : null);
  }

  // Raggruppamento.
  protected setGroupBy(fields: string[]): void {
    this.groupBy.set((fields ?? []).slice(0, 3));
    this.collapsed.set(new Set());
  }
  protected toggleGroup(key: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Filtri.
  protected isFiltered(column: DataColumnDefinition): boolean {
    return isActiveFilter(this.filters()[column.field]);
  }
  private textTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly cleanup = inject(DestroyRef).onDestroy(() => this.textTimer && clearTimeout(this.textTimer));

  protected setTextFilter(column: DataColumnDefinition, text: string): void {
    if (this.textTimer) clearTimeout(this.textTimer);
    this.textTimer = setTimeout(() => this.setFilter(column, { kind: 'text', text }), TEXT_FILTER_DELAY_MS);
  }

  protected setFilter(column: DataColumnDefinition, filter: ColumnFilter): void {
    this.filters.update((all) => ({ ...all, [column.field]: filter }));
  }
  protected clearFilter(column: DataColumnDefinition): void {
    this.filters.update((all) => {
      const next = { ...all };
      delete next[column.field];
      return next;
    });
  }
  protected clearFilters(): void {
    this.filters.set({});
  }
  protected textFilter(column: DataColumnDefinition): string {
    const f = this.filters()[column.field];
    return f?.kind === 'text' ? f.text : '';
  }
  protected isChosen(column: DataColumnDefinition, value: unknown): boolean {
    const f = this.filters()[column.field];
    return f?.kind === 'select' && f.values.includes(value);
  }
  protected choose(column: DataColumnDefinition, value: unknown, checked: boolean): void {
    const f = this.filters()[column.field];
    const values = f?.kind === 'select' ? f.values.filter((v) => v !== value) : [];
    this.setFilter(column, { kind: 'select', values: checked ? [...values, value] : values });
  }
  protected bound(column: DataColumnDefinition, which: 'from' | 'to'): number | null {
    const f = this.filters()[column.field];
    return f?.kind === 'number' ? f[which] : null;
  }
  protected setBound(column: DataColumnDefinition, which: 'from' | 'to', raw: unknown): void {
    const f = this.filters()[column.field];
    const current = f?.kind === 'number' ? f : { kind: 'number' as const, from: null, to: null };
    const n = raw === '' || raw === null || raw === undefined ? null : Number(raw);
    this.setFilter(column, { ...current, [which]: n === null || Number.isNaN(n) ? null : n });
  }
  protected setDates(column: DataColumnDefinition, range: (Date | null)[] | null): void {
    const [from, to] = range ?? [];
    this.setFilter(column, { kind: 'date', from: toIsoDate(from ?? null), to: toIsoDate(to ?? null) });
  }

  protected async run(action: ActionDefinition, row: Row): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await runSteps(this.runtime(), action.onClick, { ...this.scope(), row });
    } finally {
      this.busy.set(false);
    }
  }
}
