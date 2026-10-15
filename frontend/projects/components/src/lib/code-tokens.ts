/*
 * Syntax highlighting of JSON and of texts with `{{ }}` expressions: it splits the text into pieces and draws them with
 * elements and `textContent` (never HTML). Used by the code viewer (`lc-code-view`) and by the editor's text areas.
 */

/** Kinds of piece, each with its colour (classes `<prefix><kind>`: `lc-code-` in the viewer, `ed-code-` in the editor). */
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
/** Beyond this length nothing is highlighted (the text stays normal): the editor must stay responsive. */
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
 * Splits a JSON text (also invalid, while it is being typed) into pieces to highlight: keys, strings, numbers,
 * `true`/`false`/`null`, punctuation; inside strings the `{{ … }}` expressions have a piece of their own. The text
 * of the pieces, put in a row, is exactly the original one.
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
      // A string followed by «:» is a key.
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

/** A JSON string, with the `{{ … }}` expressions separated. */
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
 * Splits a property text (titles, messages, conditions) into pieces to highlight: the fixed text stays normal;
 * inside `{{ … }}` (also not yet closed, while it is being typed) the parts of the CEL expression: functions, variables
 * and their properties, quoted strings, numbers, `true`/`false`/`null`, operators and punctuation, plus the braces.
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

/** The body of a CEL expression. */
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

/** Draws the pieces in the element: only built elements and `textContent`, never HTML. */
export function renderTokens(target: HTMLElement, text: string, tokenize: (text: string) => CodeToken[], prefix = 'lc-code-'): void {
  const fragment = document.createDocumentFragment();
  if (text.length > MAX_HIGHLIGHT) fragment.append(text);
  else {
    for (const token of tokenize(text)) {
      if (token.type === 'plain') {
        fragment.append(token.text);
        continue;
      }
      const span = document.createElement('span');
      span.className = prefix + token.type;
      span.textContent = token.text;
      fragment.append(span);
    }
  }
  // A space after a final line break, otherwise the last empty line takes no height and the text shifts.
  fragment.append(text.endsWith('\n') || text === '' ? ' ' : '');
  target.replaceChildren(fragment);
}
