import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { I18n } from 'core';
import { isFromPreview, type DropZone, type PreviewEvent, type PreviewState, type ResizeProperty, type ToPreview } from './protocol';

/**
 * L'anteprima vista dall'editor: un iframe isolato con l'applicazione avviata come anteprima. Gli manda lo stato
 * da disegnare (a ogni cambio, e di nuovo quando l'iframe si dichiara pronto) e riceve selezioni ed eventi. L'indirizzo
 * è l'editor stesso con `?anteprima` (PREVIEW_QUERY). Accetta messaggi solo dal proprio iframe e dalla stessa origine.
 * Con una larghezza fissa (tablet, telefono) più grande dello spazio disponibile la pagina si riduce per starci, come
 * nella barra dei dispositivi di Chrome: resta larga quanto il dispositivo (stessi punti di rottura), solo più piccola,
 * e la percentuale si vede in un angolo. Prima usciva dal riquadro, tagliata a destra.
 */
@Component({
  selector: 'ed-preview-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { position: relative; display: block; height: 100%; overflow: hidden; }
    iframe { display: block; width: 100%; height: 100%; margin: 0 auto; border: 0; background: var(--lc-color-background); }
    iframe.narrow { box-shadow: 0 0 0 1px var(--lc-color-border); }
    iframe.scaled { margin: 0; transform-origin: 0 0; }
    .zoom {
      position: absolute; top: 6px; right: 10px; padding: 1px 8px; border-radius: 10px; background: var(--lc-color-on-surface);
      color: var(--lc-color-surface); font-size: 11px; opacity: 0.75; pointer-events: none;
    }
  `,
  template: `
    <iframe
      #frame
      src="./?anteprima"
      [title]="i18n.t('ed.tabs.preview')"
      [style.width.px]="width()"
      [style.height]="scale() < 1 ? 'calc(100% / ' + scale() + ')' : null"
      [style.transform]="scale() < 1 ? 'scale(' + scale() + ')' : null"
      [class.narrow]="width() !== null"
      [class.scaled]="scale() < 1"
    ></iframe>
    @if (scale() < 1) {
      <span class="zoom" role="status">{{ i18n.t('ed.preview.scaled', { n: percent() }) }}</span>
    }
  `,
})
export class PreviewFrameComponent {
  protected readonly i18n = inject(I18n);
  readonly state = input.required<PreviewState>();
  /** Larghezza in pixel; null = tutto lo spazio. */
  readonly width = input<number | null>(null);
  /** Un componente scelto nell'anteprima (Alt+clic o modalità selezione): il suo id. */
  readonly selected = output<string>();
  readonly logged = output<PreviewEvent>();
  /** Un componente della tavolozza rilasciato sul disegno. */
  readonly dropped = output<{ kind: string; targetId: string | null; zone: DropZone }>();
  /** Un componente già presente spostato sul disegno. */
  readonly moved = output<{ id: string; targetId: string | null; zone: DropZone }>();
  /** Un componente ridimensionato con la maniglia. */
  readonly resized = output<{ id: string; property: ResizeProperty; value: number }>();

  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');
  private readonly ready = signal(false);
  /** Larghezza disponibile per l'anteprima (si aggiorna quando cambiano finestra o lati). */
  private readonly available = signal<number | null>(null);
  /** Riduzione per far stare una larghezza fissa nello spazio disponibile (1 = nessuna). */
  protected readonly scale = computed(() => {
    const width = this.width();
    const available = this.available();
    return width && available && width > available ? Math.max(0.2, available / width) : 1;
  });
  protected readonly percent = computed(() => Math.round(this.scale() * 100));

  constructor() {
    const listener = (event: MessageEvent): void => {
      const target = this.frame().nativeElement.contentWindow;
      if (event.origin !== location.origin || !target || event.source !== target || !isFromPreview(event.data)) return;
      const message = event.data;
      if (message.type === 'lc-preview:ready') {
        // Anche un iframe ricaricato riparte da zero: gli si rimanda lo stato.
        this.ready.set(true);
        this.post();
      } else if (message.type === 'lc-preview:select') this.selected.emit(message.id);
      else if (message.type === 'lc-preview:drop') this.dropped.emit({ kind: message.kind, targetId: message.targetId, zone: message.zone });
      else if (message.type === 'lc-preview:move') this.moved.emit({ id: message.id, targetId: message.targetId, zone: message.zone });
      else if (message.type === 'lc-preview:resize') this.resized.emit({ id: message.id, property: message.property, value: message.value });
      else this.logged.emit(message.event);
    };
    window.addEventListener('message', listener);
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => window.removeEventListener('message', listener));

    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(([entry]) => this.available.set(Math.floor(entry.contentRect.width)));
      observer.observe(host);
      destroy.onDestroy(() => observer.disconnect());
    }

    effect(() => {
      this.state();
      if (this.ready()) this.post();
    });
  }

  private post(): void {
    const target = this.frame().nativeElement.contentWindow;
    const message: ToPreview = { type: 'lc-preview:state', state: this.state() };
    target?.postMessage(message, location.origin);
  }
}
