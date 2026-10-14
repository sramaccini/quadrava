/**
 * Markdown ristretto per i testi formattati (componente `text` con `format: markdown`, campi `richtext`, formato
 * `markdown` di colonne e dettaglio). Il testo diventa una **struttura** (blocchi e frammenti), che i componenti
 * disegnano con i loro template: nessun HTML passa mai dal testo alla pagina, quindi anche un testo che arriva dai dati
 * è sicuro.
 *
 * Blocchi: paragrafi (righe consecutive; un a capo dentro un paragrafo resta un a capo), titoli `#`, `##`, `###`,
 * elenchi puntati (`-`, `*`, `+`) e numerati (`1.`), annidati con due spazi di rientro (fino a tre livelli),
 * citazioni (`>`). Frammenti: **grassetto**, *corsivo* o _corsivo_, ~~barrato~~, `codice`, [collegamenti](https://…)
 * (solo `https:`, `mailto:` o percorsi relativi `/…`; gli altri restano testo), `\` per scrivere un carattere speciale.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'break' }
  | { kind: 'strong' | 'em' | 'del'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; external: boolean; children: Inline[] };

export interface ListItem {
  content: Inline[];
  /** Elenco annidato sotto la voce. */
  list?: ListBlock;
}

export interface ListBlock {
  kind: 'list';
  ordered: boolean;
  /** Numero della prima voce (elenchi numerati). */
  start: number;
  items: ListItem[];
}

export type Block = { kind: 'paragraph'; content: Inline[] } | { kind: 'heading'; level: 1 | 2 | 3; content: Inline[] } | ListBlock | { kind: 'quote'; blocks: Block[] };

/** Testo che supera questa lunghezza si tronca: un testo formattato non è un documento. */
const MAX_LENGTH = 20_000;
const MAX_DEPTH = 3;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)]) +(.*)$/;

/** Il testo in blocchi. Non lancia mai eccezioni. */
export function parseMarkdown(source: string | null | undefined): Block[] {
  const text = String(source ?? '').slice(0, MAX_LENGTH).replace(/\r\n?/g, '\n');
  return parseBlocks(text.split('\n'), 0);
}

function parseBlocks(lines: string[], depth: number): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3}) +(.+?) *#* *$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, content: parseInline(heading[2]) });
      i++;
      continue;
    }
    if (/^ {0,3}> ?/.test(line) && depth < MAX_DEPTH) {
      const quoted: string[] = [];
      while (i < lines.length && /^ {0,3}> ?/.test(lines[i])) quoted.push(lines[i++].replace(/^ {0,3}> ?/, ''));
      blocks.push({ kind: 'quote', blocks: parseBlocks(quoted, depth + 1) });
      continue;
    }
    if (LIST_ITEM.test(line) && line.search(/\S/) < 2) {
      const { list, next } = parseList(lines, i, 0, 0);
      blocks.push(list);
      i = next;
      continue;
    }
    // Paragrafo: fino a una riga vuota o all'inizio di un altro blocco.
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !(paragraph.length && startsBlock(lines[i]))) paragraph.push(lines[i++].trim());
    blocks.push({ kind: 'paragraph', content: joinLines(paragraph) });
  }
  return blocks;
}

function startsBlock(line: string): boolean {
  return /^#{1,3} /.test(line) || /^ {0,3}> ?/.test(line) || (LIST_ITEM.test(line) && line.search(/\S/) < 2);
}

/** Righe di un paragrafo: frammenti con un a capo tra una riga e l'altra. */
function joinLines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((l, n) => {
    if (n > 0) out.push({ kind: 'break' });
    out.push(...parseInline(l));
  });
  return out;
}

/** Un elenco che comincia alla riga `start` con il rientro `indent`; si ferma quando il rientro diminuisce. */
function parseList(lines: string[], start: number, indent: number, level: number): { list: ListBlock; next: number } {
  const first = LIST_ITEM.exec(lines[start])!;
  const ordered = /\d/.test(first[2]);
  const list: ListBlock = { kind: 'list', ordered, start: ordered ? Number.parseInt(first[2], 10) : 1, items: [] };
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // Una riga vuota chiude l'elenco se dopo non continua.
      const after = lines[i + 1];
      if (after !== undefined && LIST_ITEM.test(after) && after.search(/\S/) >= indent) {
        i++;
        continue;
      }
      break;
    }
    const m = LIST_ITEM.exec(line);
    const lineIndent = line.search(/\S/);
    if (m && lineIndent === indent && /\d/.test(m[2]) === ordered) {
      list.items.push({ content: parseInline(m[3].trim()) });
      i++;
    } else if (m && lineIndent > indent && list.items.length && level + 1 < MAX_DEPTH) {
      const nested = parseList(lines, i, lineIndent, level + 1);
      list.items[list.items.length - 1].list = nested.list;
      i = nested.next;
    } else if (!m && lineIndent > indent && list.items.length) {
      // Continuazione della voce su una nuova riga rientrata.
      const item = list.items[list.items.length - 1];
      item.content.push({ kind: 'break' }, ...parseInline(line.trim()));
      i++;
    } else {
      break;
    }
  }
  return { list, next: i };
}

/** Indirizzo ammesso per un collegamento: https, mailto o percorso relativo della stessa applicazione. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https:\/\/[^\s<>"']+$/i.test(h)) return h;
  if (/^mailto:[^\s<>"']+@[^\s<>"']+$/i.test(h)) return h;
  if (/^\/(?!\/)[^\s<>"']*$/.test(h) && !h.split(/[/?#]/).includes('..')) return h;
  return null;
}

/** Frammenti di una riga: enfasi, codice, collegamenti; il resto è testo. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ kind: 'text', text: buffer });
    buffer = '';
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '\\' && i + 1 < source.length && /[\\`*_~[\]()#>+\-.!]/.test(source[i + 1])) {
      buffer += source[i + 1];
      i += 2;
      continue;
    }
    if (c === '`') {
      const end = source.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: 'code', text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    const delimiter = source.startsWith('**', i) ? '**' : source.startsWith('~~', i) ? '~~' : c === '*' || c === '_' ? c : null;
    if (delimiter) {
      const end = closing(source, delimiter, i + delimiter.length);
      if (end > i + delimiter.length) {
        flush();
        const kind = delimiter === '**' ? 'strong' : delimiter === '~~' ? 'del' : 'em';
        out.push({ kind, children: parseInline(source.slice(i + delimiter.length, end)) });
        i = end + delimiter.length;
        continue;
      }
    }
    if (c === '[') {
      const close = source.indexOf('](', i + 1);
      const end = close > i ? source.indexOf(')', close + 2) : -1;
      if (close > i && end > close) {
        const href = safeHref(source.slice(close + 2, end));
        if (href) {
          flush();
          out.push({ kind: 'link', href, external: /^https:/i.test(href), children: parseInline(source.slice(i + 1, close)) });
          i = end + 1;
          continue;
        }
      }
    }
    buffer += c;
    i++;
  }
  flush();
  return out;
}

/** Posizione del delimitatore di chiusura (non preceduto da spazio), o -1. Per `_` non dentro una parola. */
function closing(source: string, delimiter: string, from: number): number {
  if (/\s/.test(source[from] ?? ' ')) return -1;
  if (delimiter === '_' && /\w/.test(source[from - 2] ?? '')) return -1;
  let i = from;
  while (i < source.length) {
    const at = source.indexOf(delimiter, i);
    if (at < 0) return -1;
    if (source[at - 1] !== '\\' && !/\s/.test(source[at - 1])) {
      if (delimiter === '_' && /\w/.test(source[at + 1] ?? '')) {
        i = at + 1;
        continue;
      }
      // Un * singolo non deve chiudere su un ** (grassetto dentro il corsivo).
      if (delimiter === '*' && source[at + 1] === '*') {
        i = at + 2;
        continue;
      }
      // ***testo***: il grassetto chiude sugli ultimi due asterischi, il corsivo dentro su quello prima.
      if (delimiter === '**' && source[at + 2] === '*') return at + 1;
      return at;
    }
    i = at + 1;
  }
  return -1;
}

/** Il solo testo (senza formattazione), per riassunti, ricerche e lettori di schermo. */
export function markdownToPlain(source: string | null | undefined): string {
  const inline = (items: Inline[]): string => items.map((x) => (x.kind === 'text' || x.kind === 'code' ? x.text : x.kind === 'break' ? '\n' : inline(x.children))).join('');
  const block = (b: Block): string =>
    b.kind === 'list' ? b.items.map((it) => inline(it.content) + (it.list ? '\n' + block(it.list) : '')).join('\n') : b.kind === 'quote' ? b.blocks.map(block).join('\n') : inline(b.content);
  return parseMarkdown(source).map(block).join('\n');
}
