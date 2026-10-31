import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { I18n, rowsOf, runSteps, type ScreenRuntime, type Scope } from 'core';
import { BusyComponent } from './busy.component';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzTagModule } from 'ng-zorro-antd/tag';
import type { KanbanNode, Tone } from 'schema';
import { TONE_COLORS } from './display.component';
import { IconComponent } from './icon.component';
import { cardKey, initials, kanbanBoard, placement, type KanbanLane } from './kanban-board';

type Row = Record<string, unknown>;

/**
 * Kanban: the rows of the data source in columns according to `columnField` (rows with a value that is not a column
 * are not shown) and, with `laneField`, in horizontal lanes that can be collapsed. With `onMove` a card moves by
 * dragging it to another column of its lane or, from the keyboard, with the «Move» menu; with `reorder` also between
 * the cards of its column («Move up», «Move down»). The steps see the row in `row`, the starting column in `from`, the
 * target one in `to` and the keys of the new neighbours in `beforeId` and `afterId` (usually a call and a refresh).
 * `moveIf` decides which cards can be moved (fail-closed). The real move is done by the service: the card changes
 * place when the reloaded data says so, and screen readers then hear where it is.
 */
@Component({
  selector: 'lc-kanban',
  imports: [BusyComponent, IconComponent, NgTemplateOutlet, NzAlertModule, NzButtonModule, NzDropdownModule, NzMenuModule, NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .board { display: flex; gap: var(--lc-gap, 12px); overflow-x: auto; padding-bottom: 4px; }
    .board.lanes { display: grid; grid-template-columns: repeat(var(--lc-kanban-columns), minmax(220px, 1fr)); }
    .column, .head { padding: 8px; border-radius: var(--lc-radius, 6px); background: color-mix(in srgb, var(--lc-color-muted, #5d6b7a) 8%, transparent); }
    .column { flex: 1 0 220px; display: flex; flex-direction: column; gap: 8px; border-top: 3px solid var(--lc-kanban-tone); }
    .head { border-top: 3px solid var(--lc-kanban-tone); }
    .lanes .column { border-top: 0; }
    .over-limit { background: color-mix(in srgb, var(--lc-color-danger, #c62828) 10%, transparent); }
    .column.over { outline: 2px dashed var(--lc-color-primary, #1f5fbf); outline-offset: -2px; }
    h3 { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; margin: 0; font-size: 14px; font-weight: 600; }
    h3 .name { flex: 1; }
    .count { color: var(--lc-color-muted, #5d6b7a); font-weight: 400; }
    .limit { display: inline-flex; gap: 4px; align-items: center; color: var(--lc-color-danger, #c62828); font-size: 12px; font-weight: 400; }
    .lane { grid-column: 1 / -1; margin-top: 4px; }
    .lane button { display: inline-flex; gap: 8px; align-items: center; padding: 2px 4px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; border-radius: var(--lc-radius, 6px); }
    .lane button:focus-visible { outline: 2px solid var(--lc-color-primary, #1f5fbf); }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-height: 40px; }
    .card { display: flex; gap: 4px; align-items: flex-start; padding: 8px; border-radius: var(--lc-radius, 6px); background: var(--lc-color-surface, #fff);
      border: 1px solid var(--lc-color-border, #d0d7de); }
    .card[draggable='true'] { cursor: grab; }
    .card.busy { opacity: 0.6; }
    .card.drop-before { box-shadow: 0 -3px 0 var(--lc-color-primary, #1f5fbf); }
    ul.drop-end::after { content: ''; height: 3px; border-radius: 2px; background: var(--lc-color-primary, #1f5fbf); }
    .text { flex: 1; min-width: 0; }
    .title { display: block; font-weight: 600; overflow-wrap: anywhere; }
    .description { display: block; margin-top: 2px; font-size: 12px; color: var(--lc-color-muted, #5d6b7a); overflow-wrap: anywhere; }
    .badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .badges nz-tag { margin: 0; }
    .footer { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; font-size: 12px; color: var(--lc-color-muted, #5d6b7a); }
    .avatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%;
      background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff); font-size: 11px; font-weight: 600; }
    .empty { color: var(--lc-color-muted, #5d6b7a); font-size: 12px; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (source().status === 'error') {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
    } @else {
      <lc-busy [busy]="source().status === 'loading'">
      @let b = board();
      @if (node().laneField) {
        <div class="board lanes" [style.--lc-kanban-columns]="b.columns.length">
          @for (column of b.columns; track column.value) {
            <div class="head" [class.over-limit]="column.overLimit" [style.--lc-kanban-tone]="color(column.tone)">
              <ng-container *ngTemplateOutlet="heading; context: { $implicit: column }" />
            </div>
          }
          @for (lane of b.lanes; track lane.value) {
            @let open = !collapsed().has(lane.value ?? '');
            <h3 class="lane">
              <button type="button" [attr.aria-expanded]="open" (click)="toggle(lane)">
                <lc-icon [name]="open ? 'down' : 'right'" />{{ lane.label }}&ngsp;<span class="count">{{ lane.count }}</span>
              </button>
            </h3>
            @if (open) {
              @for (column of b.columns; track column.value; let c = $index) {
                <section
                  class="column"
                  [class.over]="isOver(lane, column.value)"
                  [attr.aria-label]="lane.label + ' — ' + column.label"
                  (dragover)="dragOver($event, lane, column.value)"
                  (dragleave)="leave($event)"
                  (drop)="drop($event)"
                >
                  <ng-container *ngTemplateOutlet="cards; context: { $implicit: lane.cells[c], column: column.value, lane }" />
                </section>
              }
            }
          }
        </div>
      } @else {
        <div class="board">
          @for (column of b.columns; track column.value; let c = $index) {
            <section
              class="column"
              [class.over]="isOver(b.lanes[0], column.value)"
              [class.over-limit]="column.overLimit"
              [style.--lc-kanban-tone]="color(column.tone)"
              [attr.aria-label]="column.label"
              (dragover)="dragOver($event, b.lanes[0], column.value)"
              (dragleave)="leave($event)"
              (drop)="drop($event)"
            >
              <ng-container *ngTemplateOutlet="heading; context: { $implicit: column }" />
              <ng-container *ngTemplateOutlet="cards; context: { $implicit: b.lanes[0].cells[c], column: column.value, lane: b.lanes[0] }" />
            </section>
          }
        </div>
      }
      </lc-busy>
      <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
    }

    <ng-template #heading let-column>
      <h3>
        <span class="name">{{ column.label }}</span>&ngsp;<span class="count">{{ column.limit === null ? column.count : column.count + '/' + column.limit }}</span>
        @if (column.overLimit) {
          &ngsp;<span class="limit"><lc-icon name="warning" />{{ i18n.t('lc.kanbanOverLimit') }}</span>
        }
      </h3>
    </ng-template>

    <ng-template #cards let-rows let-column="column" let-lane="lane">
      <ul [class.drop-end]="dropGap()?.lane === lane && dropGap()?.column === column && dropGap()?.gap === rows.length && rows.length > 0">
        @for (row of rows; track key(row); let i = $index, first = $first, last = $last) {
          @let movable = canMove(row);
          @let title = text(row, node().titleField);
          <li
            class="card"
            [class.busy]="busy() === row"
            [class.drop-before]="dropGap()?.lane === lane && dropGap()?.column === column && dropGap()?.gap === i"
            [attr.draggable]="movable"
            [attr.data-index]="i"
            (dragstart)="dragStart($event, row)"
            (dragend)="dragEnd()"
          >
            <span class="text">
              <span class="title">{{ title }}</span>
              @if (node().descriptionField) {
                &ngsp;<span class="description">{{ text(row, node().descriptionField!) }}</span>
              }
              @if (node().badges?.length) {
                <span class="badges">
                  @for (badge of node().badges; track $index) {
                    @let value = text(row, badge.field);
                    @if (value) {
                      <nz-tag [nzColor]="color(badge.tones?.[value] ?? 'neutral')">{{ value }}</nz-tag>
                    }
                  }
                </span>
              }
              @if (node().footerFields?.length) {
                <span class="footer">
                  @for (field of node().footerFields; track $index) {
                    @let value = text(row, field.field);
                    @if (value) {
                      <span>{{ field.label ? runtime().text(field.label, cardScope(row)) + ': ' : '' }}{{ value }}</span>
                    }
                  }
                </span>
              }
            </span>
            @if (node().avatarField && text(row, node().avatarField!)) {
              @let person = text(row, node().avatarField!);
              <span class="avatar" role="img" [attr.aria-label]="person" [attr.title]="person">{{ initials(person) }}</span>
            }
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
                [attr.aria-label]="i18n.t('lc.moveTo', { title })"
              >
                <lc-icon name="move" />
              </button>
              <nz-dropdown-menu #menu="nzDropdownMenu">
                <ul nz-menu>
                  @if (node().reorder) {
                    <li nz-menu-item [nzDisabled]="first" (click)="!first && move(row, column, i - 1)">{{ i18n.t('lc.kanbanMoveUp') }}</li>
                    <li nz-menu-item [nzDisabled]="last" (click)="!last && move(row, column, i + 2)">{{ i18n.t('lc.kanbanMoveDown') }}</li>
                    <li nz-menu-divider></li>
                  }
                  @for (target of board().columns; track target.value) {
                    @if (target.value !== column) {
                      <li nz-menu-item (click)="move(row, target.value, null)">{{ target.label }}</li>
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
    </ng-template>
  `,
})
export class KanbanComponent {
  readonly node = input.required<KanbanNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);
  /** Where a dragged card would land: lane, column and position between the cards. */
  protected readonly dropGap = signal<{ lane: KanbanLane; column: string; gap: number } | null>(null);
  /** Card whose move is in progress. */
  protected readonly busy = signal<Row | null>(null);
  /** Lanes closed by the user (by value). */
  protected readonly collapsed = signal<ReadonlySet<string>>(new Set());
  /** Where the last moved card is now, for screen readers. */
  protected readonly announcement = signal('');
  protected readonly initials = initials;
  private dragged: Row | null = null;

  protected readonly source = computed(() => this.runtime().source(this.node().source));

  protected readonly board = computed(() =>
    kanbanBoard(rowsOf(this.source().data), this.node(), (text) => this.runtime().text(text, this.scope()), this.i18n.t('lc.kanbanNoLane')),
  );

  protected text(row: Row, field: string): string {
    const value = row[field];
    return value === null || value === undefined ? '' : String(value);
  }

  protected key(row: Row): unknown {
    return cardKey(row, this.node()) ?? row;
  }

  protected color(tone: Tone): string {
    return TONE_COLORS[tone];
  }

  protected cardScope(row: Row): Scope {
    return { ...this.scope(), row };
  }

  protected isOver(lane: KanbanLane, column: string): boolean {
    const drop = this.dropGap();
    return drop !== null && drop.lane === lane && drop.column === column;
  }

  protected toggle(lane: KanbanLane): void {
    const key = lane.value ?? '';
    this.collapsed.update((all) => {
      const next = new Set(all);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  /** Movable if there are steps to do it and `moveIf` (if present) says yes for the row; an error counts as no. */
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

  protected dragEnd(): void {
    this.dragged = null;
    this.dropGap.set(null);
  }

  /** A card can be dropped in the cells of its own lane; with `reorder`, between the cards too (otherwise at the end). */
  protected dragOver(event: DragEvent, lane: KanbanLane, column: string): void {
    const row = this.dragged;
    if (!row || this.laneOf(row) !== lane) return;
    const node = this.node();
    const from = this.text(row, node.columnField);
    if (from === column && !node.reorder) return;
    event.preventDefault();
    const cards = lane.cells[node.columns.findIndex((c) => c.value === column)] ?? [];
    let gap = cards.length;
    if (node.reorder) {
      const card = (event.target as Element | null)?.closest?.('li.card') as HTMLElement | null;
      const index = card ? Number(card.dataset['index']) : NaN;
      if (Number.isInteger(index)) {
        const box = card!.getBoundingClientRect();
        gap = event.clientY > box.top + box.height / 2 ? index + 1 : index;
      }
    }
    const current = this.dropGap();
    if (!current || current.lane !== lane || current.column !== column || current.gap !== gap) this.dropGap.set({ lane, column, gap });
  }

  protected leave(event: DragEvent): void {
    // Leaving for a card inside the same column is not leaving the column.
    const into = event.relatedTarget as Node | null;
    if (into && (event.currentTarget as Element).contains(into)) return;
    this.dropGap.set(null);
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    const target = this.dropGap();
    const row = this.dragged;
    this.dragEnd();
    if (row && target) void this.move(row, target.column, target.gap);
  }

  /** Moves a card to a column of its lane, at a position between the cards (null: at the end). */
  protected async move(row: Row, to: string, gap: number | null): Promise<void> {
    const node = this.node();
    const from = this.text(row, node.columnField);
    if (this.busy() || !this.canMove(row) || (from === to && !node.reorder)) return;
    const lane = this.laneOf(row);
    const cards = lane?.cells[node.columns.findIndex((c) => c.value === to)];
    if (!cards) return;
    const place = placement(cards, row, gap ?? cards.length, node);
    if (!place) return;
    const key = cardKey(row, node);
    const title = this.text(row, node.titleField);
    this.busy.set(row);
    this.announcement.set('');
    try {
      await runSteps(this.runtime(), node.onMove ?? [], { ...this.scope(), row, from, to, ...place });
    } finally {
      this.busy.set(null);
    }
    this.announce(key, title);
  }

  /** The lane of a card in the current board. */
  private laneOf(row: Row): KanbanLane | undefined {
    return this.board().lanes.find((lane) => lane.cells.some((cell) => cell.includes(row)));
  }

  /** Tells screen readers where the card is after the move (with the reloaded data, when onMove refreshes it). */
  private announce(key: unknown, title: string): void {
    if (key === null) return;
    const { columns, lanes } = this.board();
    for (const lane of lanes) {
      for (const [c, cell] of lane.cells.entries()) {
        const position = cell.findIndex((r) => cardKey(r, this.node()) === key);
        if (position >= 0) {
          this.announcement.set(this.i18n.t('lc.kanbanPlace', { title, column: columns[c].label, position: position + 1, count: cell.length }));
          return;
        }
      }
    }
  }
}
