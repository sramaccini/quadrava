/** Segment of a text template: fixed text or an expression in double braces. */
export type TemplateSegment = { kind: 'text'; text: string } | { kind: 'expr'; source: string };

/**
 * Splits a template such as `Order {{row.number}} of {{row.customer}}` into segments.
 * Double braces inside a quoted string of the expression do not close the expression.
 * Throws an error if an expression is not closed.
 */
export function parseTemplate(template: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let text = '';
  let i = 0;
  while (i < template.length) {
    if (template.startsWith('{{', i)) {
      const end = findClosing(template, i + 2);
      if (end < 0) {
        throw new Error('unclosed expression: }} is missing');
      }
      if (text) {
        segments.push({ kind: 'text', text });
        text = '';
      }
      segments.push({ kind: 'expr', source: template.slice(i + 2, end).trim() });
      i = end + 2;
    } else {
      text += template[i];
      i++;
    }
  }
  if (text) {
    segments.push({ kind: 'text', text });
  }
  return segments;
}

function findClosing(template: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < template.length; i++) {
    const c = template[i];
    if (quote) {
      if (c === '\\') {
        i++;
      } else if (c === quote) {
        quote = null;
      }
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === '}' && template[i + 1] === '}') {
      return i;
    }
  }
  return -1;
}
