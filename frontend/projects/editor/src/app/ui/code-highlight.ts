import { DestroyRef, Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';

/** Tipi di pezzo, ognuno con il suo colore (classi `ed-code-<tipo>` in styles.scss). */
export type CodeTokenType =
  | 'key'
  | 'string'
  | 'number'
  | 'literal'
  | 'punctuation'
  | 'expression'
  | 'delimiter'
  | 'function'
  | 'variable'
  | 'property'
  | 'operator'
  | 'plain';
export interface CodeToken {
  type: CodeTokenType;
  text: string;
}

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const LITERAL = /^(?:true|false|null)\b/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
/** Oltre questa lunghezza non si colora (il testo resta normale): l'editor deve restare reattivo. */
const MAX_HIGHLIGHT = 400_000;

function collector(): { tokens: CodeToken[]; push: (type: CodeTokenType, value: string) => void } {
  const tokens: CodeToken[] = [];
  const push = (type: CodeTokenType, value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last && last.type === type && (type === 'plain' || type === 'punctuation' || type === 'operator')) last.text += value;
    else tokens.push({ type, text: value });
  };
  return { tokens, push };
}

/**
 * Divide un testo JSON (anche non valido, mentre lo si scrive) in pezzi da colorare: chiavi, stringhe, numeri,
 * `true`/`false`/`null`, punteggiatura; dentro le stringhe le espressioni `{{ … }}` hanno un pezzo a sé. Il testo
 * dei pezzi, messo in fila, è esattamente quello di partenza.
 */
export function tokenizeJson(text: string): CodeToken[] {
  const { tokens, push } = collector();
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
      else pushJsonString(value, push);
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

/** Una stringa JSON, con le espressioni `{{ … }}` separate. */
function pushJsonString(value: string, push: (type: CodeTokenType, value: string) => void): void {
  let rest = value;
  for (;;) {
    const start = rest.indexOf('{{');
    const end = start < 0 ? -1 : rest.indexOf('}}', start + 2);
    if (start < 0 || end < 0) break;
    push('string', rest.slice(0, start));
    push('expression', rest.slice(start, end + 2));
    rest = rest.slice(end + 2);
  }
  push('string', rest);
}

/**
 * Divide un testo delle proprietà (titoli, messaggi, condizioni) in pezzi da colorare: il testo fisso resta normale;
 * dentro `{{ … }}` (anche non ancora chiusa, mentre la si scrive) le parti dell'espressione CEL: funzioni, variabili
 * e loro proprietà, stringhe tra apici, numeri, `true`/`false`/`null`, operatori e punteggiatura, più le graffe.
 */
export function tokenizeTemplate(text: string): CodeToken[] {
  const { tokens, push } = collector();
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('{{', i);
    if (start < 0) {
      push('plain', text.slice(i));
      break;
    }
    push('plain', text.slice(i, start));
    push('delimiter', '{{');
    const close = text.indexOf('}}', start + 2);
    const end = close < 0 ? text.length : close;
    pushExpression(text.slice(start + 2, end), push);
    if (close >= 0) push('delimiter', '}}');
    i = close < 0 ? text.length : close + 2;
  }
  return tokens;
}

/** Il corpo di un'espressione CEL. */
function pushExpression(text: string, push: (type: CodeTokenType, value: string) => void): void {
  let i = 0;
  let afterDot = false;
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      push('string', text.slice(i, Math.min(j + 1, text.length)));
      i = Math.min(j + 1, text.length);
      afterDot = false;
    } else if (c >= '0' && c <= '9') {
      const value = NUMBER.exec(text.slice(i, i + 40))?.[0] || c;
      push('number', value);
      i += value.length;
      afterDot = false;
    } else if (IDENTIFIER.test(c)) {
      const name = IDENTIFIER.exec(text.slice(i))![0];
      let k = i + name.length;
      while (text[k] === ' ') k++;
      const type: CodeTokenType = afterDot
        ? text[k] === '(' ? 'function' : 'property'
        : text[k] === '('
          ? 'function'
          : name === 'true' || name === 'false' || name === 'null'
            ? 'literal'
            : name === 'in'
              ? 'operator'
              : 'variable';
      push(type, name);
      i += name.length;
      afterDot = false;
    } else if (c === '.') {
      push('punctuation', c);
      i++;
      afterDot = true;
    } else if ('()[]{},'.includes(c)) {
      push('punctuation', c);
      i++;
      afterDot = false;
    } else if ('!=<>&|+-*/%?:'.includes(c)) {
      push('operator', c);
      i++;
      afterDot = false;
    } else {
      push('plain', c);
      i++;
    }
  }
}

/** Disegna i pezzi nell'elemento: solo elementi costruiti e `textContent`, mai HTML. */
export function renderTokens(target: HTMLElement, text: string, tokenize: (text: string) => CodeToken[]): void {
  const fragment = document.createDocumentFragment();
  if (text.length > MAX_HIGHLIGHT) fragment.append(text);
  else {
    for (const token of tokenize(text)) {
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

/** Il JSON colorato nell'elemento. */
export function renderJsonHighlight(target: HTMLElement, text: string): void {
  renderTokens(target, text, tokenizeJson);
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
      renderTokens(this.pre, this.text(), this.tokenize);
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
