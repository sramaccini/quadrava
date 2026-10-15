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
  area: string;
  leaf: VisibleLeaf;
}

/**
 * Multi-level side bar, built on the NG-ZORRO menu. It knows nothing of the router: items are real links
 * (`href`, can be opened in a new tab) and a normal click emits `navigate`, which the host application turns into navigation.
 * There are at most three levels (group, group, item), as the menu schema requires.
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
    .area { display: flex; align-items: center; gap: 8px; padding: 4px 16px 12px; }
    .area-mark { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; font-size: 16px; color: var(--lc-sider-muted, #5d6b7a); cursor: default; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    nz-select { flex: 1; min-width: 0; }
    .area-icon { display: flex; justify-content: center; padding: 4px 0 12px; }
    .area-trigger { color: var(--lc-sider-text); border: 1px solid var(--lc-sider-border); font-size: 16px; }
    .uc-row { display: flex; align-items: center; gap: 8px; }
    :host ::ng-deep .area .ant-select-selector { background: transparent !important; border-color: var(--lc-sider-border, #d5dbe3) !important; color: var(--lc-sider-text) !important; }
    :host ::ng-deep .area .ant-select-arrow { color: var(--lc-sider-muted); }
    nav { flex: 1; }
    /* Menu colours: all from the theme (--lc-sider-*), not from the library's light or dark theme. */
    :host ::ng-deep ul.ant-menu { background: transparent !important; color: var(--lc-sider-text); border-inline-end: 0; }
    :host ::ng-deep .ant-menu-sub.ant-menu-inline { background: transparent !important; }
    :host ::ng-deep .ant-menu-item, :host ::ng-deep .ant-menu-submenu-title { color: var(--lc-sider-text); }
    :host ::ng-deep .ant-menu-item:hover, :host ::ng-deep .ant-menu-submenu-title:hover, :host ::ng-deep .ant-menu-submenu-open > .ant-menu-submenu-title { color: var(--lc-sider-active-text) !important; }
    :host ::ng-deep .ant-menu-item-selected { background: var(--lc-sider-active-bg) !important; color: var(--lc-sider-active-text) !important; }
    :host ::ng-deep .ant-menu-item-selected::after { border-color: var(--lc-sider-active-text); }
    :host ::ng-deep .ant-menu-item a, :host ::ng-deep .ant-menu-item-selected a { color: inherit; }
    :host ::ng-deep .ant-menu-submenu-arrow { color: inherit; }
    /* Long items wrap instead of being truncated. */
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
    /* Counter next to the item; with the bar collapsed it becomes a dot on the icon. */
    .badge { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; font-size: 12px; line-height: 20px; text-align: center;
      background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff); }
    a.leaf { position: relative; }
    .collapsed .badge { position: absolute; top: 2px; left: 14px; min-width: 8px; width: 8px; height: 8px; padding: 0; font-size: 0; }
    /* Sum of the counters on the title of a closed group (open, the numbers are on the items); with the bar collapsed a dot. */
    :host ::ng-deep .ant-menu-submenu-title[data-lc-badge]::after {
      content: attr(data-lc-badge); position: absolute; right: 40px; top: 50%; transform: translateY(-50%);
      min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; font-size: 12px; line-height: 20px; text-align: center;
      background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff);
    }
    :host ::ng-deep .collapsed .ant-menu-submenu-title[data-lc-badge]::after {
      right: auto; left: 44px; top: 10px; transform: none; min-width: 8px; width: 8px; height: 8px; padding: 0; font-size: 0;
    }
    :host ::ng-deep .ant-menu-submenu-title:focus-visible, a.leaf:focus-visible { outline: 2px solid var(--lc-sider-active-text, #1f5fbf); outline-offset: -2px; }
    /* Round button on the edge of the bar, at the height of the logo, as in Ant Design Pro. It is outside the scrolling area.
       It sticks out 13px into the top bar: whoever hosts the bar leaves that margin before the title. */
    .toggle { position: absolute; z-index: 3; top: calc(var(--lc-header-height, 56px) / 2 - 13px); right: -13px; width: 26px; height: 26px; min-width: 26px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center; font-size: 12px; color: var(--lc-color-on-surface, #1b2430); background: var(--lc-color-surface, #fff);
      border: 1px solid var(--lc-sider-border, #d5dbe3); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); }
  `,
  template: `
    <aside class="side" [class.collapsed]="collapsed()">
      <div class="logo">
        <!-- A brand of the application itself (element with the lcBrand attribute) replaces logo and name. -->
        <ng-content select="[lcBrand]">
          @if (logo(); as src) {
            <img [src]="src" alt="" />
          } @else {
            <span class="mark" aria-hidden="true"><lc-icon name="package" /></span>
          }
          <span class="name">{{ brand() }}</span>
        </ng-content>
      </div>
      @if (areas().length > 1) {
        @if (!collapsed()) {
          <!-- The same grid icon as the collapsed bar; the «Area» label becomes its tooltip (and stays for screen readers). -->
          <div class="area">
            <span class="area-mark" aria-hidden="true" nz-tooltip [nzTooltipTitle]="i18n.t('lc.area')" nzTooltipPlacement="right"><lc-icon name="sections" /></span>
            <label class="visually-hidden" [for]="selectId">{{ i18n.t('lc.area') }}</label>
            <nz-select [nzId]="selectId" [ngModel]="current()?.id" (ngModelChange)="areaChange.emit($event)">
              @for (u of areas(); track u.id) {
                <nz-option [nzValue]="u.id" [nzLabel]="u.label" />
              }
            </nz-select>
          </div>
        } @else {
          <!-- When collapsed the selector becomes an icon (always the same grid: it stands for the areas) with a drop-down menu. -->
          <div class="area-icon">
            <button nz-button nzType="text" class="area-trigger" type="button" nz-dropdown nzTrigger="click" nzPlacement="bottomLeft" [nzDropdownMenu]="areaMenu"
              [attr.aria-label]="i18n.t('lc.area') + ': ' + (current()?.label ?? '')" aria-haspopup="menu"
              nz-tooltip [nzTooltipTitle]="i18n.t('lc.area') + ': ' + (current()?.label ?? '')" nzTooltipPlacement="right">
              <lc-icon name="sections" />
            </button>
            <nz-dropdown-menu #areaMenu="nzDropdownMenu">
              <ul nz-menu nzSelectable>
                @for (u of areas(); track u.id) {
                  <li nz-menu-item [nzSelected]="u.id === current()?.id" (click)="areaChange.emit(u.id)">
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
          <!-- The highlighted item is decided only by the open screen (nzSelected): NG-ZORRO does not change it by itself on click. -->
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
  /** Name shown next to the logo. */
  readonly brand = input('KinetiX');
  /** (Relative) address of the logo image; if missing an icon is shown. */
  readonly logo = input<string | null>(null);
  /** Area shown; if missing or not visible the first available one is shown. */
  readonly areaId = input<string | null>(null);
  /** Current screen, to highlight the active item and open its groups. */
  readonly active = input<{ screen: string; params: Record<string, unknown> } | null>(null);
  /** Builds the address of an item (for the links). */
  readonly hrefFor = input<(area: string, leaf: VisibleLeaf) => string>(() => '#');
  /** Counters of the items (item id → number), shown next to the text. */
  readonly badges = input<Record<string, number>>({});

  readonly navigate = output<NavigateEvent>();
  readonly areaChange = output<string>();

  protected readonly selectId = nextId('lc-area');
  protected readonly searchId = nextId('lc-menu-search');
  /** Text searched in the menu. */
  protected readonly query = signal('');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Bar collapsed to icons only. With `[(collapsed)]` the button can be elsewhere (for example in the top bar). */
  readonly collapsed = model(false);
  /** Shows the collapse button at the bottom of the bar. */
  readonly showToggle = input(true);
  /** Style of the library menu: the real colours come from the theme anyway. */
  readonly tone = input<'light' | 'dark'>('light');
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly areas = computed(() => this.navigation().areas());
  protected readonly current = computed(() => {
    const all = this.areas();
    return all.find((u) => u.id === this.areaId()) ?? all[0] ?? null;
  });
  protected readonly path = computed(() => {
    const uc = this.current();
    const active = this.active();
    return uc && active ? (this.navigation().locate(uc.id, active.screen, active.params) ?? []) : [];
  });

  /** For every group of the current area: the name and the sum of the counters of its items (also in subgroups). */
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

  /** Items of the current area that contain the searched text (ignoring case and accents), with their path. */
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
    // NG-ZORRO group titles cannot be reached from the keyboard and do not say whether they are open: that is added here.
    afterEveryRender(() => {
      const groups = this.groupBadges();
      for (const title of this.host.nativeElement.querySelectorAll<HTMLElement>('.ant-menu-submenu-title')) {
        const open = title.parentElement?.classList.contains('ant-menu-submenu-open') ?? false;
        if (title.getAttribute('tabindex') !== '0') title.setAttribute('tabindex', '0');
        if (title.getAttribute('role') !== 'button') title.setAttribute('role', 'button');
        if (title.getAttribute('aria-expanded') !== String(open)) title.setAttribute('aria-expanded', String(open));
        // Counter of the group: closed, or with the bar collapsed (the items are in a separate menu).
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
    // The groups that contain the active item open by themselves; the user can close them afterwards.
    effect(() => {
      const ancestors = this.path().slice(0, -1);
      if (ancestors.length === 0) return;
      untracked(() => this.expanded.update((set) => new Set([...set, ...ancestors])));
    });
  }

  protected isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  /** At the third level there are only items: the menu schema allows no other groups. */
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

  /** Text of an item for screen reader users, with the counter if present. */
  protected leafLabel(leaf: VisibleLeaf): string {
    const n = this.badges()[leaf.id];
    return n ? `${leaf.label}, ${this.i18n.t('lc.badge', { n })}` : leaf.label;
  }

  /** In the search: Arrow down goes to the results, Enter opens the first, Esc clears. */
  protected searchKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.query.set('');
    } else if (event.key === 'ArrowDown') {
      this.host.nativeElement.querySelector<HTMLElement>('.results a')?.focus();
    } else if (event.key === 'Enter') {
      const first = this.results()[0];
      const uc = this.current();
      if (first && uc) {
        this.navigate.emit({ area: uc.id, leaf: first.leaf });
        this.query.set('');
      }
    } else {
      return;
    }
    event.preventDefault();
  }

  /** Among the results: up and down arrows (from the first, up goes back to the search). */
  protected resultKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const links = [...this.host.nativeElement.querySelectorAll<HTMLElement>('.results a')];
    const i = links.indexOf(event.target as HTMLElement);
    const next = event.key === 'ArrowDown' ? links[i + 1] : i === 0 ? this.host.nativeElement.querySelector<HTMLElement>('.search input') : links[i - 1];
    next?.focus();
  }

  /**
   * Keyboard menu: up and down arrows among visible items and groups, Home and End to the ends, right opens a group
   * (or enters the first item if already open), left closes it (or goes back to the group that contains the item), Enter and
   * Space open or close a group.
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
   * Click on the whole row of the item (not only on the text of the link): it opens the screen. A click on the edge of the row
   * used to highlight the item without opening it. The click on the link arrives here bubbling up from the row.
   */
  protected go(event: MouseEvent, leaf: VisibleLeaf): void {
    // With modifier keys or the middle click the browser decides (new tab).
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const uc = this.current();
    if (uc) this.navigate.emit({ area: uc.id, leaf });
  }
}

export type { VisibleItem };

/** Text without capitals or accents, for searching. */
function plainText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
