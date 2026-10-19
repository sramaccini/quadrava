import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { DOCK_MAX_WIDTH, DOCK_MIN_WIDTH, DOCK_STRIP, Dock, PANEL_SIDE, type DockPanel, type DockSide } from './dock';

/** A panel of the side: its tab when it is hidden. */
export interface DockTab {
  id: DockPanel;
  label: string;
  icon: string;
}

/**
 * A side of the editor (screen, navigation, theme) with its panels, as in IDEs (see \`Dock\`). The pinned panels
 * sit in the column; the unpinned ones have a tab on the strip at the edge and, when open, float
 * over the central area (the elements of the panels have \`edDockPanel\`). Closed they stay in the document (transparent and
 * without events): a drag started from the palette goes on even if the panel closes. The width of the
 * column is decided by the container with \`Dock.columnWidth\`.
 */
@Component({
  selector: 'ed-dock-side',
  imports: [NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'complementary',
    '[class.left]': "side() === 'left'",
    '[class.right]': "side() === 'right'",
    '[class.has-hidden]': 'hidden().length > 0',
    '[class.all-hidden]': 'hidden().length === panels().length',
    '[class.open]': 'dock.openSide() === side()',
    '[style.--ed-dock-width.px]': 'dock.width(side(), width())',
    '[style.--ed-dock-strip.px]': 'strip',
    '(pointerenter)': 'dock.pointer(side(), true)',
    '(pointerleave)': 'dock.pointer(side(), false)',
    '(keydown.escape)': 'escape($event)',
  },
  styles: `
    :host { position: relative; display: flex; min-height: 0; overflow: hidden; }
    :host(.right) { flex-direction: row-reverse; }
    .dock { flex: 1; min-width: 0; }
    :host(.has-hidden) { z-index: 30; overflow: visible; }
    :host(.all-hidden) .dock { flex: 0 0 0; padding: 0; overflow: visible; }
    .strip { flex: none; display: flex; flex-direction: column; gap: 2px; width: 30px; padding: 6px 0; background: var(--lc-color-surface); }
    :host(.left) .strip { border-right: 1px solid var(--lc-color-border); }
    :host(.right) .strip { border-left: 1px solid var(--lc-color-border); }
    :host(.all-hidden) .strip { border: 0; }
    .tab {
      display: flex; align-items: center; gap: 6px; padding: 10px 0; border: 0; border-radius: var(--lc-radius); background: none;
      color: var(--lc-color-muted); font: inherit; font-size: 12px; font-weight: 600; writing-mode: vertical-rl; cursor: pointer;
    }
    .tab:hover, .tab[aria-expanded='true'] { color: var(--lc-color-primary); background: color-mix(in srgb, var(--lc-color-primary) 10%, transparent); }
    .tab:focus-visible { outline: 2px solid var(--lc-color-primary); outline-offset: -2px; }
    /* Inner edge to drag to change the width (double click: foreseen width). */
    .splitter { position: absolute; top: 0; bottom: 0; z-index: 5; width: 7px; cursor: col-resize; touch-action: none; }
    :host(.left) .splitter { right: -4px; }
    :host(.right) .splitter { left: -4px; }
    .splitter::after { content: ''; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: transparent; transition: background 0.1s; }
    .splitter:hover::after, .splitter.dragging::after, .splitter:focus-visible::after { background: var(--lc-color-primary); width: 2px; left: 2px; }
    .splitter:focus-visible { outline: none; }
    /* Narrow windows: no hidden panels, they are always visible (see also styles.scss). */
    @media (max-width: 1100px) {
      :host(.has-hidden) { overflow: hidden; }
      .strip, .splitter { display: none; }
      :host(.all-hidden) .dock { flex: 1; padding: 8px; }
    }
  `,
  template: `
    @if (hidden().length) {
      <!-- Panels hidden automatically: one tab each, which opens its panel over the central area. -->
      <div class="strip" role="group" [attr.aria-label]="i18n.t('ed.dock.hidden')">
        @for (tab of hidden(); track tab.id) {
          <button
            type="button"
            class="tab"
            [attr.data-dock-tab]="tab.id"
            [attr.aria-expanded]="dock.isOpen(tab.id)"
            [attr.aria-controls]="'ed-panel-' + tab.id"
            (pointerenter)="dock.hoverTab(tab.id, true)"
            (pointerleave)="dock.hoverTab(tab.id, false)"
            (click)="dock.toggle(tab.id)"
          >
            <span nz-icon [nzType]="tab.icon" aria-hidden="true"></span><span class="tab-label">{{ tab.label }}</span>
          </button>
        }
      </div>
    }
    @if (hidden().length < panels().length) {
      <div
        class="splitter"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        [attr.aria-label]="i18n.t('ed.dock.resize')"
        [attr.aria-valuemin]="min"
        [attr.aria-valuemax]="max"
        [attr.aria-valuenow]="dock.width(side(), width())"
        [class.dragging]="dragging"
        (pointerdown)="dragStartResize($event)"
        (dblclick)="dock.resize(side(), null)"
        (keydown)="resizeKey($event)"
      ></div>
    }
    <div [id]="'ed-dock-' + side()" class="dock ed-panels" (focusin)="focusIn($event)" (focusout)="focusOut($event)" (dragstart)="dragStart($event)">
      <ng-content />
    </div>
  `,
})
export class DockSideComponent {
  readonly side = input.required<DockSide>();
  /** The panels of the side, in the order they are in (the tabs of the hidden ones follow the same order). */
  readonly panels = input.required<DockTab[]>();
  /** Foreseen width of the panels (pinned, and open over the central area). */
  readonly width = input(300);
  protected readonly dock = inject(Dock);
  protected readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly strip = DOCK_STRIP;
  /** The hidden panels (with the tab). */
  protected readonly hidden = computed(() => this.panels().filter((p) => !this.dock.pinned[p.id]()));

  protected readonly min = DOCK_MIN_WIDTH;
  protected readonly max = DOCK_MAX_WIDTH;
  protected dragging = false;

  /** Dragging the edge: the width follows the pointer (on the right the side grows towards the left). */
  protected dragStartResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    const side = this.side();
    const startX = event.clientX;
    const startWidth = this.dock.width(side, this.width());
    this.dragging = true;
    handle.setPointerCapture?.(event.pointerId);
    const move = (e: PointerEvent) => this.dock.resize(side, startWidth + (side === 'left' ? e.clientX - startX : startX - e.clientX));
    const end = () => {
      this.dragging = false;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** From the keyboard: arrows by 16 px (towards the central area they widen), Home and End to the limits, Enter to the foreseen width. */
  protected resizeKey(event: KeyboardEvent): void {
    const side = this.side();
    const width = this.dock.width(side, this.width());
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
    const next =
      event.key === grow ? width + 16 : event.key === shrink ? width - 16 : event.key === 'Home' ? this.min : event.key === 'End' ? this.max : event.key === 'Enter' ? null : undefined;
    if (next === undefined) return;
    event.preventDefault();
    this.dock.resize(side, next);
  }

  /**
   * The focus enters a field of the side (one is typing): the open panel stays open even if the mouse leaves.
   * A button (the pin, a palette component, an outline node) does not keep it.
   */
  protected focusIn(event: FocusEvent): void {
    this.dock.focus(this.side(), isEditable(event.target));
  }

  /** The focus leaves the side: the open panel closes, if the mouse is outside too. */
  protected focusOut(event: FocusEvent): void {
    const area = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node && area.contains(event.relatedTarget))) this.dock.blur(this.side());
  }

  /** Esc closes the open panel and brings the focus back to its tab. */
  protected escape(event: Event): void {
    const open = this.dock.open();
    if (!open || PANEL_SIDE[open] !== this.side()) return;
    // Esc closes the panel and does nothing else (it does not also deselect).
    event.preventDefault();
    this.dock.hide();
    this.host.nativeElement.querySelector<HTMLElement>(`.tab[data-dock-tab="${open}"]`)?.focus();
  }

  /** A component dragged from the open palette over the preview: the panel closes to leave the drawing free. */
  protected dragStart(event: DragEvent): void {
    if (this.dock.open() !== 'palette' || !(event.target instanceof Element) || !event.target.closest('ed-palette')) return;
    const side = this.side();
    setTimeout(() => this.dock.dragAway(side));
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
