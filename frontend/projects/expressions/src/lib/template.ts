/** Segmento di un modello di testo: testo fisso oppure espressione tra doppie graffe. */
export type TemplateSegment = { kind: 'text'; text: string } | { kind: 'expr'; source: string };

/**
 * Divide un modello come `Ordine {{row.numero}} di {{row.cliente}}` in segmenti.
 * Le doppie graffe dentro una stringa tra apici dell'espressione non chiudono l'espressione.
 * Lancia un errore se un'espressione non è chiusa.
 */
export function parseTemplate(template: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let text = '';
  let i = 0;
  while (i < template.length) {
    if (template.startsWith('{{', i)) {
      const end = findClosing(template, i + 2);
      if (end < 0) {
        throw new Error('espressione non chiusa: manca }}');
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
