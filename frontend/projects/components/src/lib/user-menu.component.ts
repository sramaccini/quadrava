import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from 'core';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { IconComponent } from './icon.component';

export interface UserMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
}

/** A group of alternatives of which one is current, such as the tenants of the user: a heading and the choices. */
export interface UserMenuChoices {
  label: string;
  items: readonly UserMenuItem[];
  /** Identifier of the current choice, marked with a tick. */
  selected?: string;
}

/**
 * Signed-in user: icon (initial) and name, with a drop-down menu. The sign-out item (logout) is always the last one,
 * separated from the others; the other items are decided by the application. An optional group of choices (one of them
 * current) comes first, under its heading. Texts arrive as values and are shown as text.
 */
@Component({
  selector: 'lc-user-menu',
  imports: [IconComponent, NzAvatarModule, NzDropdownModule, NzMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: inline-block; }
    .trigger { display: inline-flex; align-items: center; gap: 8px; height: 100%; padding: 0 8px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; border-radius: var(--lc-radius, 6px); }
    .trigger:hover { background: rgba(127, 127, 127, 0.12); }
    nz-avatar { background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff); }
    li a, li span.row { display: flex; align-items: center; gap: 8px; }
    /* Room for the tick, so the labels of the choices stay aligned. */
    .tick { width: 14px; }
    ul { min-width: 160px; }
    /* On narrow screens only the initial stays; the name is in the aria-label anyway. */
    @media (max-width: 767px) { .name { display: none; } }
  `,
  template: `
    <button type="button" class="trigger" nz-dropdown [nzDropdownMenu]="menu" nzTrigger="click" nzPlacement="bottomRight" [attr.aria-label]="i18n.t('lc.userMenu') + ' ' + name()" aria-haspopup="menu">
      <nz-avatar nzSize="small" [nzText]="initial()" />
      <span class="name">{{ name() }}</span>
    </button>
    <nz-dropdown-menu #menu="nzDropdownMenu">
      <ul nz-menu>
        @if (choices(); as group) {
          <li nz-menu-group [nzTitle]="group.label">
            <ul role="group" [attr.aria-label]="group.label">
              @for (item of group.items; track item.id) {
                <li nz-menu-item role="menuitemradio" [attr.aria-checked]="item.id === group.selected" [nzDisabled]="item.disabled === true" (click)="pick(item, group)">
                  <span class="row"><span class="tick">@if (item.id === group.selected) {<lc-icon name="check" />}</span>{{ item.label }}</span>
                </li>
              }
            </ul>
          </li>
          <li nz-menu-divider></li>
        }
        @for (item of items(); track item.id) {
          <li nz-menu-item [nzDisabled]="item.disabled === true" (click)="choose(item)">
            <span class="row"><lc-icon [name]="item.icon" />{{ item.label }}</span>
          </li>
        }
        @if (items().length) {
          <li nz-menu-divider></li>
        }
        <li nz-menu-item class="logout" (click)="logout.emit()">
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
  /** Choice of an item other than sign-out. */
  readonly select = output<string>();
  readonly logout = output<void>();
  /** Choice of an alternative of the group other than the current one. */
  readonly choice = output<string>();

  protected readonly initial = computed(() => (this.name().trim().charAt(0) || '?').toUpperCase());

  protected choose(item: UserMenuItem): void {
    if (!item.disabled) this.select.emit(item.id);
  }

  protected pick(item: UserMenuItem, group: UserMenuChoices): void {
    if (!item.disabled && item.id !== group.selected) this.choice.emit(item.id);
  }
}
