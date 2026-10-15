/**
 * Message formatter, a subset of ICU MessageFormat:
 * - segnaposto semplice: `Ciao {nome}`;
 * - plurals: `{n, plural, =0 {no invoices} one {# invoice} other {# invoices}}` (`#` is the formatted number);
 * - scelta: `{genere, select, f {Gentile} other {Gentile}}`;
 * - numero: `{importo, number}`.
 * Literal braces are written `\{` and `\}`. It never throws: if the message is malformed it returns the original text.
 * The result is always plain text (never HTML): the values of the placeholders are not interpreted.
 */
export function formatMessage(pattern: string, params: Record<string, unknown> = {}, locale = 'it'): string {
  if (!pattern.includes('{') && !pattern.includes('\\')) return pattern;
  try {
    return render(pattern, params, locale, undefined);
  } catch {
    return pattern;
  }
}

function render(src: string, params: Record<string, unknown>, locale: string, hash: string | undefined): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\' && (src[i + 1] === '{' || src[i + 1] === '}')) {
      out += src[++i];
    } else if (c === '{') {
      const close = findClose(src, i);
      out += renderArgument(src.slice(i + 1, close), params, locale);
      i = close;
    } else if (c === '#' && hash !== undefined) {
      out += hash;
    } else {
      out += c;
    }
  }
  return out;
}

function findClose(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return i;
  }
  throw new Error('unclosed brace');
}

function renderArgument(inner: string, params: Record<string, unknown>, locale: string): string {
  const first = inner.indexOf(',');
  const name = (first < 0 ? inner : inner.slice(0, first)).trim();
  const value = Object.prototype.hasOwnProperty.call(params, name) ? params[name] : undefined;
  if (first < 0) return value === undefined || value === null ? `{${name}}` : String(value);
  const rest = inner.slice(first + 1);
  const second = rest.indexOf(',');
  const kind = (second < 0 ? rest : rest.slice(0, second)).trim();
  const options = second < 0 ? '' : rest.slice(second + 1);
  if (kind === 'number') return typeof value === 'number' || value !== undefined ? new Intl.NumberFormat(locale).format(Number(value)) : `{${name}}`;
  const table = parseOptions(options);
  if (kind === 'select') return render(table.get(String(value)) ?? table.get('other') ?? '', params, locale, undefined);
  if (kind === 'plural') {
    const n = Number(value);
    if (!Number.isFinite(n)) return `{${name}}`;
    const body = table.get(`=${n}`) ?? table.get(new Intl.PluralRules(locale).select(n)) ?? table.get('other') ?? '';
    return render(body, params, locale, new Intl.NumberFormat(locale).format(n));
  }
  throw new Error(`unknown placeholder type: ${kind}`);
}

function parseOptions(src: string): Map<string, string> {
  const table = new Map<string, string>();
  let i = 0;
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) break;
    const start = i;
    while (i < src.length && !/[\s{]/.test(src[i])) i++;
    const selector = src.slice(start, i);
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== '{') throw new Error('corpo mancante');
    const close = findClose(src, i);
    table.set(selector, src.slice(i + 1, close));
    i = close + 1;
  }
  return table;
}
