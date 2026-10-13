import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n, rowsOf, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import type { KanbanNode } from 'schema';
import { TONE_COLORS } from './display.component';
import { IconComponent } from './icon.component';

type Row = Record<string, unknown>;

/**
 * Kanban: le righe del data source in colonne secondo `columnField` (le righe con un valore che non è una colonna non
 * si mostrano). Con `onMove` una scheda si sposta trascinandola in un'altra colonna o, da tastiera, con il menu
 * «Sposta in»: i passi vedono la riga in `row`, la colonna di partenza in `from` e quella di arrivo in `to` (di solito
 * una call e un refresh). `moveIf` decide quali schede si possono spostare (fail-closed). Lo spostamento vero lo fa il
 * servizio: la scheda cambia colonna quando i dati ricaricati lo dicono.
 */
@Component({
  selector: 'lc-kanban',
  imports: [IconComponent, NzAlertModule, NzButtonModule, NzDropdownModule, NzMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .board { display: flex; gap: var(--lc-gap, 12px); overflow-x: auto; padding-bottom: 4px; }
    .column { flex: 1 0 220px; display: flex; flex-direction: column; gap: 8px; padding: 8px; border-radius: var(--lc-radius, 6px);
      background: color-mix(in srgb, var(--lc-color-muted, #5d6b7a) 8%, transparent); border-top: 3px solid var(--lc-kanban-tone); }
    .column.over { outline: 2px dashed var(--lc-color-primary, #1f5fbf); outline-offset: -2px; }
    h3 { display: flex; justify-content: space-between; margin: 0; font-size: 14px; font-weight: 600; }
    .count { color: var(--lc-color-muted, #5d6b7a); font-weight: 400; }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-height: 40px; }
    .card { display: flex; gap: 4px; align-items: flex-start; padding: 8px; border-radius: var(--lc-radius, 6px); background: var(--lc-color-surface, #fff);
      border: 1px solid var(--lc-color-border, #d0d7de); }
    .card[draggable='true'] { cursor: grab; }
    .card.busy { opacity: 0.6; }
    .text { flex: 1; min-width: 0; }
    .title { display: block; font-weight: 600; overflow-wrap: anywhere; }
    .description { display: block; margin-top: 2px; font-size: 12px; color: var(--lc-color-muted, #5d6b7a); overflow-wrap: anywhere; }
    .empty { color: var(--lc-color-muted, #5d6b7a); font-size: 12px; }
  `,
  template: `
    @if (source().status === 'error') {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
    } @else {
      <div class="board" [attr.aria-busy]="source().status === 'loading'">
        @for (column of columns(); track column.value) {
          <section
            class="column"
            [class.over]="over() === column.value"
            [style.--lc-kanban-tone]="column.color"
            [attr.aria-label]="column.label"
            (dragover)="dragOver($event, column.value)"
            (dragleave)="over.set(null)"
            (drop)="drop($event, column.value)"
          >
            <h3>
              <span>{{ column.label }}</span>&ngsp;<span class="count">{{ column.rows.length }}</span>
            </h3>
            <ul>
              @for (row of column.rows; track $index) {
                @let movable = canMove(row);
                <li class="card" [class.busy]="busy() === row" [attr.draggable]="movable" (dragstart)="dragStart($event, row)" (dragend)="over.set(null)">
                  <span class="text">
                    <span class="title">{{ text(row, node().titleField) }}</span>
                    @if (node().descriptionField) {
                      &ngsp;<span class="description">{{ text(row, node().descriptionField!) }}</span>
                    }
                  </span>
                  @if (movable) {
                    <button
                      nz-button
                      nzType="text"
                      nzSize="small"
                      type="button"
                      nz-dropdown
                      nzTrigger="click"
                      [nzDropdownMenu]="menu"
                      [disabled]="busy() !== null"
                      [attr.aria-label]="i18n.t('lc.moveTo', { title: text(row, node().titleField) })"
                    >
                      <lc-icon name="move" />
                    </button>
                    <nz-dropdown-menu #menu="nzDropdownMenu">
                      <ul nz-menu>
                        @for (target of columns(); track target.value) {
                          @if (target.value !== column.value) {
                            <li nz-menu-item (click)="move(row, target.value)">{{ target.label }}</li>
                          }
                        }
                      </ul>
                    </nz-dropdown-menu>
                  }
                </li>
              } @empty {
                <li class="empty">{{ i18n.t('lc.noRows') }}</li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
})
export class KanbanComponent {
  readonly node = input.required<KanbanNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);
  /** Colonna su cui si sta trascinando una scheda. */
  protected readonly over = signal<string | null>(null);
  /** Scheda il cui spostamento è in corso. */
  protected readonly busy = signal<Row | null>(null);
  private dragged: Row | null = null;

  protected readonly source = computed(() => this.runtime().source(this.node().source));

  protected readonly columns = computed(() => {
    const node = this.node();
    const rows = rowsOf(this.source().data);
    return node.columns.map((column) => ({
      value: column.value,
      label: this.runtime().text(column.label, this.scope()),
      color: TONE_COLORS[column.tone ?? 'neutral'],
      rows: rows.filter((row) => String(row[node.columnField] ?? '') === column.value),
    }));
  });

  protected text(row: Row, field: string): string {
    const value = row[field];
    return value === null || value === undefined ? '' : String(value);
  }

  /** Spostabile se ci sono passi per farlo e `moveIf` (se c'è) dice di sì per la riga; un errore vale no. */
  protected canMove(row: Row): boolean {
    const node = this.node();
    if (!node.onMove?.length) return false;
    return node.moveIf === undefined || this.runtime().engine.evaluateCondition(node.moveIf, this.runtime().context({ ...this.scope(), row }), { whenMissing: true, fallback: false });
  }

  protected dragStart(event: DragEvent, row: Row): void {
    if (!this.canMove(row)) {
      event.preventDefault();
      return;
    }
    this.dragged = row;
    event.dataTransfer?.setData('text/plain', this.text(row, this.node().titleField));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected dragOver(event: DragEvent, column: string): void {
    if (!this.dragged) return;
    event.preventDefault();
    this.over.set(column);
  }

  protected drop(event: DragEvent, column: string): void {
    event.preventDefault();
    this.over.set(null);
    const row = this.dragged;
    this.dragged = null;
    if (row) void this.move(row, column);
  }

  protected async move(row: Row, to: string): Promise<void> {
    const from = String(row[this.node().columnField] ?? '');
    if (from === to || this.busy() || !this.canMove(row)) return;
    this.busy.set(row);
    try {
      await runSteps(this.runtime(), this.node().onMove ?? [], { ...this.scope(), row, from, to });
    } finally {
      this.busy.set(null);
    }
  }
}
