import { DestroyRef, Injectable, effect, inject, signal, type WritableSignal } from '@angular/core';

export type DockSide = 'left' | 'right';
/** The panels that are pinned or hidden: components and outline on the left, properties on the right. */
export type DockPanel = 'palette' | 'outline' | 'inspector';

/** Side of every panel (in all modes: the outline of the navigation is the same «Outline»). */
export const PANEL_SIDE: Record<DockPanel, DockSide> = { palette: 'left', outline: 'left', inspector: 'right' };
const PANELS = Object.keys(PANEL_SIDE) as DockPanel[];

const STORAGE_KEY = 'lc.editor.dock';
/** Wait before opening when hovering a tab (a quick pass opens nothing). */
export const DOCK_OPEN_DELAY = 150;
/** Wait before closing when the mouse leaves (one can come back without it closing). */
export const DOCK_CLOSE_DELAY = 400;
/** Limits of the width of a side when dragging its edge. */
export const DOCK_MIN_WIDTH = 200;
export const DOCK_MAX_WIDTH = 640;
/** Width of the strip with the tabs of the hidden panels. */
export const DOCK_STRIP = 30;

/**
 * The panels of the editor like the windows of classic IDEs (Visual Studio, Eclipse). Every panel has its
 * pin: pinned it sits in the column of its side; unpinned («auto hide») it becomes a tab on the
 * strip at the edge, and the other panels of the side take its space. If all the panels of a side are
 * unpinned only the strip remains. A tab opens its panel over the central area on hover,
 * on click or with Enter; it closes again when the mouse has left and the focus is not in one of its fields, with Esc, or when
 * a palette component is dragged towards the preview. The choices are remembered in the browser.
 */
@Injectable({ providedIn: 'root' })
export class Dock {
  readonly pinned = Object.fromEntries(PANELS.map((p) => [p, signal(true)])) as Record<DockPanel, WritableSignal<boolean>>;
  /** Width chosen by dragging the edge (null: the one foreseen by the mode). */
  readonly widths = { left: signal<number | null>(null), right: signal<number | null>(null) };
  /** The unpinned panel open right now (at most one). */
  readonly open = signal<DockPanel | null>(null);
  private readonly hovered = { left: false, right: false };
  private readonly focused = { left: false, right: false };
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
        pins?: Partial<Record<DockPanel, boolean>>;
        left?: boolean;
        right?: boolean;
        leftWidth?: number;
        rightWidth?: number;
      };
      for (const panel of PANELS) {
        // Old choices (per whole side) apply to all the panels of the side.
        const pinned = saved.pins?.[panel] ?? saved[PANEL_SIDE[panel]];
        if (pinned === false) this.pinned[panel].set(false);
      }
      if (typeof saved.leftWidth === 'number') this.widths.left.set(clampWidth(saved.leftWidth));
      if (typeof saved.rightWidth === 'number') this.widths.right.set(clampWidth(saved.rightWidth));
    } catch {
      // Unreadable values: pinned panels.
    }
    effect(() => {
      const state: Record<string, unknown> = { pins: Object.fromEntries(PANELS.map((p) => [p, this.pinned[p]()])) };
      const leftWidth = this.widths.left();
      const rightWidth = this.widths.right();
      if (leftWidth !== null) state['leftWidth'] = leftWidth;
      if (rightWidth !== null) state['rightWidth'] = rightWidth;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Without browser storage the choice holds for the visit.
      }
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** Width of the pinned panels of a side: the chosen one, otherwise the foreseen one (`fallback`). */
  width(side: DockSide, fallback: number): number {
    return this.widths[side]() ?? fallback;
  }

  /** Width of the column of a side with these panels: the pinned ones, plus the strip if one is hidden. */
  columnWidth(side: DockSide, panels: readonly DockPanel[], fallback: number): number {
    const pinned = panels.filter((p) => this.pinned[p]()).length;
    return (pinned ? this.width(side, fallback) : 0) + (pinned < panels.length ? DOCK_STRIP : 0);
  }

  /** New width (within the limits); null goes back to the foreseen one. */
  resize(side: DockSide, width: number | null): void {
    this.widths[side].set(width === null ? null : clampWidth(width));
  }

  isOpen(panel: DockPanel): boolean {
    return this.open() === panel;
  }

  /** Pins or unpins a panel. Just unpinned it stays open until the mouse leaves, as in IDEs. */
  togglePin(panel: DockPanel): void {
    const pinned = !this.pinned[panel]();
    this.pinned[panel].set(pinned);
    clearTimeout(this.timer);
    if (pinned) {
      if (this.open() === panel) this.open.set(null);
    } else {
      this.open.set(panel);
      this.hovered[PANEL_SIDE[panel]] = true;
    }
  }

  /** The mouse enters or leaves a side: when leaving, the open panel closes after a short wait. */
  pointer(side: DockSide, inside: boolean): void {
    this.hovered[side] = inside;
    if (!inside) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.settle(side), DOCK_CLOSE_DELAY);
    } else if (this.openSide() === side) clearTimeout(this.timer);
  }

  /** The mouse rests on a tab: after a short wait it opens its panel. */
  hoverTab(panel: DockPanel, inside: boolean): void {
    clearTimeout(this.timer);
    if (inside && this.open() !== panel) this.timer = setTimeout(() => this.show(panel), DOCK_OPEN_DELAY);
  }

  /**
   * The focus moves inside a side. In a field (`editing`: one is typing) the open panel stays open even
   * with the mouse outside; on a button it does not keep it, but does not close it either (keyboard users are working there).
   */
  focus(side: DockSide, editing: boolean): void {
    this.focused[side] = editing;
  }

  /** The focus left the side: the open panel closes, if the mouse is outside too. */
  blur(side: DockSide): void {
    this.focused[side] = false;
    this.settle(side);
  }

  /** Click or Enter on a tab: opens at once (or closes if it was already open). */
  toggle(panel: DockPanel): void {
    clearTimeout(this.timer);
    if (this.open() === panel) this.hide();
    else this.show(panel);
  }

  show(panel: DockPanel): void {
    clearTimeout(this.timer);
    if (!this.pinned[panel]()) this.open.set(panel);
  }

  hide(): void {
    clearTimeout(this.timer);
    this.open.set(null);
  }

  /** A component dragged out of the side: the panel closes at once (during the drag the mouse does not «leave»). */
  dragAway(side: DockSide): void {
    this.hovered[side] = false;
    this.focused[side] = false;
    if (this.openSide() === side) this.hide();
  }

  /** Side of the open panel. */
  openSide(): DockSide | null {
    const open = this.open();
    return open ? PANEL_SIDE[open] : null;
  }

  /** Closes the open panel of the side if neither the mouse nor the focus is inside. */
  private settle(side: DockSide): void {
    if (this.openSide() === side && !this.hovered[side] && !this.focused[side]) this.hide();
  }
}

function clampWidth(width: number): number {
  return Math.round(Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, width)));
}
