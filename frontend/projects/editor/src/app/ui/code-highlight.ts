import { DestroyRef, Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { renderTokens, tokenizeJson, tokenizeTemplate, type CodeToken } from 'components';

// I tokenizzatori stanno nella libreria dei componenti (li usa anche il visore del codice).
export { tokenizeJson, tokenizeTemplate, type CodeToken, type CodeTokenType } from 'components';

/** Il JSON colorato nell'elemento. */
export function renderJsonHighlight(target: HTMLElement, text: string): void {
  renderTokens(target, text, tokenizeJson, 'ed-code-');
}

/**
 * Colorazione della sintassi per un'area di testo: dietro la textarea (trasparente, che resta quella in cui si scrive,
 * con cursore, selezione, annulla e incolla del browser) un `<pre>` con lo stesso testo colorato, che segue lo
 * scorrimento. La textarea deve stare in un contenitore `.ed-code` (stili in styles.scss).
 */
@Directive()
abstract class HighlightLayer {
  protected abstract text(): string;
  protected abstract readonly tokenize: (text: string) => CodeToken[];
  private readonly area = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;
  private readonly pre = document.createElement('pre');

  constructor() {
    this.pre.className = 'ed-code-layer';
    this.pre.setAttribute('aria-hidden', 'true');
    inject(DestroyRef).onDestroy(() => this.pre.remove());
    afterRenderEffect(() => {
      if (!this.pre.isConnected) this.area.before(this.pre);
      renderTokens(this.pre, this.text(), this.tokenize, 'ed-code-');
      this.sync();
    });
  }

  /** Il testo colorato scorre con quello che si scrive. */
  protected sync(): void {
    this.pre.scrollTop = this.area.scrollTop;
    this.pre.scrollLeft = this.area.scrollLeft;
  }
}

/** JSON colorato: `<div class="ed-code"><textarea [edJsonHighlight]="testo" …></textarea></div>`. */
@Directive({ selector: 'textarea[edJsonHighlight]', host: { '(scroll)': 'sync()' } })
export class JsonHighlightDirective extends HighlightLayer {
  readonly edJsonHighlight = input.required<string>();
  protected readonly tokenize = tokenizeJson;
  protected text(): string {
    return this.edJsonHighlight();
  }
}

/** Testo con espressioni `{{ }}` colorato: `<div class="ed-code"><textarea [edTemplateHighlight]="testo" …>`. */
@Directive({ selector: 'textarea[edTemplateHighlight]', host: { '(scroll)': 'sync()' } })
export class TemplateHighlightDirective extends HighlightLayer {
  readonly edTemplateHighlight = input.required<string>();
  protected readonly tokenize = tokenizeTemplate;
  protected text(): string {
    return this.edTemplateHighlight();
  }
}
