import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Confirmation, I18n } from 'core';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { IconComponent } from './icon.component';

export interface UserMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  selected?: boolean;
  /** One level of actions under a menu entry, for example the profile and settings choices. */
  children?: readonly UserMenuItem[];
}

/** A group of alternatives of which one is current, such as the tenants of the user: a heading and the choices. */
export interface UserMenuChoices {
  label: string;
  items: readonly UserMenuItem[];
  /** Identifier of the current choice, marked with a tick. */
  selected?: string;
}

/**
 * Signed-in user: an icon with the initial (the name in its tooltip and accessible name), with a drop-down menu. The sign-out item (logout) is always the last one,
 * separated from the others, and asks for confirmation first; the other items are decided by the application. An optional group of choices (one of them
 * current) comes first, under its heading. Texts arrive as values and are shown as text.
 *
 * Keyboard: opening the menu moves the focus to its first item; arrows, Home and End move among the items, Enter or Space
 * chooses, Esc closes; closing gives the focus back to the icon. On an entry with a submenu, Enter, Space or the right arrow
 * open it on its first item, and the left arrow closes it again. Roles of a menu (menu, menuitem, menuitemradio, separator).
 */
@Component({
  selector: 'lc-user-menu',
  imports: [IconComponent, NzAvatarModule, NzDropdownModule, NzMenuModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: inline-block; }
    .trigger { display: inline-flex; align-items: center; height: 100%; padding: 0 8px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; border-radius: var(--lc-radius, 6px); }
    .trigger:hover { background: rgba(127, 127, 127, 0.12); }
    nz-avatar { background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff); }
    li a, li span.row { display: flex; align-items: center; gap: 8px; }
    /* Room for the tick, so the labels of the choices stay aligned. */
    .tick { width: 14px; }
    ul { min-width: 160px; }
  `,
  template: `
    <button #trigger type="button" class="trigger" nz-dropdown [nzDropdownMenu]="menu" nzTrigger="click" nzPlacement="bottomRight" [attr.aria-label]="i18n.t('lc.userMenu') + ' ' + name()" aria-haspopup="menu"
      [attr.aria-expanded]="open()" (nzVisibleChange)="visible($event)"
      nz-tooltip [nzTooltipTitle]="i18n.t('lc.user', { name: name() })" nzTooltipPlacement="bottomRight">
      <nz-avatar nzSize="small" [nzText]="initial()" />
    </button>
    <nz-dropdown-menu #menu="nzDropdownMenu">
      <ul #list nz-menu role="menu" [attr.aria-label]="i18n.t('lc.userMenu')" (keydown)="key($event)">
        @if (choices(); as group) {
          <li nz-menu-group role="none" [nzTitle]="group.label">
            <ul role="group" [attr.aria-label]="group.label">
              @for (item of group.items; track item.id) {
                <li nz-menu-item role="menuitemradio" tabindex="-1" [attr.aria-checked]="item.id === group.selected" [attr.aria-disabled]="item.disabled === true || null" [nzDisabled]="item.disabled === true" (click)="pick(item, group)">
                  <span class="row"><span class="tick">@if (item.id === group.selected) {<lc-icon name="check" />}</span>{{ item.label }}</span>
                </li>
              }
            </ul>
          </li>
          <li nz-menu-divider role="separator"></li>
        }
        @for (item of items(); track item.id) {
          @if (item.children?.length) {
            <li nz-submenu role="none" [attr.data-submenu]="item.id" [nzTitle]="item.label" [nzDisabled]="item.disabled === true" [nzOpen]="openSubmenuId() === item.id" [nzTriggerSubMenuAction]="'click'" (nzOpenChange)="setSubmenuOpen(item.id, $event)">
              <ul role="menu" [attr.aria-label]="item.label" [attr.data-submenu-of]="item.id" (keydown)="key($event)">
                @for (child of item.children; track child.id) {
                  <li nz-menu-item role="menuitem" tabindex="-1" [attr.aria-disabled]="child.disabled === true || null" [nzDisabled]="child.disabled === true" [nzSelected]="child.selected === true" (click)="choose(child)">
                    <span class="row"><lc-icon [name]="child.icon" />{{ child.label }}</span>
                  </li>
                }
              </ul>
            </li>
          } @else {
            <li nz-menu-item role="menuitem" tabindex="-1" [attr.aria-disabled]="item.disabled === true || null" [nzDisabled]="item.disabled === true" [nzSelected]="item.selected === true" (click)="choose(item)">
              <span class="row"><lc-icon [name]="item.icon" />{{ item.label }}</span>
            </li>
          }
        }
        @if (items().length) {
          <li nz-menu-divider role="separator"></li>
        }
        <li nz-menu-item role="menuitem" tabindex="-1" class="logout" (click)="signOut()">
          <span class="row"><lc-icon name="logout" />{{ logoutLabel() ?? i18n.t('lc.logout') }}</span>
        </li>
      </ul>
    </nz-dropdown-menu>
  `,
})
export class UserMenuComponent {
  readonly name = input.required<string>();
  readonly items = input<readonly UserMenuItem[]>([]);
  readonly logoutLabel = input<string>();
  readonly choices = input<UserMenuChoices>();
  protected readonly i18n = inject(I18n);
  private readonly confirmation = inject(Confirmation, { optional: true });
  /** One submenu is expanded at a time; controlling it explicitly keeps click activation consistent in the dropdown. */
  protected readonly openSubmenuId = signal<string | null>(null);
  protected readonly open = signal(false);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly list = viewChild<ElementRef<HTMLUListElement>>('list');
  /** Choice of an item other than sign-out. */
  readonly select = output<string>();
  /** Sign-out confirmed by the user (straight away when no `Confirmation` is provided). */
  readonly logout = output<void>();
  /** Choice of an alternative of the group other than the current one. */
  readonly choice = output<string>();

  protected readonly initial = computed(() => (this.name().trim().charAt(0) || '?').toUpperCase());

  protected choose(item: UserMenuItem): void {
    if (!item.disabled) this.select.emit(item.id);
  }

  protected async signOut(): Promise<void> {
    // The confirmation gives the focus back to where it was: the icon, not the item that is going away.
    this.trigger().nativeElement.focus();
    if (!this.confirmation || (await this.confirmation.confirm(this.i18n.t('lc.logoutConfirm')))) this.logout.emit();
  }

  /** Opened: the focus goes to the first item. Closed with the focus inside the menu (or lost): back to the icon. */
  protected visible(open: boolean): void {
    this.open.set(open);
    if (open) {
      setTimeout(() => {
        const menu = this.list()?.nativeElement;
        // The title of a submenu is drawn by NG-ZORRO: it becomes an item of the menu here.
        menu?.querySelectorAll<HTMLElement>('[data-submenu] > .ant-dropdown-menu-submenu-title').forEach((title) => {
          title.setAttribute('role', 'menuitem');
          title.setAttribute('tabindex', '-1');
          title.setAttribute('aria-haspopup', 'menu');
        });
        this.focusable(menu)[0]?.focus();
      });
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body || active.closest('.ant-dropdown')) this.trigger().nativeElement.focus();
  }

  /** Arrows, Home and End move among the items of the menu; Enter and Space choose the item with the focus. */
  protected key(event: KeyboardEvent): void {
    const menu = event.currentTarget as HTMLElement;
    const items = this.focusable(menu);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const current = items[at];
    const submenu = current?.parentElement?.getAttribute('data-submenu');
    const parent = menu.getAttribute('data-submenu-of');
    if (submenu && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight')) {
      event.preventDefault();
      event.stopPropagation();
      this.openSubmenuId.set(submenu);
      setTimeout(() => this.focusable(document.querySelector<HTMLElement>(`[data-submenu-of="${CSS.escape(submenu)}"]`) ?? undefined)[0]?.focus());
      return;
    }
    if (parent && event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      this.openSubmenuId.set(null);
      this.list()?.nativeElement.querySelector<HTMLElement>(`[data-submenu="${CSS.escape(parent)}"] > [role="menuitem"]`)?.focus();
      return;
    }
    const move = (to: number): void => {
      event.preventDefault();
      event.stopPropagation();
      items[(to + items.length) % items.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at < 0 ? items.length - 1 : at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(items.length - 1);
    else if ((event.key === 'Enter' || event.key === ' ') && at >= 0) {
      event.preventDefault();
      event.stopPropagation();
      current.click();
    }
  }

  /** The items of a menu that can take the focus, in order: not those of a nested menu, not the disabled ones. */
  private focusable(menu: HTMLElement | undefined): HTMLElement[] {
    if (!menu) return [];
    return [...menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')].filter(
      (item) => item.closest('[role="menu"]') === menu && item.getAttribute('aria-disabled') !== 'true',
    );
  }

  protected setSubmenuOpen(id: string, open: boolean): void {
    this.openSubmenuId.set(open ? id : this.openSubmenuId() === id ? null : this.openSubmenuId());
  }

  protected pick(item: UserMenuItem, group: UserMenuChoices): void {
    if (!item.disabled && item.id !== group.selected) this.choice.emit(item.id);
  }
}
