/** UTF-8 byte order mark (BOM): without it, Excel opens the file with the wrong encoding. */
const BOM = String.fromCharCode(0xfeff);

/**
 * CSV for Excel in European locales: semicolon separator, CRLF lines, UTF-8 BOM. Every cell is quoted text
 * when needed. Cells starting with = + - @ (or tab and carriage return) get a leading apostrophe:
 * a spreadsheet does not run them as formulas (CSV injection).
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

/** Safe file name with the .csv extension. */
export function csvFileName(name: string | undefined): string {
  const base = (name ?? 'export').replace(/[^A-Za-z0-9 _.-]/g, '').trim() || 'export';
  return base.toLowerCase().endsWith('.csv') ? base : `${base}.csv`;
}

/** The rows of a response: a list, or the `items` of a paged response. */
export function rowsOf(data: unknown): Record<string, unknown>[] {
  const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : [];
  return list.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && !Array.isArray(r));
}

/** Makes the browser download a file. */
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
