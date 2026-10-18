import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, output, signal } from '@angular/core';

/** A menu item: a command (`run`) or a submenu (`children`). */
export interface MenuItem {
  id: string;
  label: string;
  /** Shortcut shown on the right (text only: the real shortcut is handled by whoever offers it). */
  shortcut?: string;
  disabled?: boolean;
  /** Tooltip on hover (for example why the item is off); screen readers read it too. */
  hint?: string;
  /** Separator line before the item. */
  separator?: boolean;
  children?: MenuItem[];
  /** Text shown in an empty submenu. */
  emptyLabel?: string;
  /** Item with a check mark (`check`, toggles on and off) or a choice among alternatives (`radio`). */
  toggle?: 'check' | 'radio';
  checked?: boolean;
  run?: () => void;
}

export interface Menu {
  id: string;
  label: string;
  items: MenuItem[];
}

/**
 * Menu bar as in desktop applications (File, Edit…), following the WAI-ARIA «menubar» pattern: a click
 * opens and closes, hovering another title changes menu; from the keyboard arrows, Home and End, Enter and
 * Space, Esc to close (the focus goes back to the title), Tab to leave. An item with a submenu opens with the right
 * arrow or on hover.
 */
@Component({
  selector: 'ed-menu-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'outside($event)' },
  styles: `
    :host { display: block; }
    .bar { display: flex; gap: 2px; margin: 0; padding: 0; list-style: none; }
    .top { position: relative; }
    .title, .item {
      display: flex; align-items: center; width: 100%; border: 0; background: none; color: inherit; font: inherit; cursor: default;
      text-align: left; white-space: nowrap;
    }
    .title { padding: 3px 10px; border-radius: var(--lc-radius); font-size: 14px; }
    .title:hover, .title[aria-expanded='true'] { background: color-mix(in srgb, var(--lc-color-on-surface) 9%, transparent); }
    .title:focus-visible, .item:focus-visible { outline: 2px solid var(--lc-color-primary); outline-offset: -2px; }
    .menu {
      position: absolute; z-index: 1100; top: 100%; left: 0; min-width: 220px; margin: 2px 0 0; padding: 4px 0;
      list-style: none; background: var(--lc-color-surface); border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius);
      box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
    }
    /* The submenu (examples can be many) scrolls; the main menu does not, otherwise it would cut the submenu. */
    .menu .menu { top: -5px; left: 100%; max-height: 60vh; overflow: auto; margin: 0 0 0 2px; }
    .entry { position: relative; }
    .check { position: absolute; left: 9px; font-size: 11px; }
    .item { gap: 24px; padding: 5px 14px 5px 26px; font-size: 13px; }
    .item:not([aria-disabled='true']):hover, .item:not([aria-disabled='true']):focus, .item[aria-expanded='true'] {
      background: var(--lc-color-primary); color: var(--lc-color-on-primary);
    }
    .item[aria-disabled='true'] { color: var(--lc-color-muted); }
    .label { flex: 1; }
    .shortcut { color: inherit; opacity: 0.75; font-size: 12px; }
    .arrow { font-size: 10px; }
    .separator { height: 1px; margin: 4px 0; background: var(--lc-color-border); }
    .empty { padding: 5px 14px 5px 26px; font-size: 13px; color: var(--lc-color-muted); font-style: italic; }
  `,
  template: `
    <ul class="bar" role="menubar" [attr.aria-label]="label()">
      @for (menu of menus(); track menu.id; let m = $index) {
        <li class="top" role="none">
          <button
            type="button"
            class="title"
            role="menuitem"
            aria-haspopup="menu"
            [attr.id]="'ed-menu-' + menu.id"
            [attr.aria-expanded]="open() === m"
            [attr.tabindex]="m === current() ? 0 : -1"
            [attr.data-menu]="menu.id"
            (click)="toggle(m)"
            (pointerenter)="hoverTitle(m)"
            (keydown)="titleKey($event, m)"
          >
            {{ menu.label }}
          </button>
          @if (open() === m) {
            <ul class="menu" role="menu" [attr.aria-labelledby]="'ed-menu-' + menu.id">
              <ng-container [ngTemplateOutlet]="list" [ngTemplateOutletContext]="{ $implicit: menu.items, level: 0 }" />
            </ul>
          }
        </li>
      }
    </ul>

    <ng-template #list let-items let-level="level">
      @for (item of items; track item.id) {
        @if (item.separator) {
          <li class="separator" role="separator"></li>
        }
        <li class="entry" role="none">
          <button
            type="button"
            class="item"
            [attr.role]="roleOf(item)"
            tabindex="-1"
            [attr.data-item]="item.id"
            [attr.data-level]="level"
            [attr.aria-checked]="item.toggle ? !!item.checked : null"
            [attr.aria-disabled]="item.disabled ? 'true' : null"
            [attr.title]="item.hint ?? null"
            [attr.aria-description]="item.hint ?? null"
            [attr.aria-haspopup]="item.children ? 'menu' : null"
            [attr.aria-expanded]="item.children ? sub() === item.id : null"
            (click)="activate(item, $event)"
            (pointerenter)="hoverItem(item, level, $event)"
            (keydown)="itemKey($event, item, level)"
          >
            @if (item.toggle && item.checked) {
              <span class="check" aria-hidden="true">{{ item.toggle === 'radio' ? '●' : '✓' }}</span>
            }
            <span class="label">{{ item.label }}</span>
            @if (item.shortcut) {
              <span class="shortcut" aria-hidden="true">{{ item.shortcut }}</span>
            }
            @if (item.children) {
              <span class="arrow" aria-hidden="true">▶</span>
            }
          </button>
          @if (item.children && sub() === item.id) {
            <ul class="menu" role="menu" [attr.aria-label]="item.label">
              @for (child of item.children; track child.id) {
                <li class="entry" role="none">
                  <button
                    type="button"
                    class="item"
                    role="menuitem"
                    tabindex="-1"
                    [attr.data-item]="child.id"
                    data-level="1"
                    [attr.aria-disabled]="child.disabled ? 'true' : null"
                    (click)="activate(child, $event)"
                    (keydown)="itemKey($event, child, 1)"
                  >
                    <span class="label">{{ child.label }}</span>
                  </button>
                </li>
              } @empty {
                <li class="empty" role="none">{{ item.emptyLabel }}</li>
              }
            </ul>
          }
        </li>
      }
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
})
export class MenuBarComponent {
  readonly menus = input.required<Menu[]>();
  /** A menu opens (from the closed bar): whoever offers it can update the items, for example the availability of the registry. */
  readonly opened = output<string>();
  /** Name of the bar for screen readers. */
  readonly label = input('');

  /** Open menu (index) and open submenu (id of the item). */
  protected readonly open = signal<number | null>(null);
  protected readonly sub = signal<string | null>(null);
  /** Title reachable with Tab (roving tabindex). */
  protected readonly current = signal(0);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  /** Element that had the focus before opening with the mouse: it goes back there after a command. */
  private returnFocus: HTMLElement | null = null;

  protected roleOf(item: MenuItem): string {
    return item.toggle === 'check' ? 'menuitemcheckbox' : item.toggle === 'radio' ? 'menuitemradio' : 'menuitem';
  }

  protected toggle(index: number): void {
    if (this.open() === index) return this.close();
    this.openMenu(index, null);
  }

  protected hoverTitle(index: number): void {
    if (this.open() !== null && this.open() !== index) this.openMenu(index, null);
  }

  protected hoverItem(item: MenuItem, level: number, event: Event): void {
    if (level === 0) this.sub.set(item.children && !item.disabled ? item.id : null);
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
  }

  protected titleKey(event: KeyboardEvent, index: number): void {
    const count = this.menus().length;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowLeft': {
        const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
        event.preventDefault();
        if (this.open() !== null) this.openMenu(next, 'first');
        else this.focusTitle(next);
        break;
      }
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.openMenu(index, 'first');
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.openMenu(index, 'last');
        break;
      case 'Home':
      case 'End':
        event.preventDefault();
        this.focusTitle(event.key === 'Home' ? 0 : count - 1);
        break;
      case 'Escape':
        if (this.open() !== null) {
          event.preventDefault();
          this.close();
        }
        break;
    }
  }

  protected itemKey(event: KeyboardEvent, item: MenuItem, level: number): void {
    const index = this.open();
    if (index === null) return;
    const count = this.menus().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        event.preventDefault();
        this.moveFocus(event.target as HTMLElement, event.key);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (level === 0 && item.children && !item.disabled) this.openSub(item.id);
        else this.openMenu((index + 1) % count, 'first');
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (level === 1) {
          const parent = this.sub();
          this.sub.set(null);
          this.focusItem(parent);
        } else this.openMenu((index - 1 + count) % count, 'first');
        break;
      case 'Escape':
        event.preventDefault();
        if (level === 1) {
          const parent = this.sub();
          this.sub.set(null);
          this.focusItem(parent);
        } else this.close();
        break;
      case 'Tab':
        this.open.set(null);
        this.sub.set(null);
        break;
      case 'Enter':
      case ' ':
        // The button turns it into a click; for an item with a submenu, it opens it and moves the focus inside.
        if (item.children) {
          event.preventDefault();
          if (!item.disabled) this.openSub(item.id);
        }
        break;
    }
  }

  protected activate(item: MenuItem, event: Event): void {
    event.stopPropagation();
    if (item.disabled) return;
    if (item.children) {
      // Opens it, also when hovering has already opened it (as in desktop menus: the click does not close it again).
      this.sub.set(item.id);
      return;
    }
    const back = this.returnFocus;
    this.open.set(null);
    this.sub.set(null);
    this.returnFocus = null;
    // The focus goes back where it was; the command can then move it (a confirmation dialog, a panel).
    if (back?.isConnected) back.focus({ preventScroll: true });
    else this.titleButton(this.current())?.focus({ preventScroll: true });
    item.run?.();
  }

  /** A click outside the bar closes the menu. */
  protected outside(event: Event): void {
    if (this.open() !== null && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(null);
      this.sub.set(null);
    }
  }

  private openMenu(index: number, focus: 'first' | 'last' | null): void {
    if (this.open() === null) {
      const active = document.activeElement;
      this.returnFocus = active instanceof HTMLElement && !this.host.nativeElement.contains(active) ? active : null;
    }
    if (this.open() !== index) this.opened.emit(this.menus()[index]?.id ?? '');
    this.current.set(index);
    this.open.set(index);
    this.sub.set(null);
    this.afterRender(() => {
      if (focus) this.focusEnabled(this.menuItems(0), focus);
      else this.titleButton(index)?.focus({ preventScroll: true });
    });
  }

  private openSub(id: string): void {
    this.sub.set(id);
    this.afterRender(() => this.focusEnabled(this.menuItems(1), 'first'));
  }

  private close(): void {
    const index = this.open() ?? this.current();
    this.open.set(null);
    this.sub.set(null);
    this.returnFocus = null;
    this.titleButton(index)?.focus();
  }

  private focusTitle(index: number): void {
    this.current.set(index);
    this.afterRender(() => this.titleButton(index)?.focus());
  }

  private focusItem(id: string | null): void {
    if (!id) return;
    this.host.nativeElement.querySelector<HTMLElement>(`.item[data-level="0"][data-item="${CSS.escape(id)}"]`)?.focus();
  }

  private moveFocus(from: HTMLElement, key: string): void {
    const items = this.menuItems(Number(from.dataset['level'] ?? 0)).filter((b) => b.getAttribute('aria-disabled') !== 'true');
    if (!items.length) return;
    const at = items.indexOf(from);
    const next =
      key === 'Home' ? 0 : key === 'End' ? items.length - 1 : key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next].focus();
  }

  private focusEnabled(items: HTMLElement[], which: 'first' | 'last'): void {
    const enabled = items.filter((b) => b.getAttribute('aria-disabled') !== 'true');
    (which === 'first' ? enabled[0] : enabled[enabled.length - 1])?.focus();
  }

  private menuItems(level: number): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>(`.item[data-level="${level}"]`)];
  }

  private titleButton(index: number): HTMLElement | null {
    return this.host.nativeElement.querySelectorAll<HTMLElement>('.title')[index] ?? null;
  }

  private afterRender(action: () => void): void {
    afterNextRender(action, { injector: this.injector });
  }
}
