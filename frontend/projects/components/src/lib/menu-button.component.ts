import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { I18n, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { MenuButtonNode, Tone } from 'schema';
import { BusyComponent } from './busy.component';
import { PRESSED_COLORS, buttonFace } from './button-face';
import { TONE_COLORS, TONE_TEXT } from './display.component';
import { IconComponent } from './icon.component';
import { menuEntries, type MenuEntry } from './menu-entries';

/**
 * A button that opens a menu: fixed items, items made from the rows of a data source (with a coloured label) and
 * dividers; each item runs its own steps, which see the row as `item`. The label and the tone of the button are
 * expressions, for example the current status of an issue. With `display: "icon"` it shows the icon alone, without the
 * arrow (the «…» button), and its text becomes the name for screen readers and the tooltip; `count` adds a number and
 * `pressed` highlights it (aria-pressed), for example the eye of the watchers while the user watches.
 *
 * Keyboard and screen readers as a menu button: `aria-haspopup` and `aria-expanded` on the button; opening moves the
 * focus to the first item, arrows, Home and End move among the items, Enter or Space choose, Esc closes and gives the
 * focus back to the button. While the steps of an item run the button is busy.
 */
@Component({
  selector: 'lc-menu-button',
  imports: [BusyComponent, IconComponent, NzButtonModule, NzDropdownModule, NzMenuModule, NzTagModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: inline-block; }
    .toned, .toned:hover, .toned:focus { background: var(--lc-menu-tone); border-color: var(--lc-menu-tone); color: var(--lc-menu-on-tone); }
    .toned:hover { filter: brightness(1.08); }
    .label { margin-inline: 0 6px; }
    .icon-only { min-width: 32px; padding-inline: 8px; }
    .count { margin-inline: 0 6px; font-variant-numeric: tabular-nums; }
    .icon-only .count { margin-inline: 4px 0; }
    .pressed, .pressed:hover, .pressed:focus { color: var(--lc-pressed); border-color: var(--lc-pressed); background: color-mix(in srgb, var(--lc-pressed) 14%, transparent); }
    li.danger { color: var(--lc-text-error); }
    .icon-only lc-icon.lead { margin-inline-end: 0; }
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
      [nzType]="face().pressed === null && tone() === 'primary' ? 'primary' : 'default'"
      [class.toned]="face().pressed === null && (tone() === 'success' || tone() === 'danger')"
      [style.--lc-pressed]="face().pressed === null ? null : pressedColor()"
      [style.--lc-menu-tone]="toneColor()"
      [style.--lc-menu-on-tone]="toneText()"
      [nzLoading]="busy()"
      [disabled]="busy() || !runtime().isEnabled(node(), scope())"
      [class.icon-only]="face().iconOnly"
      [class.pressed]="face().pressed === true"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-pressed]="face().pressed"
      [attr.aria-label]="face().iconOnly || face().count !== null ? face().name : null"
      nz-tooltip
      [nzTooltipTitle]="face().iconOnly ? face().name : null"
      (nzVisibleChange)="visible($event)"
    >
      @if (node().icon && !busy()) {
        <lc-icon class="lead" [name]="node().icon" [filled]="face().pressed === true" />
      }
      @if (!face().iconOnly) {
        <span class="label">{{ face().text }}</span>
      }
      @if (face().count !== null) {
        <span class="count" aria-hidden="true">{{ face().count }}</span>
      }
      @if (!face().iconOnly) {
        <lc-icon name="down" />
      }
    </button>
    <nz-dropdown-menu #menu="nzDropdownMenu">
      <ul #list nz-menu role="menu" [attr.aria-label]="face().text" (keydown)="key($event)">
        @for (entry of entries(); track entry.key) {
          @switch (entry.kind) {
            @case ('divider') {
              <li nz-menu-divider role="separator"></li>
            }
            @case ('loading') {
              <li role="none" class="wait"><lc-busy [busy]="true" [empty]="true" [immediate]="true" /></li>
            }
            @case ('item') {
              <li nz-menu-item role="menuitem" tabindex="-1" [class.danger]="!entry.badge && entry.tone === 'danger'" [nzDisabled]="entry.disabled" [attr.aria-disabled]="entry.disabled || null" (click)="choose(entry)">
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

  protected readonly face = computed(() => {
    const format = new Intl.NumberFormat(this.i18n.intlLocale());
    return buttonFace(this.node(), this.runtime(), this.scope(), (n) => format.format(n));
  });
  protected readonly tone = computed(() => this.face().tone ?? 'neutral');
  /** On a toggle the tone colours the pressed state (primary when it has none) instead of filling the button. */
  protected readonly pressedColor = computed(() => PRESSED_COLORS[this.face().tone ?? 'primary']);
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
