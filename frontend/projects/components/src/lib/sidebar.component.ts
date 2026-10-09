import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal, untracked } from '@angular/core';
import type { NavigationRuntime, VisibleItem, VisibleLeaf } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { IconComponent, iconType } from './icon.component';
import { nextId } from './shared';

export interface NavigateEvent {
  useCase: string;
  leaf: VisibleLeaf;
}

/**
 * Barra laterale a più livelli, costruita sul menu di NG-ZORRO. Non conosce il router: le voci sono veri link
 * (`href`, apribili in una nuova scheda) e un clic normale emette `navigate`, che l'applicazione ospite traduce in navigazione.
 * I livelli sono al massimo tre (gruppo, gruppo, voce), come impone lo schema del menu.
 */
@Component({
  selector: 'lc-sidebar',
  imports: [FormsModule, IconComponent, NzButtonModule, NzMenuModule, NzSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; align-self: stretch; }
    .side { box-sizing: border-box; flex: none; width: var(--lc-sider-width, 256px); display: flex; flex-direction: column; overflow-x: hidden; overflow-y: auto;
      background: var(--lc-sider-bg, #fff); color: var(--lc-sider-text, #1b2430); border-right: 1px solid var(--lc-sider-border, #e3e8ef);
      transition: width 0.2s; }
    .side.collapsed { width: var(--lc-sider-collapsed-width, 80px); }
    .logo { display: flex; align-items: center; gap: 12px; height: var(--lc-header-height, 56px); padding: 0 24px; flex: none; font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; }
    .logo .mark { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex: none; border-radius: var(--lc-radius, 6px); background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff); font-size: 16px; }
    .collapsed .logo { padding: 0; justify-content: center; }
    .collapsed .logo .name { display: none; }
    .usecase { display: flex; flex-direction: column; gap: 4px; padding: 4px 16px 12px; }
    .usecase label { font-size: 12px; color: var(--lc-sider-muted, #5d6b7a); }
    nz-select { width: 100%; }
    :host ::ng-deep .usecase .ant-select-selector { background: transparent !important; border-color: var(--lc-sider-border, #d5dbe3) !important; color: var(--lc-sider-text) !important; }
    :host ::ng-deep .usecase .ant-select-arrow { color: var(--lc-sider-muted); }
    nav { flex: 1; }
    /* Colori del menu: tutti dal tema (--lc-sider-*), non dal tema chiaro o scuro della libreria. */
    :host ::ng-deep ul.ant-menu { background: transparent !important; color: var(--lc-sider-text); border-inline-end: 0; }
    :host ::ng-deep .ant-menu-sub.ant-menu-inline { background: transparent !important; }
    :host ::ng-deep .ant-menu-item, :host ::ng-deep .ant-menu-submenu-title { color: var(--lc-sider-text); }
    :host ::ng-deep .ant-menu-item:hover, :host ::ng-deep .ant-menu-submenu-title:hover, :host ::ng-deep .ant-menu-submenu-open > .ant-menu-submenu-title { color: var(--lc-sider-active-text) !important; }
    :host ::ng-deep .ant-menu-item-selected { background: var(--lc-sider-active-bg) !important; color: var(--lc-sider-active-text) !important; }
    :host ::ng-deep .ant-menu-item-selected::after { border-color: var(--lc-sider-active-text); }
    :host ::ng-deep .ant-menu-item a, :host ::ng-deep .ant-menu-item-selected a { color: inherit; }
    :host ::ng-deep .ant-menu-submenu-arrow { color: inherit; }
    /* Le voci lunghe vanno a capo invece di essere troncate. */
    :host ::ng-deep li.ant-menu-item, :host ::ng-deep .ant-menu-submenu-title { height: auto; min-height: 40px; line-height: 1.4; padding-block: 9px; white-space: normal; }
    :host ::ng-deep .ant-menu-title-content { white-space: normal; overflow: visible; text-overflow: clip; }
    a.leaf { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; }
    .collapsed .label { display: none; }
    .empty { margin: 0; padding: 0 16px; color: var(--lc-sider-muted); font-size: .9em; }
    .foot { flex: none; border-top: 1px solid var(--lc-sider-border, #e3e8ef); padding: 8px; text-align: center; }
    .foot button { color: var(--lc-sider-text); }
  `,
  template: `
    <aside class="side" [class.collapsed]="collapsed()">
      <div class="logo">
        <span class="mark" aria-hidden="true"><lc-icon name="package" /></span>
        <span class="name">{{ brand() }}</span>
      </div>
      @if (!collapsed() && useCases().length > 1) {
        <div class="usecase">
          <label [for]="selectId">Caso d'uso</label>
          <nz-select [nzId]="selectId" [ngModel]="current()?.id" (ngModelChange)="useCaseChange.emit($event)">
            @for (u of useCases(); track u.id) {
              <nz-option [nzValue]="u.id" [nzLabel]="u.label" />
            }
          </nz-select>
        </div>
      }

      @if (current(); as uc) {
        <nav [attr.aria-label]="'Menu ' + uc.label">
          <ul nz-menu nzMode="inline" [nzTheme]="tone()" [nzInlineCollapsed]="collapsed()" [nzInlineIndent]="18">
            @for (g1 of uc.items; track g1.id) {
              @if (g1.kind === 'group') {
                <li nz-submenu class="group" [nzTitle]="g1.label" [nzIcon]="type(g1.icon)" [nzOpen]="isExpanded(g1.id)" (nzOpenChange)="setOpen(g1.id, $event)">
                  <ul>
                    @for (g2 of g1.children; track g2.id) {
                      @if (g2.kind === 'group') {
                        <li nz-submenu class="group" [nzTitle]="g2.label" [nzIcon]="type(g2.icon)" [nzOpen]="isExpanded(g2.id)" (nzOpenChange)="setOpen(g2.id, $event)">
                          <ul>
                            @for (l3 of leaves(g2.children); track l3.id) {
                              <li nz-menu-item [nzSelected]="isActive(l3)">
                <a class="leaf" [href]="hrefFor()(uc.id, l3)" [attr.aria-current]="isActive(l3) ? 'page' : null" [attr.title]="collapsed() ? l3.label : null" [attr.aria-label]="collapsed() ? l3.label : null" (click)="go($event, l3)">
                  <lc-icon [name]="l3.icon" />
                  <span class="label">{{ l3.label }}</span>
                </a>
              </li>
                            }
                          </ul>
                        </li>
                      } @else {
                        @let l2 = g2;
                        <li nz-menu-item [nzSelected]="isActive(l2)">
                <a class="leaf" [href]="hrefFor()(uc.id, l2)" [attr.aria-current]="isActive(l2) ? 'page' : null" [attr.title]="collapsed() ? l2.label : null" [attr.aria-label]="collapsed() ? l2.label : null" (click)="go($event, l2)">
                  <lc-icon [name]="l2.icon" />
                  <span class="label">{{ l2.label }}</span>
                </a>
              </li>
                      }
                    }
                  </ul>
                </li>
              } @else {
                @let l1 = g1;
                <li nz-menu-item [nzSelected]="isActive(l1)">
                <a class="leaf" [href]="hrefFor()(uc.id, l1)" [attr.aria-current]="isActive(l1) ? 'page' : null" [attr.title]="collapsed() ? l1.label : null" [attr.aria-label]="collapsed() ? l1.label : null" (click)="go($event, l1)">
                  <lc-icon [name]="l1.icon" />
                  <span class="label">{{ l1.label }}</span>
                </a>
              </li>
              }
            }
          </ul>
        </nav>
      } @else if (!collapsed()) {
        <p class="empty">Nessuna funzione disponibile per il tuo profilo.</p>
      }
      @if (showToggle()) {
      <div class="foot">
        <button nz-button nzType="text" class="toggle" type="button" [attr.aria-label]="collapsed() ? 'Espandi il menu' : 'Comprimi il menu'" [attr.aria-expanded]="!collapsed()" (click)="collapsed.set(!collapsed())">
          <lc-icon name="menu" />
        </button>
      </div>
      }
    </aside>
  `,
})
export class SidebarComponent {
  readonly navigation = input.required<NavigationRuntime>();
  /** Nome mostrato accanto al logo. */
  readonly brand = input('LowCode');
  /** Caso d'uso mostrato; se manca o non è visibile si mostra il primo disponibile. */
  readonly useCaseId = input<string | null>(null);
  /** Schermata corrente, per evidenziare la voce attiva e aprire i suoi gruppi. */
  readonly active = input<{ screen: string; params: Record<string, unknown> } | null>(null);
  /** Costruisce l'indirizzo di una voce (per i link). */
  readonly hrefFor = input<(useCase: string, leaf: VisibleLeaf) => string>(() => '#');

  readonly navigate = output<NavigateEvent>();
  readonly useCaseChange = output<string>();

  protected readonly selectId = nextId('lc-usecase');
  /** Barra compressa a sole icone. Con `[(collapsed)]` il pulsante può stare altrove (per esempio nella barra superiore). */
  readonly collapsed = model(false);
  /** Mostra il pulsante di compressione in fondo alla barra. */
  readonly showToggle = input(true);
  /** Stile del menu della libreria: i colori veri vengono comunque dal tema. */
  readonly tone = input<'light' | 'dark'>('light');
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

  /** Al terzo livello ci sono solo voci: lo schema del menu non ammette altri gruppi. */
  protected leaves(items: VisibleItem[]): VisibleLeaf[] {
    return items.filter((i): i is VisibleLeaf => i.kind !== 'group');
  }

  protected type(icon: string | undefined): string | null {
    return iconType(icon);
  }

  protected setOpen(id: string, open: boolean): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (open) next.add(id);
      else next.delete(id);
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
