/**
 * Restricted Markdown for formatted texts (`text` component with `format: markdown`, `richtext` fields, `markdown`
 * format of columns and detail). The text becomes a **structure** (blocks and fragments) that the components draw
 * with their templates: no HTML ever goes from the text to the page, so even a text coming from the data is
 * safe.
 *
 * Blocks: paragraphs (consecutive lines; a line break inside a paragraph stays a line break), headings `#`, `##`, `###`,
 * bulleted (`-`, `*`, `+`) and numbered (`1.`) lists, nested with two spaces of indentation (up to three levels),
 * quotes (`>`). Fragments: **bold**, *italic* or _italic_, ~~strikethrough~~, `code`, [links](https://…)
 * (only `https:`, `mailto:` or relative paths `/…`; the others stay text), `\` to write a special character.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'break' }
  | { kind: 'strong' | 'em' | 'del'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; external: boolean; children: Inline[] };

export interface ListItem {
  content: Inline[];
  /** List nested under the item. */
  list?: ListBlock;
}

export interface ListBlock {
  kind: 'list';
  ordered: boolean;
  /** Number of the first item (numbered lists). */
  start: number;
  items: ListItem[];
}

export type Block = { kind: 'paragraph'; content: Inline[] } | { kind: 'heading'; level: 1 | 2 | 3; content: Inline[] } | ListBlock | { kind: 'quote'; blocks: Block[] };

/** Text longer than this is truncated: a formatted text is not a document. */
const MAX_LENGTH = 20_000;
const MAX_DEPTH = 3;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)]) +(.*)$/;

/** The text as blocks. It never throws. */
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
    // Paragraph: up to an empty line or to the start of another block.
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !(paragraph.length && startsBlock(lines[i]))) paragraph.push(lines[i++].trim());
    blocks.push({ kind: 'paragraph', content: joinLines(paragraph) });
  }
  return blocks;
}

function startsBlock(line: string): boolean {
  return /^#{1,3} /.test(line) || /^ {0,3}> ?/.test(line) || (LIST_ITEM.test(line) && line.search(/\S/) < 2);
}

/** Lines of a paragraph: fragments with a line break between one line and the next. */
function joinLines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((l, n) => {
    if (n > 0) out.push({ kind: 'break' });
    out.push(...parseInline(l));
  });
  return out;
}

/** A list that starts at line `start` with indentation `indent`; it stops when the indentation decreases. */
function parseList(lines: string[], start: number, indent: number, level: number): { list: ListBlock; next: number } {
  const first = LIST_ITEM.exec(lines[start])!;
  const ordered = /\d/.test(first[2]);
  const list: ListBlock = { kind: 'list', ordered, start: ordered ? Number.parseInt(first[2], 10) : 1, items: [] };
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // An empty line closes the list if it does not go on afterwards.
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
      // Continuation of the item on a new indented line.
      const item = list.items[list.items.length - 1];
      item.content.push({ kind: 'break' }, ...parseInline(line.trim()));
      i++;
    } else {
      break;
    }
  }
  return { list, next: i };
}

/** Address allowed for a link: https, mailto or a relative path of the same application. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https:\/\/[^\s<>"']+$/i.test(h)) return h;
  if (/^mailto:[^\s<>"']+@[^\s<>"']+$/i.test(h)) return h;
  if (/^\/(?!\/)[^\s<>"']*$/.test(h) && !h.split(/[/?#]/).includes('..')) return h;
  return null;
}

/** Fragments of a line: emphasis, code, links; the rest is text. */
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

/** Position of the closing delimiter (not preceded by a space), or -1. For `_` not inside a word. */
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
      // A single * must not close on a ** (bold inside italic).
      if (delimiter === '*' && source[at + 1] === '*') {
        i = at + 2;
        continue;
      }
      // ***text***: bold closes on the last two asterisks, the italic inside on the one before.
      if (delimiter === '**' && source[at + 2] === '*') return at + 1;
      return at;
    }
    i = at + 1;
  }
  return -1;
}

/** The text only (without formatting), for summaries, searches and screen readers. */
export function markdownToPlain(source: string | null | undefined): string {
  const inline = (items: Inline[]): string => items.map((x) => (x.kind === 'text' || x.kind === 'code' ? x.text : x.kind === 'break' ? '\n' : inline(x.children))).join('');
  const block = (b: Block): string =>
    b.kind === 'list' ? b.items.map((it) => inline(it.content) + (it.list ? '\n' + block(it.list) : '')).join('\n') : b.kind === 'quote' ? b.blocks.map(block).join('\n') : inline(b.content);
  return parseMarkdown(source).map(block).join('\n');
}
