import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
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
import type { ActionDefinition, ColumnDefinition, DataColumnDefinition, ServerDataTableNode, SortSpec } from 'schema';
import { IconComponent } from './icon.component';
import { RowActionsComponent } from './row-actions.component';
import { TONE_COLORS, nextId, parseIsoDate, toIsoDate } from './shared';
import { isActiveFilter, type ColumnFilter, type Row } from './table-data';

const DEFAULT_PAGE_SIZE = 20;
const TEXT_FILTER_DELAY_MS = 300;
type NzSortOrder = 'ascend' | 'descend' | null;

/** Un filtro attivo come lo riceve il servizio. */
export type ServerFilter = { field: string } & ColumnFilter;

/** Richiesta che la tabella passa al data source nella variabile `request`. */
export interface ServerTableRequest {
  /** Pagina (da 0) del livello richiesto: le righe, oppure i gruppi del primo livello. */
  page: number;
  size: number;
  sort: SortSpec | null;
  filters: ServerFilter[];
  /** Colonne di raggruppamento scelte, in ordine. */
  groupBy: string[];
  /** Gruppo di cui si chiede il contenuto (vuoto = primo livello): con meno valori di groupBy si chiedono sottogruppi, altrimenti righe. */
  groupPath: { field: string; value: unknown }[];
  /** Se presente si chiedono solo i valori distinti di questa colonna (per il filtro a scelta), con gli altri filtri applicati. */
  distinct?: string;
}

export interface ServerGroup {
  value: unknown;
  count: number;
  aggregates?: Record<string, number | null>;
}

/** Un livello caricato: il primo (chiave vuota) o il contenuto di un gruppo aperto. */
interface Level {
  status: 'loading' | 'ready' | 'error';
  rows: Row[];
  groups: ServerGroup[];
  total: number;
  /** Ultima pagina caricata (dentro un gruppo le pagine si accodano con «mostra altre»). */
  page: number;
  totals?: Record<string, number | null>;
}

type Item =
  | { kind: 'group'; key: string; group: ServerGroup; field: string; level: number; path: { field: string; value: unknown }[] }
  | { kind: 'row'; row: Row; level: number }
  | { kind: 'more'; key: string; level: number; remaining: number; loading: boolean }
  | { kind: 'loading'; level: number }
  | { kind: 'error'; level: number };

function asLevel(data: unknown, page: number, previous?: Level): Level {
  const d = (data ?? {}) as { items?: unknown; groups?: unknown; total?: unknown; totals?: unknown };
  const rows = Array.isArray(d.items) ? (d.items as Row[]) : [];
  const groups = Array.isArray(d.groups) ? (d.groups as ServerGroup[]) : [];
  const total = typeof d.total === 'number' ? d.total : rows.length + groups.length;
  const totals = d.totals && typeof d.totals === 'object' ? (d.totals as Record<string, number | null>) : undefined;
  return previous ? { ...previous, status: 'ready', rows: [...previous.rows, ...rows], total, page } : { status: 'ready', rows, groups, total, page, totals };
}

/**
 * Datatable pilotata dal servizio, per tabelle molto grandi: filtri, ordinamento, raggruppamento, totali e paginazione
 * li calcola il data source, e nel browser resta solo ciò che si vede. Il componente esegue il data source con la
 * variabile `request` (vedi `ServerTableRequest`) per il primo livello, per il contenuto di ogni gruppo che l'utente
 * apre (righe a pagine, con «mostra altre») e per i valori dei filtri a scelta. Le risposte arrivate fuori ordine si
 * scartano; il passo `refresh` sul data source ripete le richieste.
 */
@Component({
  selector: 'lc-server-data-table',
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
    .note-row > td { color: var(--lc-color-muted, #5d6b7a); }
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
      @if (top()?.status === 'error') {
        <div role="alert"><nz-alert nzType="error" [nzMessage]="i18n.t('lc.loadFailed')" nzShowIcon /></div>
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
          <span class="count" aria-live="polite">{{ countText() }}</span>
        </div>
        <lc-busy [busy]="top()?.status === 'loading'" [empty]="!items().length">
        <div class="wrap">
          <nz-table nzSize="middle" [nzData]="items()" [nzFrontPagination]="false" [nzShowPagination]="false" [nzNoResult]="empty">
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
                      <nz-filter-trigger [nzActive]="isFiltered(column)" [nzDropdownMenu]="menu" (nzVisibleChange)="$event && column.filter === 'select' && loadOptions(column)" [attr.aria-label]="i18n.t('lc.filterColumn', { label: label(column) })">
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
                                  @for (option of options()[column.field] ?? []; track $index) {
                                    <label nz-checkbox [ngModel]="isChosen(column, option)" (ngModelChange)="choose(column, option, $event)">{{ format(option, column).text || '—' }}</label>
                                  } @empty {
                                    <span role="status">{{ i18n.t('lc.loading') }}</span>
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
              @for (item of items(); track $index) {
                @switch (item.kind) {
                  @case ('group') {
                    <tr class="group-row">
                      @for (column of columns(); track column.field; let first = $first) {
                        <td [nzAlign]="numeric(column) ? 'right' : 'left'">
                          @if (first) {
                            <span class="group-label" [style.padding-left.px]="item.level * 24">
                              <button nz-button nzType="text" nzSize="small" class="toggle" type="button" [attr.aria-expanded]="expanded().has(item.key)"
                                [attr.aria-label]="i18n.t('lc.toggleGroup', { label: groupLabel(item.field, item.group.value) })" (click)="toggleGroup(item.key, item.path)">
                                <lc-icon [name]="expanded().has(item.key) ? 'down' : 'right'" />
                              </button>
                              {{ groupLabel(item.field, item.group.value) }}
                              <span class="group-count">({{ countFormat(item.group.count) }})</span>
                            </span>
                          } @else if (column.aggregate) {
                            @if (column.aggregate !== 'sum') {
                              <span class="kind">{{ i18n.t('lc.aggregate.' + column.aggregate) }}</span>
                            }
                            {{ aggregateText(column, item.group.aggregates?.[column.field]) }}
                          }
                        </td>
                      }
                      @if (node().rowActions?.length) {
                        <td></td>
                      }
                    </tr>
                  }
                  @case ('row') {
                    <tr>
                      @for (column of columns(); track column.field; let first = $first) {
                        <td [nzAlign]="numeric(column) ? 'right' : 'left'" [style.padding-left.px]="first && item.level ? 16 + item.level * 24 : null">
                          @if (format(item.row[column.field], column); as view) {
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
                  @case ('more') {
                    <tr class="note-row">
                      <td [attr.colspan]="colspan()" [style.padding-left.px]="16 + item.level * 24">
                        <button nz-button nzSize="small" type="button" [nzLoading]="item.loading" (click)="loadMore(item.key)">{{ i18n.t('lc.showMore', { n: item.remaining }) }}</button>
                      </td>
                    </tr>
                  }
                  @case ('loading') {
                    <tr class="note-row"><td [attr.colspan]="colspan()" [style.padding-left.px]="16 + item.level * 24" role="status">{{ i18n.t('lc.loading') }}</td></tr>
                  }
                  @case ('error') {
                    <tr class="note-row"><td [attr.colspan]="colspan()" [style.padding-left.px]="16 + item.level * 24" role="alert">{{ i18n.t('lc.loadFailed') }}</td></tr>
                  }
                }
              }
            </tbody>
            @if (hasTotals() && top()?.totals) {
              <tfoot nzSummary>
                <tr class="totals">
                  @for (column of columns(); track column.field; let first = $first) {
                    <td [nzAlign]="numeric(column) ? 'right' : 'left'">
                      @if (column.aggregate) {
                        @if (column.aggregate !== 'sum') {
                          <span class="kind">{{ i18n.t('lc.aggregate.' + column.aggregate) }}</span>
                        }
                        {{ aggregateText(column, top()?.totals?.[column.field]) }}
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
          @if (top()?.status !== 'loading') {
            <span role="status">{{ i18n.t('lc.noResults') }}</span>
          }
        </ng-template>
        @if ((top()?.total ?? 0) > pageSize()) {
          <div class="pager">
            <nz-pagination [nzPageIndex]="page() + 1" [nzPageSize]="pageSize()" [nzTotal]="top()?.total ?? 0" (nzPageIndexChange)="page.set($event - 1)" />
          </div>
        }
      }
    </div>
  `,
})
export class ServerDataTableComponent {
  readonly node = input.required<ServerDataTableNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly i18n = inject(I18n);
  protected readonly groupId = nextId('lc-server-table-group');
  protected readonly busy = signal(false);
  private readonly labels = (): FormatLabels => ({ yes: this.i18n.t('lc.yes'), no: this.i18n.t('lc.no'), translate: (key, fallback) => this.i18n.t(key, {}, fallback) });

  protected readonly columns = computed(() => this.node().columns.filter((c) => this.runtime().isVisible(c, this.scope())));
  protected readonly groupable = computed(() => this.columns().filter((c) => c.groupable));
  private readonly byField = computed(() => new Map(this.node().columns.map((c) => [c.field, c] as const)));
  protected readonly pageSize = computed(() => this.node().pageSize ?? DEFAULT_PAGE_SIZE);
  protected readonly colspan = computed(() => this.columns().length + (this.node().rowActions?.length ? 1 : 0));

  // Scelte dell'utente.
  protected readonly filters = signal<Record<string, ColumnFilter>>({});
  protected readonly sort = linkedSignal<SortSpec | null>(() => this.node().defaultSort ?? null);
  protected readonly groupBy = linkedSignal<string[]>(() => (this.node().groupBy ?? []).filter((f) => this.byField().get(f)?.groupable).slice(0, 3));
  /** Pagina del primo livello: torna alla prima quando cambiano filtri, ordinamento o gruppi. */
  protected readonly page = linkedSignal<number>(() => (this.filters(), this.sort(), this.groupBy(), 0));

  // Dati caricati: livelli per chiave del gruppo ('' = primo livello), gruppi aperti, valori dei filtri a scelta.
  private readonly levels = signal<ReadonlyMap<string, Level>>(new Map());
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly options = signal<Record<string, unknown[]>>({});
  private readonly loadingMore = signal<ReadonlySet<string>>(new Set());
  private generation = 0;

  protected readonly top = computed(() => this.levels().get(''));
  protected readonly anyFilter = computed(() => Object.values(this.filters()).some((f) => isActiveFilter(f)));
  protected readonly hasTotals = computed(() => this.columns().some((c) => !!c.aggregate));
  private readonly activeFilters = computed<ServerFilter[]>(() =>
    Object.entries(this.filters())
      .filter(([, f]) => isActiveFilter(f))
      .map(([field, f]) => ({ field, ...f })),
  );

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

  constructor() {
    // Primo livello: a ogni cambio di filtri, ordinamento, gruppi, pagina o refresh si ricomincia da capo.
    effect(() => {
      const request = this.request(this.page(), []);
      this.runtime().refreshCount()[this.node().source];
      untracked(() => void this.loadTop(request));
    });
    // La richiesta corrente (senza pagina) nello stato, per altri componenti.
    effect(() => {
      const bind = this.node().bind;
      const request = { sort: this.sort(), filters: this.activeFilters(), groupBy: this.groupBy() };
      if (bind) untracked(() => this.runtime().setState(bind, request));
    });
    inject(DestroyRef).onDestroy(() => this.textTimer && clearTimeout(this.textTimer));
  }

  private request(page: number, groupPath: ServerTableRequest['groupPath'], extra: Partial<ServerTableRequest> = {}): ServerTableRequest {
    return { page, size: this.pageSize(), sort: this.sort(), filters: this.activeFilters(), groupBy: this.groupBy(), groupPath, ...extra };
  }

  private async fetch(request: ServerTableRequest): Promise<{ ok: true; data: unknown } | { ok: false }> {
    const result = await this.runtime().query(this.node().source, { request }, this.scope());
    return result.ok ? { ok: true, data: result.data } : { ok: false };
  }

  /** Filtri, ordinamento e gruppi dell'ultima vista caricata: se non cambiano (pagina nuova, refresh) i gruppi aperti restano aperti. */
  private lastShape = '';

  private async loadTop(request: ServerTableRequest): Promise<void> {
    const generation = ++this.generation;
    const shape = JSON.stringify({ sort: request.sort, filters: request.filters, groupBy: request.groupBy });
    const sameShape = shape === this.lastShape;
    this.lastShape = shape;
    const before = this.levels();
    const previous = before.get('');
    // Mentre arriva la nuova pagina restano visibili le righe di prima (con l'indicatore di caricamento).
    this.levels.set(new Map([...(sameShape ? before : []), ['', previous ? { ...previous, status: 'loading' } : { status: 'loading', rows: [], groups: [], total: 0, page: request.page }]]));
    if (!sameShape) this.expanded.set(new Set());
    const result = await this.fetch(request);
    if (generation !== this.generation) return;
    const top: Level = result.ok ? asLevel(result.data, request.page) : { status: 'error', rows: [], groups: [], total: 0, page: request.page };
    if (!sameShape) {
      this.levels.set(new Map([['', top]]));
      return;
    }
    // Stessa vista: si ricarica il contenuto dei gruppi aperti, fino a dove l'utente era arrivato.
    this.setLevel('', top);
    const open = [...this.expanded()].filter((key) => before.has(key));
    await Promise.all(
      open.map(async (key) => {
        const loaded = before.get(key)!;
        const path = JSON.parse(key) as ServerTableRequest['groupPath'];
        const pages = loaded.page + 1;
        const res = await this.fetch(this.request(0, path, { size: this.pageSize() * pages }));
        if (generation !== this.generation) return;
        if (res.ok) this.setLevel(key, { ...asLevel(res.data, loaded.page) });
      }),
    );
  }

  protected async toggleGroup(key: string, path: ServerTableRequest['groupPath']): Promise<void> {
    const open = this.expanded().has(key);
    this.expanded.update((set) => {
      const next = new Set(set);
      if (open) next.delete(key);
      else next.add(key);
      return next;
    });
    if (open || this.levels().has(key)) return;
    const generation = this.generation;
    this.setLevel(key, { status: 'loading', rows: [], groups: [], total: 0, page: 0 });
    const result = await this.fetch(this.request(0, path));
    if (generation !== this.generation) return;
    this.setLevel(key, result.ok ? asLevel(result.data, 0) : { status: 'error', rows: [], groups: [], total: 0, page: 0 });
  }

  protected async loadMore(key: string): Promise<void> {
    const level = this.levels().get(key);
    if (!level || this.loadingMore().has(key)) return;
    const path = JSON.parse(key) as ServerTableRequest['groupPath'];
    const generation = this.generation;
    this.loadingMore.update((set) => new Set(set).add(key));
    const result = await this.fetch(this.request(level.page + 1, path));
    this.loadingMore.update((set) => {
      const next = new Set(set);
      next.delete(key);
      return next;
    });
    if (generation !== this.generation || !result.ok) return;
    this.setLevel(key, asLevel(result.data, level.page + 1, this.levels().get(key)));
  }

  private setLevel(key: string, level: Level): void {
    this.levels.update((map) => new Map(map).set(key, level));
  }

  /** Valori proposti da un filtro a scelta: li dà il servizio, con gli altri filtri applicati. */
  protected async loadOptions(column: DataColumnDefinition): Promise<void> {
    const others = this.activeFilters().filter((f) => f.field !== column.field);
    const result = await this.runtime().query(this.node().source, { request: { ...this.request(0, []), filters: others, groupBy: [], distinct: column.field } }, this.scope());
    const values = result.ok ? (result.data as { values?: unknown } | null)?.values : null;
    if (Array.isArray(values)) this.options.update((all) => ({ ...all, [column.field]: values }));
  }

  /** Elenco da disegnare: gruppi aperti con il loro contenuto, righe, «mostra altre» e stati di caricamento. */
  protected readonly items = computed<Item[]>(() => {
    const out: Item[] = [];
    const fields = this.groupBy();
    const walk = (key: string, path: ServerTableRequest['groupPath'], depth: number): void => {
      const level = this.levels().get(key);
      if (!level) return;
      if (level.status === 'error') {
        out.push({ kind: 'error', level: depth });
        return;
      }
      if (level.status === 'loading' && key !== '') {
        out.push({ kind: 'loading', level: depth });
        return;
      }
      if (depth < fields.length) {
        for (const group of level.groups) {
          const childPath = [...path, { field: fields[depth], value: group.value }];
          const childKey = JSON.stringify(childPath);
          out.push({ kind: 'group', key: childKey, group, field: fields[depth], level: depth, path: childPath });
          if (this.expanded().has(childKey)) walk(childKey, childPath, depth + 1);
        }
        return;
      }
      for (const row of level.rows) out.push({ kind: 'row', row, level: depth });
      if (key !== '' && level.rows.length < level.total) {
        out.push({ kind: 'more', key, level: depth, remaining: level.total - level.rows.length, loading: this.loadingMore().has(key) });
      }
    };
    walk('', [], 0);
    return out;
  });

  protected readonly countText = computed(() => {
    const top = this.top();
    if (!top || top.status === 'error') return '';
    return this.groupBy().length ? this.i18n.t('lc.groupsCount', { n: top.total }) : this.i18n.t('lc.serverRowsCount', { n: top.total });
  });

  // Presentazione.
  protected label(column: DataColumnDefinition): string {
    return this.runtime().text(column.label, this.scope()) || column.field;
  }
  protected format(value: unknown, column: ColumnDefinition): FormattedValue {
    return formatValue(value, column, this.i18n.intlLocale(), this.labels());
  }
  protected groupLabel(field: string, value: unknown): string {
    const column = this.byField().get(field);
    const text = column ? this.format(value, column).text : String(value ?? '');
    return `${column ? this.label(column) : field}: ${text || '—'}`;
  }
  protected countFormat(n: number): string {
    return new Intl.NumberFormat(this.i18n.intlLocale()).format(n);
  }
  protected color(tone: NonNullable<FormattedValue['tone']>): string {
    return TONE_COLORS[tone];
  }
  protected numeric(column: ColumnDefinition): boolean {
    return column.format === 'number' || column.format === 'currency' || column.format === 'percent';
  }
  protected aggregateText(column: DataColumnDefinition, value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const spec: ColumnDefinition =
      column.aggregate === 'count' ? { field: column.field, format: 'number', decimals: 0 } : this.numeric(column) ? column : { field: column.field, format: 'number' };
    return this.format(value, spec).text;
  }

  // Ordinamento.
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
  }

  // Filtri.
  protected isFiltered(column: DataColumnDefinition): boolean {
    return isActiveFilter(this.filters()[column.field]);
  }
  private setFilter(column: DataColumnDefinition, filter: ColumnFilter): void {
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
  private textTimer: ReturnType<typeof setTimeout> | null = null;
  protected setTextFilter(column: DataColumnDefinition, text: string): void {
    if (this.textTimer) clearTimeout(this.textTimer);
    this.textTimer = setTimeout(() => this.setFilter(column, { kind: 'text', text }), TEXT_FILTER_DELAY_MS);
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

  /** Azione di riga. Se cambia i dati, la sequenza termina con `refresh` sul data source della tabella, che ripete le richieste. */
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
