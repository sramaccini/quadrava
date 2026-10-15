import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { I18n } from 'core';
import { isFromPreview, type DropZone, type PreviewEvent, type PreviewState, type ResizeProperty, type ToPreview } from './protocol';

/**
 * The preview as seen from the editor: an isolated iframe with the application started as the preview. It sends it the state
 * to draw (at every change, and again when the iframe declares itself ready) and receives selections and events. The address
 * is the editor itself with `?preview` (PREVIEW_QUERY). It accepts messages only from its own iframe and the same origin.
 * With a fixed width (tablet, phone) larger than the available space the page shrinks to fit, as
 * in the device toolbar of Chrome: it stays as wide as the device (same breakpoints), only smaller,
 * and the percentage shows in a corner. Before, it overflowed the frame, cut on the right.
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
      src="./?preview"
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
  /** Width in pixels; null = all the space. */
  readonly width = input<number | null>(null);
  /** A component chosen in the preview (Alt+click or selection mode): its id. */
  readonly selected = output<string>();
  readonly logged = output<PreviewEvent>();
  /** A palette component dropped on the drawing. */
  readonly dropped = output<{ kind: string; targetId: string | null; zone: DropZone }>();
  /** A component already there moved on the drawing. */
  readonly moved = output<{ id: string; targetId: string | null; zone: DropZone }>();
  /** A component resized with the handle. */
  readonly resized = output<{ id: string; property: ResizeProperty; value: number }>();

  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');
  private readonly ready = signal(false);
  /** Width available for the preview (updated when window or sides change). */
  private readonly available = signal<number | null>(null);
  /** Reduction to fit a fixed width in the available space (1 = none). */
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
        // A reloaded iframe also starts from zero: the state is sent to it again.
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
