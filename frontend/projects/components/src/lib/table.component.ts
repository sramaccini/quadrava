import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { runSteps, type ScreenRuntime, type Scope } from 'core';
import type { ActionDefinition, TableNode } from 'schema';
import { CONTROL_STYLES } from './shared';

/**
 * Tabella con azioni di riga. Contratto della risposta del data source: un array di righe oppure
 * `{ items: [...], total: n, size: n }` per la paginazione lato server. Una riga può contenere `_perm`
 * con i permessi sulla riga (es. `row._perm.update`).
 */
@Component({
  selector: 'lc-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    CONTROL_STYLES,
    `
      .wrap { overflow-x: auto; border: 1px solid var(--lc-color-border, #d5dbe3); border-radius: var(--lc-radius, 6px); background: var(--lc-color-surface, #fff); }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: calc(var(--lc-gap, 12px) * .6) var(--lc-gap, 12px); border-bottom: 1px solid var(--lc-color-border, #d5dbe3); }
      th { font-size: .85em; color: var(--lc-color-muted, #5d6b7a); font-weight: 600; }
      tr:last-child td { border-bottom: 0; }
      td.actions { display: flex; gap: 6px; }
      .state { padding: var(--lc-gap, 12px); color: var(--lc-color-muted, #5d6b7a); }
      .state.error { color: var(--lc-color-danger, #c62828); }
      .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      .pager { display: flex; align-items: center; gap: var(--lc-gap, 12px); justify-content: flex-end; padding: var(--lc-gap, 12px); }
    `,
  ],
  template: `
    <div class="wrap" [attr.aria-busy]="source().status === 'loading'">
      @if (source().status === 'error') {
        <p class="state error" role="alert">{{ source().error }}</p>
      } @else {
        <table>
          <thead>
            <tr>
              @for (column of node().columns; track column.field) {
                <th scope="col">{{ column.label ?? column.field }}</th>
              }
              @if (node().rowActions?.length) {
                <th scope="col"><span class="visually-hidden">Azioni</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index) {
              <tr>
                @for (column of node().columns; track column.field) {
                  <td>{{ cell(row, column.field) }}</td>
                }
                @if (node().rowActions?.length) {
                  <td class="actions">
                    @for (action of node().rowActions; track $index) {
                      @if (runtime().isVisible(action, { row: row })) {
                        <button type="button" class="lc-btn secondary" [disabled]="busy() || !runtime().isEnabled(action, { row: row })" (click)="run(action, row)">
                          {{ action.label }}
                        </button>
                      }
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
        @if (source().status === 'loading' && rows().length === 0) {
          <p class="state" role="status">Caricamento…</p>
        } @else if (source().status === 'ready' && rows().length === 0) {
          <p class="state" role="status">Nessun risultato.</p>
        }
        @if (paged()) {
          <div class="pager">
            <button type="button" class="lc-btn secondary" [disabled]="page() === 0" (click)="goTo(page() - 1)">Precedente</button>
            <span>Pagina {{ page() + 1 }}</span>
            <button type="button" class="lc-btn secondary" [disabled]="!hasNext()" (click)="goTo(page() + 1)">Successiva</button>
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

  protected readonly source = computed(() => this.runtime().source(this.node().source));
  protected readonly rows = computed<Record<string, unknown>[]>(() => {
    const data = this.source().data;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    const items = (data as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
  });
  protected readonly paged = computed(() => this.runtime().definition.dataSources?.[this.node().source]?.paging === 'server');
  protected readonly page = computed(() => {
    const page = this.runtime().state()['page'];
    return typeof page === 'number' ? page : 0;
  });
  protected readonly hasNext = computed(() => {
    const data = this.source().data as { total?: number; size?: number } | null;
    if (typeof data?.total !== 'number' || typeof data.size !== 'number') return false;
    return (this.page() + 1) * data.size < data.total;
  });

  protected cell(row: Record<string, unknown>, field: string): string {
    const value = row[field];
    return value === null || value === undefined ? '' : String(value);
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
