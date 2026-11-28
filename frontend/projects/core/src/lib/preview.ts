import type { PreviewStep } from 'schema';
import { lastPathSegment } from './download';
import type { PreviewFile } from './ports';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/** Address of a file that can be shown: a path of the same application, without `..`. */
export function previewAddress(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!/^\/(?!\/)[^\s<>"'\\]*$/.test(url) || url.split(/[?#]/)[0].split('/').includes('..')) return null;
  return url;
}

/** Image, PDF or neither: from the type of the file when the row has it, otherwise from the extension of its name. */
export function previewKind(type: unknown, name: string): PreviewFile['kind'] | null {
  const mime = typeof type === 'string' ? type.trim().toLowerCase() : '';
  if (mime) return mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : null;
  if (IMAGE_EXTENSIONS.test(name)) return 'image';
  return /\.pdf$/i.test(name) ? 'pdf' : null;
}

/**
 * The files of the rows that can be shown, in order, and the position of the one to start from (the first when `start`
 * is not among them). Rows without an allowed address, or of another type, are left out.
 */
export function previewFiles(rows: readonly Record<string, unknown>[], spec: Pick<PreviewStep['preview'], 'urlField' | 'nameField' | 'typeField'>, start?: string): { files: PreviewFile[]; start: number } {
  const files: PreviewFile[] = [];
  for (const row of rows) {
    const url = previewAddress(row[spec.urlField ?? 'url']);
    if (!url) continue;
    const named = row[spec.nameField ?? 'name'];
    const name = typeof named === 'string' && named.trim() ? named.trim() : (lastPathSegment(url) ?? url);
    const kind = previewKind(row[spec.typeField ?? 'type'], name);
    if (kind) files.push({ url, name, kind });
  }
  const at = start === undefined ? -1 : files.findIndex((file) => file.url === start.trim());
  return { files, start: Math.max(at, 0) };
}
