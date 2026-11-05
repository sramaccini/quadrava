import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n } from 'core';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { IconComponent } from './icon.component';
import { unreadCount, type UserNotification } from './notifications';

/**
 * Messages of the user in the top bar (ADR-22): a bell with the number of unread messages and, on click, the list.
 * Choosing a message reports it (the shell marks it read and opens its screen); «Mark all as read» reports the unread
 * ones. The texts come from the service and are shown as text; unread messages are marked by weight and a dot with its
 * own accessible text, not by colour alone.
 */
@Component({
  selector: 'lc-notification-bell',
  imports: [IconComponent, NzBadgeModule, NzButtonModule, NzDropdownModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: inline-flex; align-items: center; height: 100%; }
    .trigger { display: inline-flex; align-items: center; height: 100%; padding: 0 8px; border: 0; background: transparent; color: inherit; cursor: pointer; border-radius: var(--lc-radius, 6px); font-size: 18px; }
    .trigger:hover { background: rgba(127, 127, 127, 0.12); }
    .trigger nz-badge { color: inherit; font-size: inherit; }
    .panel { width: min(360px, calc(100vw - 24px)); max-height: min(480px, 70vh); display: flex; flex-direction: column; background: var(--lc-color-surface, #fff);
      color: var(--lc-color-on-surface, inherit); border-radius: var(--lc-radius, 6px); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--lc-color-border, rgba(127, 127, 127, 0.25)); }
    h2 { margin: 0; font-size: 14px; font-weight: 600; }
    ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
    li + li { border-top: 1px solid var(--lc-color-border, rgba(127, 127, 127, 0.15)); }
    li button { display: grid; grid-template-columns: 10px 1fr; gap: 2px 8px; width: 100%; padding: 8px 12px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    li button:hover, li button:focus-visible { background: rgba(127, 127, 127, 0.1); }
    .dot { grid-row: 1; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; }
    .unread .dot { background: var(--lc-color-primary, #1f5fbf); }
    .title { grid-column: 2; overflow-wrap: anywhere; }
    .unread .title { font-weight: 600; }
    .text, .date { grid-column: 2; color: var(--lc-color-muted-text, inherit); font-size: 12px; overflow-wrap: anywhere; white-space: pre-line; }
    .empty { padding: 16px 12px; color: var(--lc-color-muted-text, inherit); text-align: center; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `,
  template: `
    <button type="button" class="trigger" nz-dropdown [nzDropdownMenu]="panel" nzTrigger="click" nzPlacement="bottomRight" [nzVisible]="open()" (nzVisibleChange)="toggle($event)"
      [attr.aria-label]="label()" aria-haspopup="dialog" [attr.aria-expanded]="open()">
      <nz-badge [nzCount]="unread()" nzSize="small" [nzOverflowCount]="99"><lc-icon name="bell" /></nz-badge>
    </button>
    <nz-dropdown-menu #panel="nzDropdownMenu">
      <section class="panel" role="dialog" [attr.aria-label]="i18n.t('lc.notifications')">
        <header>
          <h2>{{ i18n.t('lc.notifications') }}</h2>
          @if (canMarkRead() && unread()) {
            <button nz-button nzType="link" nzSize="small" type="button" (click)="markAllRead.emit()">{{ i18n.t('lc.markAllRead') }}</button>
          }
        </header>
        @if (items().length) {
          <ul>
            @for (item of items(); track item.id) {
              <li [class.unread]="!item.read">
                <button type="button" (click)="choose(item)">
                  <span class="dot" aria-hidden="true"></span>
                  <span class="title">@if (!item.read) {<span class="sr-only">{{ i18n.t('lc.unread') }}: </span>}{{ item.title }}</span>
                  @if (item.text) {
                    <span class="text">{{ item.text }}</span>
                  }
                  @if (item.date) {
                    <span class="date">{{ when(item.date) }}</span>
                  }
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="empty">{{ i18n.t('lc.noNotifications') }}</p>
        }
      </section>
    </nz-dropdown-menu>
  `,
})
export class NotificationBellComponent {
  readonly items = input<readonly UserNotification[]>([]);
  /** The service can mark messages as read (it has a `readUrl`). */
  readonly canMarkRead = input(false);
  /** The panel was opened: a good moment to read the messages again. */
  readonly opened = output<void>();
  /** A message was chosen. */
  readonly choice = output<UserNotification>();
  /** «Mark all as read». */
  readonly markAllRead = output<void>();
  protected readonly i18n = inject(I18n);
  protected readonly open = signal(false);
  protected readonly unread = computed(() => unreadCount(this.items()));
  protected readonly label = computed(() => this.i18n.t('lc.notificationsUnread', { n: this.unread() }));

  protected toggle(open: boolean): void {
    this.open.set(open);
    if (open) this.opened.emit();
  }

  protected choose(item: UserNotification): void {
    this.open.set(false);
    this.choice.emit(item);
  }

  protected when(date: string): string {
    return new Intl.DateTimeFormat(this.i18n.intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
  }
}
