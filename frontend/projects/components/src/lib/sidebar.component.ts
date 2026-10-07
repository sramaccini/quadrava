import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import type { NavigationRuntime, VisibleItem, VisibleLeaf } from 'core';
import { IconComponent } from './icon.component';
import { nextId } from './shared';

export interface NavigateEvent {
  useCase: string;
  leaf: VisibleLeaf;
}

/**
 * Barra laterale a più livelli. Non conosce il router: le voci sono veri link (`href`, apribili in una nuova scheda)
 * e un clic normale emette `navigate`, che l'applicazione ospite traduce in navigazione.
 */
@Component({
  selector: 'lc-sidebar',
  imports: [NgTemplateOutlet, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; height: 100%; }
    .side { box-sizing: border-box; width: 270px; height: 100%; display: flex; flex-direction: column; gap: var(--lc-gap, 12px); padding: var(--lc-gap, 12px);
      background: var(--lc-color-surface, #fff); color: var(--lc-color-on-surface, #1b2430); border-right: 1px solid var(--lc-color-border, #d5dbe3); overflow-y: auto; }
    .side.collapsed { width: 60px; align-items: center; padding-inline: 6px; }
    .head { display: flex; align-items: flex-end; gap: var(--lc-gap, 12px); }
    .toggle { flex: none; width: var(--lc-control-height, 38px); height: var(--lc-control-height, 38px); display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--lc-color-border, #d5dbe3); border-radius: var(--lc-radius, 6px); background: transparent; color: inherit; cursor: pointer; }
    .usecase { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .usecase label { font-size: .8em; color: var(--lc-color-muted, #5d6b7a); }
    select { height: var(--lc-control-height, 38px); padding: 0 var(--lc-gap, 12px); border: 1px solid var(--lc-color-border, #d5dbe3); border-radius: var(--lc-radius, 6px);
      background: var(--lc-color-surface, #fff); color: inherit; font: inherit; width: 100%; }
    ul { list-style: none; margin: 0; padding: 0; }
    nav > ul { display: flex; flex-direction: column; gap: 2px; }
    .row { box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; min-height: var(--lc-control-height, 38px);
      padding: 0 var(--lc-gap, 12px); padding-left: calc(var(--lc-gap, 12px) * var(--level, 1)); border: 0; border-radius: var(--lc-radius, 6px);
      background: transparent; color: inherit; font: inherit; text-align: left; text-decoration: none; cursor: pointer; }
    .row:hover { background: color-mix(in srgb, var(--lc-color-primary, #1f5fbf) 10%, transparent); }
    .row:focus-visible, .toggle:focus-visible, select:focus-visible { outline: 2px solid var(--lc-color-primary, #1f5fbf); outline-offset: 2px; }
    .row .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row.group.on-path { font-weight: 600; }
    .row.leaf[aria-current='page'] { background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff); font-weight: 600; }
    .chev { transition: transform .15s; }
    .chev.open { transform: rotate(90deg); }
    .collapsed .row { justify-content: center; padding: 0; }
    .empty { color: var(--lc-color-muted, #5d6b7a); font-size: .9em; margin: 0; }
  `,
  template: `
    <aside class="side" [class.collapsed]="collapsed()">
      <div class="head">
        <button type="button" class="toggle" [attr.aria-label]="collapsed() ? 'Espandi il menu' : 'Comprimi il menu'" [attr.aria-expanded]="!collapsed()" (click)="collapsed.set(!collapsed())">
          <lc-icon name="menu" />
        </button>
        @if (!collapsed() && useCases().length > 1) {
          <div class="usecase">
            <label [for]="selectId">Caso d'uso</label>
            <select [id]="selectId" (change)="useCaseChange.emit($any($event.target).value)">
              @for (u of useCases(); track u.id) {
                <option [value]="u.id" [selected]="u.id === current()?.id">{{ u.label }}</option>
              }
            </select>
          </div>
        }
      </div>

      @if (current(); as uc) {
        <nav [attr.aria-label]="'Menu ' + uc.label">
          <ul>
            <ng-container *ngTemplateOutlet="branch; context: { items: uc.items, level: 1 }" />
          </ul>
        </nav>
      } @else if (!collapsed()) {
        <p class="empty">Nessuna funzione disponibile per il tuo profilo.</p>
      }
    </aside>

    <ng-template #branch let-items="items" let-level="level">
      @for (item of items; track item.id) {
        <li>
          @if (item.kind === 'group') {
            <button
              type="button"
              class="row group"
              [class.on-path]="path().includes(item.id)"
              [style.--level]="level"
              [attr.aria-expanded]="isExpanded(item.id)"
              [attr.title]="collapsed() ? item.label : null"
              [attr.aria-label]="collapsed() ? item.label : null"
              (click)="toggle(item.id)"
            >
              <lc-icon [name]="item.icon" />
              @if (!collapsed()) {
                <span class="label">{{ item.label }}</span>
                <lc-icon name="chevron" class="chev" [class.open]="isExpanded(item.id)" />
              }
            </button>
            @if (isExpanded(item.id) && !collapsed()) {
              <ul>
                <ng-container *ngTemplateOutlet="branch; context: { items: item.children, level: level + 1 }" />
              </ul>
            }
          } @else {
            <a
              class="row leaf"
              [style.--level]="level"
              [href]="hrefFor()(current()!.id, item)"
              [attr.aria-current]="isActive(item) ? 'page' : null"
              [attr.title]="collapsed() ? item.label : null"
              [attr.aria-label]="collapsed() ? item.label : null"
              (click)="go($event, item)"
            >
              <lc-icon [name]="item.icon" />
              @if (!collapsed()) {
                <span class="label">{{ item.label }}</span>
              }
            </a>
          }
        </li>
      }
    </ng-template>
  `,
})
export class SidebarComponent {
  readonly navigation = input.required<NavigationRuntime>();
  /** Caso d'uso mostrato; se manca o non è visibile si mostra il primo disponibile. */
  readonly useCaseId = input<string | null>(null);
  /** Schermata corrente, per evidenziare la voce attiva e aprire i suoi gruppi. */
  readonly active = input<{ screen: string; params: Record<string, unknown> } | null>(null);
  /** Costruisce l'indirizzo di una voce (per i link). */
  readonly hrefFor = input<(useCase: string, leaf: VisibleLeaf) => string>(() => '#');

  readonly navigate = output<NavigateEvent>();
  readonly useCaseChange = output<string>();

  protected readonly selectId = nextId('lc-usecase');
  protected readonly collapsed = signal(false);
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly useCases = computed(() => this.navigation().useCases());
  protected readonly current = computed(() => {
    const all = this.useCases();
    return all.find((u) => u.id === this.useCaseId()) ?? all[0] ?? null;
  });
  protected readonly path = computed(() => {
    const uc = this.current();
    const active = this.active();
    return uc && active ? (this.navigation().locate(uc.id, active.screen, active.params) ?? []) : [];
  });

  constructor() {
    // I gruppi che contengono la voce attiva si aprono da soli; l'utente poi li può chiudere.
    effect(() => {
      const ancestors = this.path().slice(0, -1);
      if (ancestors.length === 0) return;
      untracked(() => this.expanded.update((set) => new Set([...set, ...ancestors])));
    });
  }

  protected isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  protected toggle(id: string): void {
    // Da compatta, un clic su un gruppo riapre la barra e il gruppo.
    if (this.collapsed()) {
      this.collapsed.set(false);
      this.expanded.update((set) => new Set([...set, id]));
      return;
    }
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected isActive(leaf: VisibleLeaf): boolean {
    return this.path().at(-1) === leaf.id;
  }

  protected go(event: MouseEvent, leaf: VisibleLeaf): void {
    // Con i tasti modificatori o il clic centrale decide il browser (nuova scheda).
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const uc = this.current();
    if (uc) this.navigate.emit({ useCase: uc.id, leaf });
  }
}

export type { VisibleItem };
