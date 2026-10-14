import { DestroyRef, Injectable, effect, inject, signal, type WritableSignal } from '@angular/core';

export type DockSide = 'left' | 'right';
/** I riquadri che si fissano o si nascondono: componenti e struttura a sinistra, proprietà a destra. */
export type DockPanel = 'palette' | 'outline' | 'inspector';

/** Lato di ogni riquadro (in tutte le modalità: la struttura della navigazione è la stessa «Struttura»). */
export const PANEL_SIDE: Record<DockPanel, DockSide> = { palette: 'left', outline: 'left', inspector: 'right' };
const PANELS = Object.keys(PANEL_SIDE) as DockPanel[];

const STORAGE_KEY = 'lc.editor.dock';
/** Attesa prima di aprire al passaggio del mouse su una linguetta (un passaggio veloce non apre nulla). */
export const DOCK_OPEN_DELAY = 150;
/** Attesa prima di chiudere quando il mouse esce (si può rientrare senza che si chiuda). */
export const DOCK_CLOSE_DELAY = 400;
/** Limiti della larghezza di un lato trascinandone il bordo. */
export const DOCK_MIN_WIDTH = 200;
export const DOCK_MAX_WIDTH = 640;
/** Larghezza della striscia con le linguette dei riquadri nascosti. */
export const DOCK_STRIP = 30;

/**
 * I riquadri dell'editor come le finestre degli IDE classici (Visual Studio, Eclipse). Ogni riquadro ha la sua
 * puntina: fissato sta nella colonna del suo lato; sganciato («nascondi automaticamente») diventa una linguetta sulla
 * striscia del bordo, e gli altri riquadri del lato prendono il suo spazio. Se tutti i riquadri di un lato sono
 * sganciati resta solo la striscia. Una linguetta apre il suo riquadro sopra l'area centrale al passaggio del mouse,
 * al clic o con Invio; si richiude quando il mouse è uscito e il fuoco non è in un suo campo, con Esc, o quando si
 * trascina un componente della tavolozza verso l'anteprima. Le scelte si ricordano nel browser.
 */
@Injectable({ providedIn: 'root' })
export class Dock {
  readonly pinned = Object.fromEntries(PANELS.map((p) => [p, signal(true)])) as Record<DockPanel, WritableSignal<boolean>>;
  /** Larghezza scelta trascinando il bordo (null: quella prevista dalla modalità). */
  readonly widths = { left: signal<number | null>(null), right: signal<number | null>(null) };
  /** Il riquadro sganciato aperto in questo momento (al più uno). */
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
        // Scelte vecchie (per lato intero) valgono per tutti i riquadri del lato.
        const pinned = saved.pins?.[panel] ?? saved[PANEL_SIDE[panel]];
        if (pinned === false) this.pinned[panel].set(false);
      }
      if (typeof saved.leftWidth === 'number') this.widths.left.set(clampWidth(saved.leftWidth));
      if (typeof saved.rightWidth === 'number') this.widths.right.set(clampWidth(saved.rightWidth));
    } catch {
      // Valori illeggibili: riquadri fissati.
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
        // Senza memoria del browser la scelta vale per la visita.
      }
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** Larghezza dei riquadri fissati di un lato: quella scelta, altrimenti quella prevista (`fallback`). */
  width(side: DockSide, fallback: number): number {
    return this.widths[side]() ?? fallback;
  }

  /** Larghezza della colonna di un lato con questi riquadri: quelli fissati, più la striscia se qualcuno è nascosto. */
  columnWidth(side: DockSide, panels: readonly DockPanel[], fallback: number): number {
    const pinned = panels.filter((p) => this.pinned[p]()).length;
    return (pinned ? this.width(side, fallback) : 0) + (pinned < panels.length ? DOCK_STRIP : 0);
  }

  /** Nuova larghezza (entro i limiti); null torna a quella prevista. */
  resize(side: DockSide, width: number | null): void {
    this.widths[side].set(width === null ? null : clampWidth(width));
  }

  isOpen(panel: DockPanel): boolean {
    return this.open() === panel;
  }

  /** Fissa o sgancia un riquadro. Appena sganciato resta aperto finché il mouse non esce, come negli IDE. */
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

  /** Il mouse entra in un lato o ne esce: uscendo, il riquadro aperto si chiude dopo una breve attesa. */
  pointer(side: DockSide, inside: boolean): void {
    this.hovered[side] = inside;
    if (!inside) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.settle(side), DOCK_CLOSE_DELAY);
    } else if (this.openSide() === side) clearTimeout(this.timer);
  }

  /** Il mouse si ferma su una linguetta: dopo una breve attesa apre il suo riquadro. */
  hoverTab(panel: DockPanel, inside: boolean): void {
    clearTimeout(this.timer);
    if (inside && this.open() !== panel) this.timer = setTimeout(() => this.show(panel), DOCK_OPEN_DELAY);
  }

  /**
   * Il fuoco si sposta dentro un lato. In un campo (`editing`: si sta scrivendo) il riquadro aperto resta aperto anche
   * con il mouse fuori; su un pulsante non lo trattiene, ma nemmeno lo chiude (chi usa la tastiera ci sta lavorando).
   */
  focus(side: DockSide, editing: boolean): void {
    this.focused[side] = editing;
  }

  /** Il fuoco è uscito dal lato: il riquadro aperto si chiude, se anche il mouse è fuori. */
  blur(side: DockSide): void {
    this.focused[side] = false;
    this.settle(side);
  }

  /** Clic o Invio su una linguetta: apre subito (o chiude se era già aperto). */
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

  /** Un componente trascinato fuori dal lato: il riquadro si chiude subito (durante il trascinamento il mouse non «esce»). */
  dragAway(side: DockSide): void {
    this.hovered[side] = false;
    this.focused[side] = false;
    if (this.openSide() === side) this.hide();
  }

  /** Lato del riquadro aperto. */
  openSide(): DockSide | null {
    const open = this.open();
    return open ? PANEL_SIDE[open] : null;
  }

  /** Chiude il riquadro aperto del lato se né il mouse né il fuoco sono dentro. */
  private settle(side: DockSide): void {
    if (this.openSide() === side && !this.hovered[side] && !this.focused[side]) this.hide();
  }
}

function clampWidth(width: number): number {
  return Math.round(Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, width)));
}
