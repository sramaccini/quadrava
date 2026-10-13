/** Segno iniziale UTF-8 (BOM): senza, Excel apre il file con la codifica sbagliata. */
const BOM = String.fromCharCode(0xfeff);

/**
 * CSV per Excel in italiano: separatore punto e virgola, righe CRLF, BOM UTF-8. Ogni cella è testo tra virgolette
 * quando serve. Le celle che cominciano con = + - @ (o tabulazione e ritorno a capo) si fanno precedere da un apice:
 * un foglio di calcolo non le esegue come formule (CSV injection).
 */
export function toCsv(header: string[], rows: unknown[][]): string {
  const line = (cells: unknown[]) => cells.map(cell).join(';');
  return BOM + [line(header), ...rows.map(line)].join('\r\n') + '\r\n';
}

function cell(value: unknown): string {
  let text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Nome di file sicuro con estensione .csv. */
export function csvFileName(name: string | undefined): string {
  const base = (name ?? 'export').replace(/[^A-Za-z0-9 _.-]/g, '').trim() || 'export';
  return base.toLowerCase().endsWith('.csv') ? base : `${base}.csv`;
}

/** Le righe di una risposta: un elenco, oppure `items` di una risposta a pagine. */
export function rowsOf(data: unknown): Record<string, unknown>[] {
  const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : [];
  return list.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && !Array.isArray(r));
}

/** Fa scaricare un file al browser. */
export function downloadText(fileName: string, mime: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
