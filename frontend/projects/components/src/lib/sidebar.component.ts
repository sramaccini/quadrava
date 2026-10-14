import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { afterEveryRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, model, output, signal, untracked } from '@angular/core';
import { I18n, type NavigationRuntime, type VisibleItem, type VisibleLeaf } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
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
  imports: [FormsModule, NgTemplateOutlet, IconComponent, NzButtonModule, NzDropdownModule, NzInputModule, NzMenuModule, NzSelectModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; position: sticky; top: 0; z-index: 2; align-self: flex-start; height: 100vh; flex: none; }
    .side { box-sizing: border-box; height: 100%; width: var(--lc-sider-width, 256px); display: flex; flex-direction: column; overflow-x: hidden; overflow-y: auto;
      background: var(--lc-sider-bg, #fff); color: var(--lc-sider-text, #1b2430); border-right: 1px solid var(--lc-sider-border, #e3e8ef);
      transition: width 0.2s; }
    .side.collapsed { width: var(--lc-sider-collapsed-width, 80px); }
    .logo { display: flex; align-items: center; gap: 12px; height: var(--lc-header-height, 56px); padding: 0 24px; flex: none; font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; }
    .logo img { width: 32px; height: 32px; flex: none; }
    .logo .mark { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex: none; border-radius: var(--lc-radius, 6px); background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff); font-size: 16px; }
    .collapsed .logo { padding: 0; justify-content: center; }
    .collapsed .logo .name { display: none; }
    .usecase { display: flex; align-items: center; gap: 8px; padding: 4px 16px 12px; }
    .usecase-mark { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; font-size: 16px; color: var(--lc-sider-muted, #5d6b7a); cursor: default; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    nz-select { flex: 1; min-width: 0; }
    .usecase-icon { display: flex; justify-content: center; padding: 4px 0 12px; }
    .usecase-trigger { color: var(--lc-sider-text); border: 1px solid var(--lc-sider-border); font-size: 16px; }
    .uc-row { display: flex; align-items: center; gap: 8px; }
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
    .search { padding: 0 16px 8px; }
    .search input { background: transparent; color: var(--lc-sider-text); border-color: var(--lc-sider-border, #d5dbe3); }
    .results { list-style: none; margin: 0; padding: 0 8px; display: flex; flex-direction: column; gap: 2px; }
    .results a { display: flex; flex-direction: column; padding: 6px 10px; border-radius: var(--lc-radius, 6px); color: var(--lc-sider-text); text-decoration: none; }
    .results a:hover, .results a:focus-visible { background: var(--lc-sider-active-bg); color: var(--lc-sider-active-text); outline: none; }
    .results .where { font-size: 12px; color: var(--lc-sider-muted); }
    /* Contatore accanto alla voce; a barra compressa diventa un pallino sull'icona. */
    .badge { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; font-size: 12px; line-height: 20px; text-align: center;
      background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff); }
    a.leaf { position: relative; }
    .collapsed .badge { position: absolute; top: 2px; left: 14px; min-width: 8px; width: 8px; height: 8px; padding: 0; font-size: 0; }
    /* Somma dei contatori sul titolo di un gruppo chiuso (aperto, i numeri sono sulle voci); a barra compressa un pallino. */
    :host ::ng-deep .ant-menu-submenu-title[data-lc-badge]::after {
      content: attr(data-lc-badge); position: absolute; right: 40px; top: 50%; transform: translateY(-50%);
      min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; font-size: 12px; line-height: 20px; text-align: center;
      background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff);
    }
    :host ::ng-deep .collapsed .ant-menu-submenu-title[data-lc-badge]::after {
      right: auto; left: 44px; top: 10px; transform: none; min-width: 8px; width: 8px; height: 8px; padding: 0; font-size: 0;
    }
    :host ::ng-deep .ant-menu-submenu-title:focus-visible, a.leaf:focus-visible { outline: 2px solid var(--lc-sider-active-text, #1f5fbf); outline-offset: -2px; }
    /* Pulsante tondo sul bordo della barra, all'altezza del logo, come in Ant Design Pro. Sta fuori dall'area che scorre.
       Sporge di 13px nella barra superiore: chi ospita la barra lascia quel margine prima del titolo. */
    .toggle { position: absolute; z-index: 3; top: calc(var(--lc-header-height, 56px) / 2 - 13px); right: -13px; width: 26px; height: 26px; min-width: 26px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center; font-size: 12px; color: var(--lc-color-on-surface, #1b2430); background: var(--lc-color-surface, #fff);
      border: 1px solid var(--lc-sider-border, #d5dbe3); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); }
  `,
  template: `
    <aside class="side" [class.collapsed]="collapsed()">
      <div class="logo">
        <!-- Un marchio proprio dell'applicazione (elemento con l'attributo lcBrand) sostituisce logo e nome. -->
        <ng-content select="[lcBrand]">
          @if (logo(); as src) {
            <img [src]="src" alt="" />
          } @else {
            <span class="mark" aria-hidden="true"><lc-icon name="package" /></span>
          }
          <span class="name">{{ brand() }}</span>
        </ng-content>
      </div>
      @if (useCases().length > 1) {
        @if (!collapsed()) {
          <!-- La stessa icona a griglia della barra compressa; l'etichetta «Caso d'uso» diventa il suo tooltip (e resta per gli screen reader). -->
          <div class="usecase">
            <span class="usecase-mark" aria-hidden="true" nz-tooltip [nzTooltipTitle]="i18n.t('lc.useCase')" nzTooltipPlacement="right"><lc-icon name="sections" /></span>
            <label class="visually-hidden" [for]="selectId">{{ i18n.t('lc.useCase') }}</label>
            <nz-select [nzId]="selectId" [ngModel]="current()?.id" (ngModelChange)="useCaseChange.emit($event)">
              @for (u of useCases(); track u.id) {
                <nz-option [nzValue]="u.id" [nzLabel]="u.label" />
              }
            </nz-select>
          </div>
        } @else {
          <!-- Da compressa il selettore diventa un'icona (sempre la stessa, a griglia: rappresenta le sezioni) con un menu a tendina. -->
          <div class="usecase-icon">
            <button nz-button nzType="text" class="usecase-trigger" type="button" nz-dropdown nzTrigger="click" nzPlacement="bottomLeft" [nzDropdownMenu]="useCaseMenu"
              [attr.aria-label]="i18n.t('lc.useCase') + ': ' + (current()?.label ?? '')" aria-haspopup="menu"
              nz-tooltip [nzTooltipTitle]="i18n.t('lc.useCase') + ': ' + (current()?.label ?? '')" nzTooltipPlacement="right">
              <lc-icon name="sections" />
            </button>
            <nz-dropdown-menu #useCaseMenu="nzDropdownMenu">
              <ul nz-menu nzSelectable>
                @for (u of useCases(); track u.id) {
                  <li nz-menu-item [nzSelected]="u.id === current()?.id" (click)="useCaseChange.emit(u.id)">
                    <span class="uc-row"><lc-icon [name]="u.icon ?? 'list'" />{{ u.label }}</span>
                  </li>
                }
              </ul>
            </nz-dropdown-menu>
          </div>
        }
      }

      <ng-template #leafContent let-leaf>
        <lc-icon [name]="leaf.icon" />
        <span class="label">{{ leaf.label }}</span>
        @if (badges()[leaf.id]; as n) {
          <span class="badge" aria-hidden="true">{{ n > 99 ? '99+' : n }}</span>
          <span class="visually-hidden">, {{ i18n.t('lc.badge', { n }) }}</span>
        }
      </ng-template>
      @if (current() && !collapsed()) {
        <div class="search" role="search">
          <input
            nz-input
            nzSize="small"
            type="search"
            [id]="searchId"
            [placeholder]="i18n.t('lc.menuSearch')"
            [attr.aria-label]="i18n.t('lc.menuSearch')"
            [attr.aria-controls]="query() ? searchId + '-results' : null"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            (keydown)="searchKey($event)"
          />
        </div>
      }
      @if (current(); as uc) {
        @if (query().trim() && !collapsed()) {
          <ul class="results" [id]="searchId + '-results'" [attr.aria-label]="i18n.t('lc.menuResults')">
            @for (r of results(); track r.leaf.id) {
              <li>
                <a [href]="hrefFor()(uc.id, r.leaf)" (click)="go($event, r.leaf); query.set('')" (keydown)="resultKey($event)">
                  <span>{{ r.leaf.label }}</span>
                  @if (r.where) {
                    &ngsp;<span class="where">{{ r.where }}</span>
                  }
                </a>
              </li>
            } @empty {
              <li class="empty" role="status">{{ i18n.t('lc.menuNoResults') }}</li>
            }
          </ul>
        } @else {
        <nav [attr.aria-label]="i18n.t('lc.menu') + ' ' + uc.label" (keydown)="navKey($event)">
          <!-- La voce evidenziata la decide solo la schermata aperta (nzSelected): NG-ZORRO non la cambia da sé al clic. -->
          <ul nz-menu nzMode="inline" [nzTheme]="tone()" [nzInlineCollapsed]="collapsed()" [nzInlineIndent]="18" [nzSelectable]="false">
            @for (g1 of uc.items; track g1.id) {
              @if (g1.kind === 'group') {
                <li nz-submenu class="group" [attr.data-group]="g1.id" [nzTitle]="g1.label" [nzIcon]="type(g1.icon)" [nzOpen]="isExpanded(g1.id)" (nzOpenChange)="setOpen(g1.id, $event)">
                  <ul>
                    @for (g2 of g1.children; track g2.id) {
                      @if (g2.kind === 'group') {
                        <li nz-submenu class="group" [attr.data-group]="g2.id" [nzTitle]="g2.label" [nzIcon]="type(g2.icon)" [nzOpen]="isExpanded(g2.id)" (nzOpenChange)="setOpen(g2.id, $event)">
                          <ul>
                            @for (l3 of leaves(g2.children); track l3.id) {
                              <li nz-menu-item [nzSelected]="isActive(l3)" (click)="go($event, l3)">
                <a class="leaf" [href]="hrefFor()(uc.id, l3)" [attr.aria-current]="isActive(l3) ? 'page' : null" [attr.title]="collapsed() ? l3.label : null" [attr.aria-label]="collapsed() ? leafLabel(l3) : null">
                  <ng-container [ngTemplateOutlet]="leafContent" [ngTemplateOutletContext]="{ $implicit: l3 }" />
                </a>
              </li>
                            }
                          </ul>
                        </li>
                      } @else {
                        @let l2 = g2;
                        <li nz-menu-item [nzSelected]="isActive(l2)" (click)="go($event, l2)">
                <a class="leaf" [href]="hrefFor()(uc.id, l2)" [attr.aria-current]="isActive(l2) ? 'page' : null" [attr.title]="collapsed() ? l2.label : null" [attr.aria-label]="collapsed() ? leafLabel(l2) : null">
                  <ng-container [ngTemplateOutlet]="leafContent" [ngTemplateOutletContext]="{ $implicit: l2 }" />
                </a>
              </li>
                      }
                    }
                  </ul>
                </li>
              } @else {
                @let l1 = g1;
                <li nz-menu-item [nzSelected]="isActive(l1)" (click)="go($event, l1)">
                <a class="leaf" [href]="hrefFor()(uc.id, l1)" [attr.aria-current]="isActive(l1) ? 'page' : null" [attr.title]="collapsed() ? l1.label : null" [attr.aria-label]="collapsed() ? leafLabel(l1) : null">
                  <ng-container [ngTemplateOutlet]="leafContent" [ngTemplateOutletContext]="{ $implicit: l1 }" />
                </a>
              </li>
              }
            }
          </ul>
        </nav>
        }
      } @else if (!collapsed()) {
        <p class="empty">{{ i18n.t('lc.noFunctions') }}</p>
      }
    </aside>
    @if (showToggle()) {
      <button nz-button nzShape="circle" class="toggle" type="button" [attr.aria-label]="collapsed() ? i18n.t('lc.expandMenu') : i18n.t('lc.collapseMenu')" [attr.aria-expanded]="!collapsed()" (click)="collapsed.set(!collapsed())">
        <lc-icon [name]="collapsed() ? 'right' : 'left'" />
      </button>
    }
  `,
})
export class SidebarComponent {
  protected readonly i18n = inject(I18n);
  readonly navigation = input.required<NavigationRuntime>();
  /** Nome mostrato accanto al logo. */
  readonly brand = input('KinetiX');
  /** Indirizzo (relativo) dell'immagine del logo; se manca si mostra un'icona. */
  readonly logo = input<string | null>(null);
  /** Caso d'uso mostrato; se manca o non è visibile si mostra il primo disponibile. */
  readonly useCaseId = input<string | null>(null);
  /** Schermata corrente, per evidenziare la voce attiva e aprire i suoi gruppi. */
  readonly active = input<{ screen: string; params: Record<string, unknown> } | null>(null);
  /** Costruisce l'indirizzo di una voce (per i link). */
  readonly hrefFor = input<(useCase: string, leaf: VisibleLeaf) => string>(() => '#');
  /** Contatori delle voci (id della voce → numero), mostrati accanto al testo. */
  readonly badges = input<Record<string, number>>({});

  readonly navigate = output<NavigateEvent>();
  readonly useCaseChange = output<string>();

  protected readonly selectId = nextId('lc-usecase');
  protected readonly searchId = nextId('lc-menu-search');
  /** Testo cercato nel menu. */
  protected readonly query = signal('');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
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

  /** Per ogni gruppo del caso d'uso corrente: il nome e la somma dei contatori delle sue voci (anche nei sottogruppi). */
  private readonly groupBadges = computed(() => {
    const badges = this.badges();
    const out: Record<string, { label: string; count: number }> = {};
    const sum = (items: VisibleItem[]): number =>
      items.reduce((total, item) => {
        if (item.kind !== 'group') return total + (badges[item.id] ?? 0);
        const count = sum(item.children);
        out[item.id] = { label: item.label, count };
        return total + count;
      }, 0);
    sum(this.current()?.items ?? []);
    return out;
  });

  /** Voci del caso d'uso corrente che contengono il testo cercato (senza badare a maiuscole e accenti), con il loro percorso. */
  protected readonly results = computed(() => {
    const q = plainText(this.query());
    const uc = this.current();
    if (!q || !uc) return [];
    const found: { leaf: VisibleLeaf; where: string }[] = [];
    const walk = (items: VisibleItem[], trail: string[]) => {
      for (const item of items) {
        if (item.kind === 'group') walk(item.children, [...trail, item.label]);
        else if (plainText(item.label).includes(q) || trail.some((t) => plainText(t).includes(q))) found.push({ leaf: item, where: trail.join(' › ') });
      }
    };
    walk(uc.items, []);
    return found.slice(0, 20);
  });

  constructor() {
    // I titoli dei gruppi di NG-ZORRO non si raggiungono da tastiera e non dicono se sono aperti: lo si aggiunge qui.
    afterEveryRender(() => {
      const groups = this.groupBadges();
      for (const title of this.host.nativeElement.querySelectorAll<HTMLElement>('.ant-menu-submenu-title')) {
        const open = title.parentElement?.classList.contains('ant-menu-submenu-open') ?? false;
        if (title.getAttribute('tabindex') !== '0') title.setAttribute('tabindex', '0');
        if (title.getAttribute('role') !== 'button') title.setAttribute('role', 'button');
        if (title.getAttribute('aria-expanded') !== String(open)) title.setAttribute('aria-expanded', String(open));
        // Contatore del gruppo: chiuso, o a barra compressa (le voci stanno in un menu a parte).
        const group = groups[title.parentElement?.getAttribute('data-group') ?? ''];
        const show = !!group && group.count > 0 && (!open || this.collapsed());
        const text = show ? (group.count > 99 ? '99+' : String(group.count)) : null;
        if (title.getAttribute('data-lc-badge') !== text) {
          if (text) title.setAttribute('data-lc-badge', text);
          else title.removeAttribute('data-lc-badge');
        }
        const label = show ? `${group.label}, ${this.i18n.t('lc.badge', { n: group.count })}` : null;
        if (title.getAttribute('aria-label') !== label) {
          if (label) title.setAttribute('aria-label', label);
          else title.removeAttribute('aria-label');
        }
      }
    });
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

  /** Testo di una voce per chi usa un lettore di schermo, con il contatore se c'è. */
  protected leafLabel(leaf: VisibleLeaf): string {
    const n = this.badges()[leaf.id];
    return n ? `${leaf.label}, ${this.i18n.t('lc.badge', { n })}` : leaf.label;
  }

  /** Nella ricerca: Freccia giù porta ai risultati, Invio apre il primo, Esc pulisce. */
  protected searchKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.query.set('');
    } else if (event.key === 'ArrowDown') {
      this.host.nativeElement.querySelector<HTMLElement>('.results a')?.focus();
    } else if (event.key === 'Enter') {
      const first = this.results()[0];
      const uc = this.current();
      if (first && uc) {
        this.navigate.emit({ useCase: uc.id, leaf: first.leaf });
        this.query.set('');
      }
    } else {
      return;
    }
    event.preventDefault();
  }

  /** Tra i risultati: frecce su e giù (dal primo, su torna alla ricerca). */
  protected resultKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const links = [...this.host.nativeElement.querySelectorAll<HTMLElement>('.results a')];
    const i = links.indexOf(event.target as HTMLElement);
    const next = event.key === 'ArrowDown' ? links[i + 1] : i === 0 ? this.host.nativeElement.querySelector<HTMLElement>('.search input') : links[i - 1];
    next?.focus();
  }

  /**
   * Menu da tastiera: frecce su e giù tra voci e gruppi visibili, Home e Fine agli estremi, destra apre un gruppo
   * (o entra nella prima voce se è già aperto), sinistra lo chiude (o torna al gruppo che contiene la voce), Invio e
   * Spazio aprono o chiudono un gruppo.
   */
  protected navKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const items = [...this.host.nativeElement.querySelectorAll<HTMLElement>('nav a.leaf, nav .ant-menu-submenu-title')].filter((el) => !el.closest('.ant-menu-submenu-hidden'));
    const i = items.indexOf(target);
    if (i < 0) return;
    const isGroup = target.classList.contains('ant-menu-submenu-title');
    const open = isGroup && target.getAttribute('aria-expanded') === 'true';
    const focus = (el: HTMLElement | undefined) => el?.focus();
    switch (event.key) {
      case 'ArrowDown':
        focus(items[i + 1]);
        break;
      case 'ArrowUp':
        focus(items[i - 1]);
        break;
      case 'Home':
        focus(items[0]);
        break;
      case 'End':
        focus(items.at(-1));
        break;
      case 'ArrowRight':
        if (isGroup && !open) target.click();
        else if (isGroup) focus(items[i + 1]);
        break;
      case 'ArrowLeft':
        if (isGroup && open) target.click();
        else focus(target.closest('li.ant-menu-submenu')?.querySelector<HTMLElement>(':scope > .ant-menu-submenu-title') ?? undefined);
        break;
      case 'Enter':
      case ' ':
        if (!isGroup) return;
        target.click();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /**
   * Clic su tutta la riga della voce (non solo sul testo del link): apre la schermata. Prima un clic sul bordo della riga
   * evidenziava la voce senza aprirla. Il clic sul link arriva qui risalendo dalla riga.
   */
  protected go(event: MouseEvent, leaf: VisibleLeaf): void {
    // Con i tasti modificatori o il clic centrale decide il browser (nuova scheda).
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const uc = this.current();
    if (uc) this.navigate.emit({ useCase: uc.id, leaf });
  }
}

export type { VisibleItem };

/** Testo senza maiuscole né accenti, per cercare. */
function plainText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
