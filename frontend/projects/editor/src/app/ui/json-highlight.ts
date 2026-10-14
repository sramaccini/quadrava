import { DestroyRef, Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

/** Tipi di pezzo del testo JSON, ognuno con il suo colore (classi `ed-code-<tipo>` in styles.scss). */
export type JsonTokenType = 'key' | 'string' | 'number' | 'literal' | 'punctuation' | 'expression' | 'plain';
export interface JsonToken {
  type: JsonTokenType;
  text: string;
}

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const LITERAL = /^(?:true|false|null)\b/;
/** Oltre questa lunghezza non si colora (il testo resta normale): l'editor deve restare reattivo. */
const MAX_HIGHLIGHT = 400_000;

/**
 * Divide un testo JSON (anche non valido, mentre lo si scrive) in pezzi da colorare: chiavi, stringhe, numeri,
 * `true`/`false`/`null`, punteggiatura; dentro le stringhe le espressioni `{{ … }}` hanno un pezzo a sé. Il testo
 * dei pezzi, messo in fila, è esattamente quello di partenza.
 */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const push = (type: JsonTokenType, value: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.type === type && (type === 'plain' || type === 'punctuation')) last.text += value;
    else tokens.push({ type, text: value });
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"' && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      const end = Math.min(j + 1, text.length);
      const value = text.slice(i, end);
      // Una stringa seguita da «:» è una chiave.
      let k = end;
      while (k < text.length && (text[k] === ' ' || text[k] === '\t')) k++;
      if (text[k] === ':') push('key', value);
      else pushString(value, push);
      i = end;
    } else if ('{}[],:'.includes(c)) {
      push('punctuation', c);
      i++;
    } else if (c === '-' || (c >= '0' && c <= '9')) {
      const match = NUMBER.exec(text.slice(i, i + 40));
      const value = match?.[0] || c;
      push(match ? 'number' : 'plain', value);
      i += value.length;
    } else {
      const match = c === 't' || c === 'f' || c === 'n' ? LITERAL.exec(text.slice(i, i + 6)) : null;
      if (match) {
        push('literal', match[0]);
        i += match[0].length;
      } else {
        push('plain', c);
        i++;
      }
    }
  }
  return tokens;
}

/** Una stringa, con le espressioni `{{ … }}` separate. */
function pushString(value: string, push: (type: JsonTokenType, value: string) => void): void {
  let rest = value;
  for (;;) {
    const start = rest.indexOf('{{');
    const end = start < 0 ? -1 : rest.indexOf('}}', start + 2);
    if (start < 0 || end < 0) break;
    if (start > 0) push('string', rest.slice(0, start));
    push('expression', rest.slice(start, end + 2));
    rest = rest.slice(end + 2);
  }
  if (rest) push('string', rest);
}

/** Disegna il testo colorato nell'elemento: solo elementi costruiti e `textContent`, mai HTML. */
export function renderJsonHighlight(target: HTMLElement, text: string): void {
  const fragment = document.createDocumentFragment();
  if (text.length > MAX_HIGHLIGHT) fragment.append(text);
  else {
    for (const token of tokenizeJson(text)) {
      if (token.type === 'plain') {
        fragment.append(token.text);
        continue;
      }
      const span = document.createElement('span');
      span.className = 'ed-code-' + token.type;
      span.textContent = token.text;
      fragment.append(span);
    }
  }
  // Uno spazio dopo un a capo finale, altrimenti l'ultima riga vuota non occupa altezza e il testo si sfasa.
  fragment.append(text.endsWith('\n') || text === '' ? ' ' : '');
  target.replaceChildren(fragment);
}

/**
 * Colorazione della sintassi per un'area di testo JSON: dietro la textarea (trasparente, che resta quella in cui si
 * scrive, con cursore, selezione, annulla e incolla del browser) un `<pre>` con lo stesso testo colorato, che segue
 * lo scorrimento. La textarea deve stare in un contenitore `.ed-code` (stili in styles.scss).
 *
 * Uso: `<div class="ed-code"><textarea [edJsonHighlight]="testo" …></textarea></div>`.
 */
@Directive({
  selector: 'textarea[edJsonHighlight]',
  host: { '(scroll)': 'sync()' },
})
export class JsonHighlightDirective {
  /** Il testo attuale dell'area (lo stesso della textarea). */
  readonly edJsonHighlight = input.required<string>();
  private readonly area = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;
  private readonly pre = document.createElement('pre');

  constructor() {
    this.pre.className = 'ed-code-layer';
    this.pre.setAttribute('aria-hidden', 'true');
    inject(DestroyRef).onDestroy(() => this.pre.remove());
    afterRenderEffect(() => {
      if (!this.pre.isConnected) this.area.before(this.pre);
      renderJsonHighlight(this.pre, this.edJsonHighlight());
      this.sync();
    });
  }

  /** Il testo colorato scorre con quello che si scrive. */
  protected sync(): void {
    this.pre.scrollTop = this.area.scrollTop;
    this.pre.scrollLeft = this.area.scrollLeft;
  }
}
