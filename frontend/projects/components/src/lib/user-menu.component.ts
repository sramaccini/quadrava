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

/**
 * Utente collegato: icona (iniziale) e nome, con un menu a tendina. La voce di uscita (logout) è sempre l'ultima,
 * separata dalle altre; le altre voci le decide l'applicazione. I testi arrivano come valori e sono mostrati come testo.
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
    ul { min-width: 160px; }
    /* Su schermi stretti resta solo l'iniziale; il nome è comunque nell'aria-label. */
    @media (max-width: 767px) { .name { display: none; } }
  `,
  template: `
    <button type="button" class="trigger" nz-dropdown [nzDropdownMenu]="menu" nzTrigger="click" nzPlacement="bottomRight" [attr.aria-label]="i18n.t('lc.userMenu') + ' ' + name()" aria-haspopup="menu">
      <nz-avatar nzSize="small" [nzText]="initial()" />
      <span class="name">{{ name() }}</span>
    </button>
    <nz-dropdown-menu #menu="nzDropdownMenu">
      <ul nz-menu>
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
  protected readonly i18n = inject(I18n);
  /** Scelta di una voce diversa dall'uscita. */
  readonly select = output<string>();
  readonly logout = output<void>();

  protected readonly initial = computed(() => (this.name().trim().charAt(0) || '?').toUpperCase());

  protected choose(item: UserMenuItem): void {
    if (!item.disabled) this.select.emit(item.id);
  }
}
