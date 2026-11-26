import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { I18n, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzTagModule } from 'ng-zorro-antd/tag';
import type { MenuButtonNode, Tone } from 'schema';
import { BusyComponent } from './busy.component';
import { TONE_COLORS, TONE_TEXT } from './display.component';
import { IconComponent } from './icon.component';
import { menuEntries, toneOf, type MenuEntry } from './menu-entries';

/**
 * A button that opens a menu: fixed items, items made from the rows of a data source (with a coloured label) and
 * dividers; each item runs its own steps, which see the row as `item`. The label and the tone of the button are
 * expressions, for example the current status of an issue.
 *
 * Keyboard and screen readers as a menu button: `aria-haspopup` and `aria-expanded` on the button; opening moves the
 * focus to the first item, arrows, Home and End move among the items, Enter or Space choose, Esc closes and gives the
 * focus back to the button. While the steps of an item run the button is busy.
 */
@Component({
  selector: 'lc-menu-button',
  imports: [BusyComponent, IconComponent, NzButtonModule, NzDropdownModule, NzMenuModule, NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: inline-block; }
    .toned, .toned:hover, .toned:focus { background: var(--lc-menu-tone); border-color: var(--lc-menu-tone); color: var(--lc-menu-on-tone); }
    .toned:hover { filter: brightness(1.08); }
    .label { margin-inline: 0 6px; }
    lc-icon.lead { margin-inline-end: 8px; }
    ul { min-width: 200px; }
    li span.row { display: flex; align-items: center; gap: 8px; }
    li nz-tag { margin-inline: auto 0; }
    .empty, .wait { padding: 6px 12px; color: var(--lc-color-muted); }
    .wait { min-height: 40px; }
  `,
  template: `
    <button
      #trigger
      nz-button
      type="button"
      nz-dropdown
      nzTrigger="click"
      nzPlacement="bottomLeft"
      [nzDropdownMenu]="menu"
      [nzType]="tone() === 'primary' ? 'primary' : 'default'"
      [class.toned]="tone() === 'success' || tone() === 'danger'"
      [style.--lc-menu-tone]="toneColor()"
      [style.--lc-menu-on-tone]="toneText()"
      [nzLoading]="busy()"
      [disabled]="busy() || !runtime().isEnabled(node(), scope())"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      (nzVisibleChange)="visible($event)"
    >
      @if (node().icon && !busy()) {
        <lc-icon class="lead" [name]="node().icon" />
      }
      <span class="label">{{ runtime().text(node().label, scope()) }}</span>
      <lc-icon name="down" />
    </button>
    <nz-dropdown-menu #menu="nzDropdownMenu">
      <ul #list nz-menu role="menu" [attr.aria-label]="runtime().text(node().label, scope())" (keydown)="key($event)">
        @for (entry of entries(); track entry.key) {
          @switch (entry.kind) {
            @case ('divider') {
              <li nz-menu-divider role="separator"></li>
            }
            @case ('loading') {
              <li role="none" class="wait"><lc-busy [busy]="true" [empty]="true" [immediate]="true" /></li>
            }
            @case ('item') {
              <li nz-menu-item role="menuitem" tabindex="-1" [nzDisabled]="entry.disabled" [attr.aria-disabled]="entry.disabled || null" (click)="choose(entry)">
                <span class="row">
                  @if (entry.icon) {
                    <lc-icon [name]="entry.icon" />
                  }
                  <span>{{ entry.label }}</span>
                  @if (entry.badge) {
                    <nz-tag [nzColor]="color(entry.tone)" [style.color]="textColor(entry.tone)">{{ entry.badge }}</nz-tag>
                  }
                </span>
              </li>
            }
          }
        } @empty {
          <li role="none" class="empty">{{ i18n.t('lc.menuEmpty') }}</li>
        }
      </ul>
    </nz-dropdown-menu>
  `,
})
export class MenuButtonComponent {
  readonly node = input.required<MenuButtonNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);
  protected readonly busy = signal(false);
  protected readonly open = signal(false);
  // The button is an NG-ZORRO component: its element is read explicitly.
  private readonly trigger = viewChild.required<string, ElementRef<HTMLButtonElement>>('trigger', { read: ElementRef });
  private readonly list = viewChild<ElementRef<HTMLUListElement>>('list');

  protected readonly tone = computed(() => toneOf(this.node().tone === undefined ? undefined : this.runtime().text(this.node().tone, this.scope())));
  protected readonly toneColor = computed(() => TONE_COLORS[this.tone()]);
  protected readonly toneText = computed(() => TONE_TEXT[this.tone()]);

  protected readonly entries = computed<MenuEntry[]>(() => {
    const runtime = this.runtime();
    return menuEntries(this.node().items, {
      text: (template, scope) => runtime.text(template, scope),
      isVisible: (item, scope) => runtime.isVisible(item, scope),
      isEnabled: (item, scope) => runtime.isEnabled(item, scope),
      source: (name) => runtime.source(name),
      translate: (key, fallback) => this.i18n.t(key, {}, fallback),
    }, this.scope());
  });

  protected color(tone: Tone): string {
    return TONE_COLORS[tone];
  }

  protected textColor(tone: Tone): string {
    return TONE_TEXT[tone];
  }

  protected async choose(entry: MenuEntry): Promise<void> {
    if (entry.kind !== 'item' || entry.disabled || this.busy()) return;
    // The menu closes on the click: the focus goes back to the button before the steps open windows of their own.
    this.trigger().nativeElement.focus();
    this.busy.set(true);
    try {
      await runSteps(this.runtime(), entry.steps, entry.scope);
    } finally {
      this.busy.set(false);
    }
  }

  /** Opened: the focus goes to the first item. Closed with the focus inside the menu (or lost): back to the button. */
  protected visible(open: boolean): void {
    this.open.set(open);
    if (open) {
      setTimeout(() => this.focusable()[0]?.focus());
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body || active.closest('.ant-dropdown')) this.trigger().nativeElement.focus();
  }

  /** Arrows, Home and End move among the items; Enter and Space choose the item with the focus. */
  protected key(event: KeyboardEvent): void {
    const items = this.focusable();
    const at = items.indexOf(document.activeElement as HTMLElement);
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
      items[at].click();
    }
  }

  private focusable(): HTMLElement[] {
    const menu = this.list()?.nativeElement;
    return menu ? [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter((item) => item.getAttribute('aria-disabled') !== 'true') : [];
  }
}
