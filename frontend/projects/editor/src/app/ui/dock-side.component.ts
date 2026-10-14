import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { DOCK_MAX_WIDTH, DOCK_MIN_WIDTH, Dock, type DockSide } from './dock';

/** Una linguetta della striscia: il riquadro che il lato contiene. */
export interface DockTab {
  label: string;
  icon: string;
}

/**
 * Un lato dell'editor (schermata, navigazione, tema) che si può nascondere automaticamente, come negli IDE (vedi
 * `Dock`): fissato mostra i suoi riquadri; sganciato si riduce alla striscia delle linguette e i riquadri si aprono
 * sopra l'area centrale. Chiusi restano nel documento (trasparenti e senza eventi): un trascinamento partito dalla
 * tavolozza continua anche se il lato si chiude. Il contenitore riduce la colonna con la classe `<lato>-auto`.
 */
@Component({
  selector: 'ed-dock-side',
  imports: [NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'complementary',
    '[class.left]': "side() === 'left'",
    '[class.right]': "side() === 'right'",
    '[class.auto]': '!dock.pinned[side()]()',
    '[class.open]': 'dock.isOpen(side())',
    '[style.--ed-dock-width.px]': 'dock.width(side(), width())',
    '(pointerenter)': 'dock.pointer(side(), true)',
    '(pointerleave)': 'dock.pointer(side(), false)',
    '(keydown.escape)': 'escape()',
  },
  styles: `
    :host { position: relative; display: flex; min-height: 0; overflow: hidden; }
    :host(.right) { flex-direction: row-reverse; }
    .dock { flex: 1; min-width: 0; }
    :host(.auto) { z-index: 30; overflow: visible; }
    .strip { flex: none; display: flex; flex-direction: column; gap: 2px; width: 30px; padding: 6px 0; background: var(--lc-color-surface); }
    .tab {
      display: flex; align-items: center; gap: 6px; padding: 10px 0; border: 0; border-radius: var(--lc-radius); background: none;
      color: var(--lc-color-muted); font: inherit; font-size: 12px; font-weight: 600; writing-mode: vertical-rl; cursor: pointer;
    }
    .tab:hover, .tab[aria-expanded='true'] { color: var(--lc-color-primary); background: color-mix(in srgb, var(--lc-color-primary) 10%, transparent); }
    .tab:focus-visible { outline: 2px solid var(--lc-color-primary); outline-offset: -2px; }
    :host(.auto) .dock {
      position: absolute; top: 0; bottom: 0; display: flex; width: var(--ed-dock-width); box-shadow: 0 6px 24px rgb(0 0 0 / 22%);
      opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.12s ease, transform 0.12s ease, visibility 0s linear 0.12s;
    }
    :host(.left.auto) .dock { left: 30px; transform: translateX(-8px); }
    :host(.right.auto) .dock { right: 30px; transform: translateX(8px); }
    /* Bordo interno da trascinare per cambiare la larghezza (doppio clic: larghezza prevista). */
    .splitter { position: absolute; top: 0; bottom: 0; z-index: 5; width: 7px; cursor: col-resize; touch-action: none; }
    :host(.left) .splitter { right: -4px; }
    :host(.right) .splitter { left: -4px; }
    .splitter::after { content: ''; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: transparent; transition: background 0.1s; }
    .splitter:hover::after, .splitter.dragging::after, .splitter:focus-visible::after { background: var(--lc-color-primary); width: 2px; left: 2px; }
    .splitter:focus-visible { outline: none; }
    :host(.auto.open) .dock { opacity: 1; visibility: visible; pointer-events: auto; transform: none; transition: opacity 0.12s ease, transform 0.12s ease; }
    /* Finestre strette: niente lati nascosti, si vedono sempre (le puntine spariscono, vedi styles.scss). */
    @media (max-width: 1100px) {
      :host(.auto) { overflow: hidden; }
      .strip, .splitter { display: none; }
      :host(.auto) .dock { position: static; width: auto; box-shadow: none; opacity: 1; visibility: visible; pointer-events: auto; transform: none; }
    }
  `,
  template: `
    @if (!dock.pinned[side()]()) {
      <!-- Lato nascosto automaticamente: la striscia con le linguette, che aprono il lato sopra l'area centrale. -->
      <div class="strip" role="group" [attr.aria-label]="label()">
        @for (tab of tabs(); track tab.label) {
          <button type="button" class="tab" [attr.data-dock-tab]="side()" [attr.aria-expanded]="dock.isOpen(side())" [attr.aria-controls]="'ed-dock-' + side()" (click)="dock.toggle(side())">
            <span nz-icon [nzType]="tab.icon" aria-hidden="true"></span><span class="tab-label">{{ tab.label }}</span>
          </button>
        }
      </div>
    }
    @if (dock.pinned[side()]()) {
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
  /** Linguette della striscia, una per riquadro. */
  readonly tabs = input.required<DockTab[]>();
  /** Nome della striscia per i lettori di schermo. */
  readonly label = input('');
  /** Larghezza del lato aperto sopra l'area centrale (la stessa della colonna quando è fissato). */
  readonly width = input(300);
  protected readonly dock = inject(Dock);
  protected readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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
   * Il fuoco entra in un campo del lato (si sta scrivendo): resta aperto anche se il mouse esce. Un pulsante (la
   * puntina, un componente della tavolozza, un nodo della struttura) non lo trattiene.
   */
  protected focusIn(event: FocusEvent): void {
    this.dock.focus(this.side(), isEditable(event.target));
  }

  /** Il fuoco esce dal lato: si chiude, se anche il mouse è fuori. */
  protected focusOut(event: FocusEvent): void {
    const area = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node && area.contains(event.relatedTarget))) this.dock.blur(this.side());
  }

  /** Esc chiude il lato aperto e riporta il fuoco alla sua linguetta. */
  protected escape(): void {
    const side = this.side();
    if (this.dock.pinned[side]() || this.dock.open() !== side) return;
    this.dock.hide(side);
    this.host.nativeElement.querySelector<HTMLElement>('.tab')?.focus();
  }

  /** Un componente trascinato dalla tavolozza verso l'anteprima: il lato si chiude per lasciare libero il disegno. */
  protected dragStart(event: DragEvent): void {
    const side = this.side();
    if (this.dock.pinned[side]() || !(event.target instanceof Element) || !event.target.closest('ed-palette')) return;
    setTimeout(() => this.dock.dragAway(side));
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
