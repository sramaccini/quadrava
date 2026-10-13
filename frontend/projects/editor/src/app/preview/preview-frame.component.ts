import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { I18n } from 'core';
import { isFromPreview, type PreviewEvent, type PreviewState, type ToPreview } from './protocol';

/**
 * L'anteprima vista dall'editor: un iframe isolato con l'applicazione avviata come anteprima. Gli manda lo stato
 * da disegnare (a ogni cambio, e di nuovo quando l'iframe si dichiara pronto) e riceve selezioni ed eventi. L'indirizzo
 * è l'editor stesso con `?anteprima` (PREVIEW_QUERY). Accetta messaggi solo dal proprio iframe e dalla stessa origine.
 */
@Component({
  selector: 'ed-preview-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; height: 100%; }
    iframe { display: block; width: 100%; height: 100%; margin: 0 auto; border: 0; background: var(--lc-color-background); }
    iframe.narrow { box-shadow: 0 0 0 1px var(--lc-color-border); }
  `,
  template: `
    <iframe
      #frame
      src="./?anteprima"
      [title]="i18n.t('ed.tabs.preview')"
      [style.width.px]="width()"
      [class.narrow]="width() !== null"
    ></iframe>
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

  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');
  private readonly ready = signal(false);

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
      else this.logged.emit(message.event);
    };
    window.addEventListener('message', listener);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('message', listener));

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
