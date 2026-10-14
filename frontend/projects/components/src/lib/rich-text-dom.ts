import { parseMarkdown, type Block, type Inline } from 'core';

/**
 * Conversioni tra il Markdown ristretto (il valore dei campi `richtext`) e il contenuto modificabile dell'editor.
 *
 * - Da Markdown a contenuto: si costruiscono gli elementi uno per uno (`createElement`, `textContent`), mai con HTML.
 * - Da contenuto a Markdown: si leggono solo i tag ammessi (paragrafi, titoli, elenchi, citazioni, grassetto, corsivo,
 *   barrato, codice, collegamenti con indirizzo ammesso, a capo); tutto il resto vale per il suo testo. Così anche
 *   quello che il browser aggiunge mentre si scrive (div, span con stili) si riduce al formato ammesso.
 */

const HEADING_TAG: Record<1 | 2 | 3, string> = { 1: 'h3', 2: 'h4', 3: 'h5' };

/** Riempie `container` con il Markdown, sostituendo quello che c'era. */
export function renderMarkdownInto(container: HTMLElement, source: string | null | undefined): void {
  const doc = container.ownerDocument;
  container.replaceChildren();
  const blocks = parseMarkdown(source);
  for (const block of blocks) container.appendChild(blockNode(doc, block));
  // Un editor vuoto ha comunque un paragrafo in cui scrivere.
  if (blocks.length === 0) container.appendChild(doc.createElement('p')).appendChild(doc.createElement('br'));
}

function blockNode(doc: Document, block: Block): Node {
  switch (block.kind) {
    case 'paragraph':
      return inlineInto(doc.createElement('p'), block.content);
    case 'heading':
      return inlineInto(doc.createElement(HEADING_TAG[block.level]), block.content);
    case 'quote': {
      const quote = doc.createElement('blockquote');
      for (const b of block.blocks) quote.appendChild(blockNode(doc, b));
      return quote;
    }
    case 'list': {
      const list = doc.createElement(block.ordered ? 'ol' : 'ul');
      if (block.ordered && block.start !== 1) list.setAttribute('start', String(block.start));
      for (const item of block.items) {
        const li = inlineInto(doc.createElement('li'), item.content);
        if (item.list) li.appendChild(blockNode(doc, item.list));
        list.appendChild(li);
      }
      return list;
    }
  }
}

function inlineInto(parent: HTMLElement, items: Inline[]): HTMLElement {
  const doc = parent.ownerDocument;
  for (const item of items) {
    if (item.kind === 'text') parent.appendChild(doc.createTextNode(item.text));
    else if (item.kind === 'break') parent.appendChild(doc.createElement('br'));
    else if (item.kind === 'code') parent.appendChild(doc.createElement('code')).textContent = item.text;
    else if (item.kind === 'link') {
      const a = doc.createElement('a');
      a.setAttribute('href', item.href);
      parent.appendChild(inlineInto(a, item.children));
    } else parent.appendChild(inlineInto(doc.createElement(item.kind === 'strong' ? 'strong' : item.kind === 'em' ? 'em' : 's'), item.children));
  }
  return parent;
}

// --- da contenuto a Markdown ---

/** Caratteri che nel testo vanno protetti per non diventare formattazione. */
function escapeText(text: string): string {
  return text.replace(/([\\`*_~[\]])/g, '\\$1');
}

/** Protegge l'inizio di una riga che altrimenti diventerebbe un titolo, una citazione o una voce di elenco. */
function escapeLineStart(line: string): string {
  return line.replace(/^(\s*)(#{1,3} |> ?|[-+] |\d{1,9}[.)] )/, (_m, space: string, marker: string) => space + '\\' + marker);
}

/** Il contenuto dell'editor in Markdown ristretto. */
export function domToMarkdown(container: HTMLElement): string {
  const blocks: string[] = [];
  let pending: Node[] = [];
  const flushInline = () => {
    const text = inlineMarkdown(pending).trim();
    if (text) blocks.push(paragraph(text));
    pending = [];
  };
  for (const node of Array.from(container.childNodes)) {
    const block = blockMarkdown(node, 0);
    if (block === null) pending.push(node);
    else {
      flushInline();
      if (block) blocks.push(block);
    }
  }
  flushInline();
  return blocks.join('\n\n');
}

function paragraph(text: string): string {
  return text
    .split('\n')
    .map((l) => escapeLineStart(l.trim()))
    .join('\n');
}

/** Markdown di un nodo di blocco; null se il nodo è in linea (testo, enfasi…). */
function blockMarkdown(node: Node, depth: number): string | null {
  if (!(node instanceof Element)) return null;
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case 'p':
    case 'div':
      // Un div del browser può contenere altri blocchi (elenchi incollati, a capo): si legge come contenitore.
      return Array.from(node.childNodes).some((c) => blockMarkdown(c, depth) !== null) ? domToMarkdown(node as HTMLElement) : paragraph(inlineMarkdown(Array.from(node.childNodes)).trim());
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = tag === 'h4' ? 2 : tag === 'h5' || tag === 'h6' ? 3 : 1;
      const text = inlineMarkdown(Array.from(node.childNodes)).replace(/\n/g, ' ').trim();
      return text ? `${'#'.repeat(level)} ${text}` : '';
    }
    case 'blockquote':
      return domToMarkdown(node as HTMLElement)
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n');
    case 'ul':
    case 'ol':
      return listMarkdown(node, depth);
    default:
      return null;
  }
}

function listMarkdown(list: Element, depth: number): string {
  const ordered = list.tagName.toLowerCase() === 'ol';
  let n = ordered ? Number.parseInt(list.getAttribute('start') ?? '1', 10) || 1 : 1;
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  for (const child of Array.from(list.children)) {
    if (child.tagName.toLowerCase() !== 'li') continue;
    const inline: Node[] = [];
    const nested: string[] = [];
    for (const c of Array.from(child.childNodes)) {
      if (c instanceof Element && /^(ul|ol)$/i.test(c.tagName)) nested.push(listMarkdown(c, Math.min(depth + 1, 2)));
      else inline.push(c);
    }
    const text = inlineMarkdown(inline).replace(/\n+/g, ' ').trim();
    lines.push(`${indent}${ordered ? `${n++}.` : '-'} ${text}`, ...nested);
  }
  return lines.join('\n');
}

/** Markdown dei nodi in linea. */
function inlineMarkdown(nodes: Node[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Gli spazi non separabili che il browser mette mentre si scrive diventano spazi normali.
      out += escapeText((node.textContent ?? '').replace(/ /g, ' '));
      continue;
    }
    if (!(node instanceof Element)) continue;
    const tag = node.tagName.toLowerCase();
    const inner = () => inlineMarkdown(Array.from(node.childNodes));
    const wrap = (mark: string) => {
      const text = inner();
      // Gli spazi ai bordi restano fuori dai segni, altrimenti non sarebbero formattazione.
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
      return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : text;
    };
    if (tag === 'br') out += '\n';
    else if (tag === 'strong' || tag === 'b') out += wrap('**');
    else if (tag === 'em' || tag === 'i') out += wrap('*');
    else if (tag === 's' || tag === 'strike' || tag === 'del') out += wrap('~~');
    else if (tag === 'code') {
      const text = (node.textContent ?? '').replace(/`/g, '');
      out += text ? '`' + text + '`' : '';
    } else if (tag === 'a') {
      const href = node.getAttribute('href') ?? '';
      const text = inner();
      // Solo indirizzi ammessi; un collegamento verso altro resta testo.
      out += /^(https:\/\/|mailto:|\/(?!\/))/i.test(href) && !/[\s()<>]/.test(href) ? `[${text}](${href})` : text;
    } else {
      const block = blockMarkdown(node, 0);
      out += block !== null ? `\n${block}\n` : inner();
    }
  }
  return out;
}
