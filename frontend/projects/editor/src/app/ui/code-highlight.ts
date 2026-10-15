import { DestroyRef, Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { renderTokens, tokenizeJson, tokenizeTemplate, type CodeToken } from 'components';

// The tokenizers live in the components library (the code viewer uses them too).
export { tokenizeJson, tokenizeTemplate, type CodeToken, type CodeTokenType } from 'components';

/** The coloured JSON in the element. */
export function renderJsonHighlight(target: HTMLElement, text: string): void {
  renderTokens(target, text, tokenizeJson, 'ed-code-');
}

/**
 * Syntax highlighting for a text area: behind the textarea (transparent, which stays the one typed in,
 * with the browser's cursor, selection, undo and paste) a `<pre>` with the same coloured text, which follows the
 * scrolling. The textarea must be in a `.ed-code` container (styles in styles.scss).
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

  /** The coloured text scrolls with what is typed. */
  protected sync(): void {
    this.pre.scrollTop = this.area.scrollTop;
    this.pre.scrollLeft = this.area.scrollLeft;
  }
}

/** Coloured JSON: `<div class="ed-code"><textarea [edJsonHighlight]="text" …></textarea></div>`. */
@Directive({ selector: 'textarea[edJsonHighlight]', host: { '(scroll)': 'sync()' } })
export class JsonHighlightDirective extends HighlightLayer {
  readonly edJsonHighlight = input.required<string>();
  protected readonly tokenize = tokenizeJson;
  protected text(): string {
    return this.edJsonHighlight();
  }
}

/** Text with `{{ }}` expressions coloured: `<div class="ed-code"><textarea [edTemplateHighlight]="text" …>`. */
@Directive({ selector: 'textarea[edTemplateHighlight]', host: { '(scroll)': 'sync()' } })
export class TemplateHighlightDirective extends HighlightLayer {
  readonly edTemplateHighlight = input.required<string>();
  protected readonly tokenize = tokenizeTemplate;
  protected text(): string {
    return this.edTemplateHighlight();
  }
}
