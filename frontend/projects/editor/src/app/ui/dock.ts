import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';

export type DockSide = 'left' | 'right';

const STORAGE_KEY = 'lc.editor.dock';
/** Attesa prima di aprire al passaggio del mouse (un passaggio veloce non apre nulla). */
export const DOCK_OPEN_DELAY = 150;
/** Attesa prima di chiudere quando il mouse esce (si può rientrare senza che si chiuda). */
export const DOCK_CLOSE_DELAY = 400;
/** Limiti della larghezza di un lato trascinandone il bordo. */
export const DOCK_MIN_WIDTH = 200;
export const DOCK_MAX_WIDTH = 640;

/**
 * I lati dell'editor (componenti e struttura a sinistra, proprietà a destra) come le finestre degli IDE classici:
 * fissati occupano la loro colonna; non fissati («nascondi automaticamente») si riducono a una striscia con le
 * linguette e si aprono sopra l'anteprima al passaggio del mouse, al clic o con il fuoco. Si richiudono quando il
 * mouse è uscito e il fuoco non è dentro (si può scrivere in una proprietà anche con il mouse altrove), con Esc, o
 * quando si trascina un componente della tavolozza verso l'anteprima. La scelta si ricorda nel browser.
 */
@Injectable({ providedIn: 'root' })
export class Dock {
  readonly pinned = { left: signal(true), right: signal(true) };
  /** Larghezza scelta trascinando il bordo (null: quella prevista dalla modalità). */
  readonly widths = { left: signal<number | null>(null), right: signal<number | null>(null) };
  /** Il lato non fissato aperto in questo momento (al più uno). */
  readonly open = signal<DockSide | null>(null);
  private readonly hovered = { left: false, right: false };
  private readonly focused = { left: false, right: false };
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<DockSide, boolean> & Record<'leftWidth' | 'rightWidth', number>>;
      if (saved.left === false) this.pinned.left.set(false);
      if (saved.right === false) this.pinned.right.set(false);
      if (typeof saved.leftWidth === 'number') this.widths.left.set(clampWidth(saved.leftWidth));
      if (typeof saved.rightWidth === 'number') this.widths.right.set(clampWidth(saved.rightWidth));
    } catch {
      // Valori illeggibili: lati fissati.
    }
    effect(() => {
      const state: Record<string, boolean | number> = { left: this.pinned.left(), right: this.pinned.right() };
      const leftWidth = this.widths.left();
      const rightWidth = this.widths.right();
      if (leftWidth !== null) state['leftWidth'] = leftWidth;
      if (rightWidth !== null) state['rightWidth'] = rightWidth;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Senza memoria del browser la scelta vale per la visita.
      }
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** Larghezza del lato: quella scelta, altrimenti quella prevista (`fallback`). */
  width(side: DockSide, fallback: number): number {
    return this.widths[side]() ?? fallback;
  }

  /** Nuova larghezza (entro i limiti); null torna a quella prevista. */
  resize(side: DockSide, width: number | null): void {
    this.widths[side].set(width === null ? null : clampWidth(width));
  }

  isOpen(side: DockSide): boolean {
    return this.pinned[side]() || this.open() === side;
  }

  /** Fissa o sgancia un lato. Appena sganciato resta aperto finché il mouse non esce, come negli IDE. */
  togglePin(side: DockSide): void {
    const pinned = !this.pinned[side]();
    this.pinned[side].set(pinned);
    clearTimeout(this.timer);
    this.open.set(pinned ? (this.open() === side ? null : this.open()) : side);
    if (!pinned) this.hovered[side] = true;
  }

  pointer(side: DockSide, inside: boolean): void {
    this.hovered[side] = inside;
    if (this.pinned[side]()) return;
    clearTimeout(this.timer);
    if (inside && this.open() !== side) this.timer = setTimeout(() => this.show(side), DOCK_OPEN_DELAY);
    else if (!inside) this.timer = setTimeout(() => this.settle(side), DOCK_CLOSE_DELAY);
  }

  /**
   * Il fuoco si sposta dentro il lato. In un campo (`editing`: si sta scrivendo) lo apre e lo tiene aperto anche con il
   * mouse fuori; su un pulsante non lo trattiene, ma nemmeno lo chiude (chi usa la tastiera ci sta lavorando).
   */
  focus(side: DockSide, editing: boolean): void {
    this.focused[side] = editing;
    if (!this.pinned[side]() && editing) this.show(side);
  }

  /** Il fuoco è uscito dal lato: si chiude, se anche il mouse è fuori. */
  blur(side: DockSide): void {
    this.focused[side] = false;
    if (!this.pinned[side]()) this.settle(side);
  }

  /** Clic su una linguetta: apre subito (o chiude se era già aperto). */
  toggle(side: DockSide): void {
    clearTimeout(this.timer);
    if (this.open() === side) this.hide(side);
    else this.show(side);
  }

  show(side: DockSide): void {
    clearTimeout(this.timer);
    if (!this.pinned[side]()) this.open.set(side);
  }

  hide(side: DockSide): void {
    clearTimeout(this.timer);
    if (this.open() === side) this.open.set(null);
  }

  /** Un componente trascinato fuori dal lato: si chiude subito (durante il trascinamento il mouse non «esce»). */
  dragAway(side: DockSide): void {
    this.hovered[side] = false;
    this.focused[side] = false;
    this.hide(side);
  }

  /** Chiude se né il mouse né il fuoco sono dentro il lato. */
  private settle(side: DockSide): void {
    if (!this.hovered[side] && !this.focused[side]) this.hide(side);
  }
}

function clampWidth(width: number): number {
  return Math.round(Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, width)));
}
