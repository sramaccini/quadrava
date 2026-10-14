import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, input, viewChild } from '@angular/core';
import { renderTokens, tokenizeJson, tokenizeTemplate } from './code-tokens';

/**
 * Visore di codice in sola lettura con la sintassi colorata: JSON (con le espressioni `{{ }}` evidenziate) o testo con
 * espressioni. I colori si cambiano con le variabili `--lc-code-*`; il testo si seleziona e si copia normalmente.
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
    /* Colori su bianco con contrasto almeno 4,5:1, sostituibili dal tema. */
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
  // Il <pre> si può raggiungere con Tab per scorrerlo con la tastiera.
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
      // renderTokens aggiunge uno spazio finale per le aree di testo; qui non serve.
      renderTokens(this.pre().nativeElement, text.endsWith('\n') ? text.slice(0, -1) : text, this.language() === 'json' ? tokenizeJson : tokenizeTemplate);
    });
  }
}
