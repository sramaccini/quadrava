import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, output } from '@angular/core';
import type { MenuItem } from './menu-bar.component';

/**
 * Context menu (right click, Shift+F10 or the menu key): items with shortcuts and separators, as in the menu
 * bar. It opens at the given point (moved to stay in the window) with the focus on the first enabled item;
 * arrows, Home and End move through the items skipping the disabled ones, Enter and Space run, Esc, Tab or a click outside
 * close. Whoever opens it takes the focus back when it closes (`closed`).
 */
@Component({
  selector: 'ed-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'outside($event)' },
  styles: `
    .menu {
      position: fixed; z-index: 1200; min-width: 220px; margin: 0; padding: 4px 0; list-style: none;
      background: var(--lc-color-surface); border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius);
      box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
    }
    .item {
      display: flex; align-items: center; gap: 24px; width: 100%; padding: 5px 14px 5px 26px; border: 0; background: none;
      color: inherit; font: inherit; font-size: 13px; text-align: left; white-space: nowrap; cursor: default;
    }
    .item:not([aria-disabled='true']):hover, .item:not([aria-disabled='true']):focus { background: var(--lc-color-primary); color: var(--lc-color-on-primary); outline: none; }
    .item[aria-disabled='true'] { color: var(--lc-color-muted); }
    .label { flex: 1; }
    .shortcut { opacity: 0.75; font-size: 12px; }
    .separator { height: 1px; margin: 4px 0; background: var(--lc-color-border); }
  `,
  template: `
    <ul class="menu" role="menu" [attr.aria-label]="label()" [style.left.px]="x()" [style.top.px]="y()" (keydown)="key($event)">
      @for (item of items(); track item.id) {
        @if (item.separator) {
          <li class="separator" role="separator"></li>
        }
        <li role="none">
          <button
            type="button"
            class="item"
            role="menuitem"
            tabindex="-1"
            [attr.data-item]="item.id"
            [attr.aria-disabled]="item.disabled ? 'true' : null"
            (click)="run(item)"
            (pointerenter)="$any($event.currentTarget).focus()"
          >
            <span class="label">{{ item.label }}</span>
            @if (item.shortcut) {
              <span class="shortcut" aria-hidden="true">{{ item.shortcut }}</span>
            }
          </button>
        </li>
      }
    </ul>
  `,
})
export class ContextMenuComponent {
  readonly items = input.required<MenuItem[]>();
  /** Point where to open (window coordinates). */
  readonly x = input(0);
  readonly y = input(0);
  readonly label = input('');
  /** The menu closed (with or without an item run): whoever opened it removes it and takes the focus back. */
  readonly closed = output<void>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(
      () => {
        const menu = this.host.nativeElement.querySelector<HTMLElement>('.menu');
        if (!menu) return;
        // It stays in the window: if there is no room on the right or below it opens on the other side.
        const box = menu.getBoundingClientRect();
        if (box.right > innerWidth) menu.style.left = `${Math.max(0, innerWidth - box.width - 4)}px`;
        if (box.bottom > innerHeight) menu.style.top = `${Math.max(0, innerHeight - box.height - 4)}px`;
        this.enabled()[0]?.focus();
      },
      { injector: inject(Injector) },
    );
  }

  protected run(item: MenuItem): void {
    if (item.disabled) return;
    this.closed.emit();
    item.run?.();
  }

  protected key(event: KeyboardEvent): void {
    const items = this.enabled();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move = (index: number) => {
      event.preventDefault();
      items[(index + items.length) % items.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(items.length - 1);
    else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      this.closed.emit();
    }
  }

  protected outside(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.closed.emit();
  }

  private enabled(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('.item:not([aria-disabled="true"])')];
  }
}
