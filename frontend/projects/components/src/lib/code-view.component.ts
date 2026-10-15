import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, input, viewChild } from '@angular/core';
import { renderTokens, tokenizeJson, tokenizeTemplate } from './code-tokens';

/**
 * Read-only code viewer with syntax highlighting: JSON (with the `{{ }}` expressions highlighted) or text with
 * expressions. Colours change with the `--lc-code-*` variables; the text is selected and copied normally.
 */
@Component({
  selector: 'lc-code-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; min-height: 0; }
    pre {
      margin: 0; padding: 12px 14px; overflow: auto; max-height: var(--lc-code-max-height, 60vh);
      font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; tab-size: 2; white-space: pre;
      color: var(--lc-color-on-surface); background: var(--lc-code-bg, var(--lc-color-surface));
      border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius, 6px);
    }
    pre:focus-visible { outline: 2px solid var(--lc-color-primary); outline-offset: 1px; }
    /* Colours on white with a contrast of at least 4.5:1, replaceable by the theme. */
    pre ::ng-deep .lc-code-key { color: var(--lc-code-key, #0b5cad); }
    pre ::ng-deep .lc-code-string { color: var(--lc-code-string, #1a7f37); }
    pre ::ng-deep .lc-code-number { color: var(--lc-code-number, #b35900); }
    pre ::ng-deep .lc-code-literal { color: var(--lc-code-literal, #8250df); font-weight: 600; }
    pre ::ng-deep .lc-code-punctuation { color: var(--lc-code-punctuation, #57606a); }
    pre ::ng-deep .lc-code-expression,
    pre ::ng-deep .lc-code-delimiter { color: var(--lc-code-expression, #9a3412); background: var(--lc-code-expression-bg, #fff1e0); border-radius: 3px; }
    pre ::ng-deep .lc-code-delimiter { font-weight: 600; }
    pre ::ng-deep .lc-code-function { color: var(--lc-code-function, #6639ba); }
    pre ::ng-deep .lc-code-variable { color: var(--lc-code-variable, #0b5cad); }
    pre ::ng-deep .lc-code-property { color: var(--lc-code-property, #0a3069); }
    pre ::ng-deep .lc-code-operator { color: var(--lc-code-operator, #b3261e); }
  `,
  // The <pre> can be reached with Tab to scroll it with the keyboard.
  template: `<pre #pre tabindex="0" [attr.aria-label]="label() || null"></pre>`,
})
export class CodeViewComponent {
  readonly code = input.required<string>();
  readonly language = input<'json' | 'template'>('json');
  readonly label = input('');
  private readonly pre = viewChild.required<ElementRef<HTMLPreElement>>('pre');

  constructor() {
    afterRenderEffect(() => {
      const text = this.code();
      // renderTokens adds a trailing space for text areas; not needed here.
      renderTokens(this.pre().nativeElement, text.endsWith('\n') ? text.slice(0, -1) : text, this.language() === 'json' ? tokenizeJson : tokenizeTemplate);
    });
  }
}
