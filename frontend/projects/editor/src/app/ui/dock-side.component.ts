import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { DOCK_MAX_WIDTH, DOCK_MIN_WIDTH, DOCK_STRIP, Dock, PANEL_SIDE, type DockPanel, type DockSide } from './dock';

/** Un riquadro del lato: la sua linguetta quando è nascosto. */
export interface DockTab {
  id: DockPanel;
  label: string;
  icon: string;
}

/**
 * Un lato dell'editor (schermata, navigazione, tema) con i suoi riquadri, come negli IDE (vedi \`Dock\`). I riquadri
 * fissati stanno nella colonna; quelli sganciati hanno una linguetta sulla striscia del bordo e, aperti, galleggiano
 * sopra l'area centrale (gli elementi dei riquadri hanno \`edDockPanel\`). Chiusi restano nel documento (trasparenti e
 * senza eventi): un trascinamento partito dalla tavolozza continua anche se il riquadro si chiude. La larghezza della
 * colonna la decide il contenitore con \`Dock.columnWidth\`.
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
    '(keydown.escape)': 'escape()',
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
    /* Bordo interno da trascinare per cambiare la larghezza (doppio clic: larghezza prevista). */
    .splitter { position: absolute; top: 0; bottom: 0; z-index: 5; width: 7px; cursor: col-resize; touch-action: none; }
    :host(.left) .splitter { right: -4px; }
    :host(.right) .splitter { left: -4px; }
    .splitter::after { content: ''; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: transparent; transition: background 0.1s; }
    .splitter:hover::after, .splitter.dragging::after, .splitter:focus-visible::after { background: var(--lc-color-primary); width: 2px; left: 2px; }
    .splitter:focus-visible { outline: none; }
    /* Finestre strette: niente riquadri nascosti, si vedono sempre (vedi anche styles.scss). */
    @media (max-width: 1100px) {
      :host(.has-hidden) { overflow: hidden; }
      .strip, .splitter { display: none; }
      :host(.all-hidden) .dock { flex: 1; padding: 8px; }
    }
  `,
  template: `
    @if (hidden().length) {
      <!-- Riquadri nascosti automaticamente: una linguetta ciascuno, che apre il suo riquadro sopra l'area centrale. -->
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
  /** I riquadri del lato, nell'ordine in cui stanno (le linguette di quelli nascosti seguono lo stesso ordine). */
  readonly panels = input.required<DockTab[]>();
  /** Larghezza prevista dei riquadri (fissati, e aperti sopra l'area centrale). */
  readonly width = input(300);
  protected readonly dock = inject(Dock);
  protected readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly strip = DOCK_STRIP;
  /** I riquadri nascosti (con la linguetta). */
  protected readonly hidden = computed(() => this.panels().filter((p) => !this.dock.pinned[p.id]()));

  protected readonly min = DOCK_MIN_WIDTH;
  protected readonly max = DOCK_MAX_WIDTH;
  protected dragging = false;

  /** Trascinamento del bordo: la larghezza segue il puntatore (a destra il lato cresce verso sinistra). */
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

  /** Da tastiera: frecce di 16 px (verso l'area centrale allargano), Home e Fine ai limiti, Invio alla larghezza prevista. */
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
   * Il fuoco entra in un campo del lato (si sta scrivendo): il riquadro aperto resta aperto anche se il mouse esce.
   * Un pulsante (la puntina, un componente della tavolozza, un nodo della struttura) non lo trattiene.
   */
  protected focusIn(event: FocusEvent): void {
    this.dock.focus(this.side(), isEditable(event.target));
  }

  /** Il fuoco esce dal lato: il riquadro aperto si chiude, se anche il mouse è fuori. */
  protected focusOut(event: FocusEvent): void {
    const area = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node && area.contains(event.relatedTarget))) this.dock.blur(this.side());
  }

  /** Esc chiude il riquadro aperto e riporta il fuoco alla sua linguetta. */
  protected escape(): void {
    const open = this.dock.open();
    if (!open || PANEL_SIDE[open] !== this.side()) return;
    this.dock.hide();
    this.host.nativeElement.querySelector<HTMLElement>(`.tab[data-dock-tab="${open}"]`)?.focus();
  }

  /** Un componente trascinato dalla tavolozza aperta sopra l'anteprima: il riquadro si chiude per lasciare libero il disegno. */
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
