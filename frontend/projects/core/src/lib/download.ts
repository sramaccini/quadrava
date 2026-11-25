/** A file received by a data source run with `download` (`DataRequestOptions.download`). */
export interface DownloadedFile {
  blob: Blob;
  /** The name the service gave in `Content-Disposition`, if any (not yet made safe: see {@link safeFileName}). */
  fileName?: string;
}

/** Whether a value is a {@link DownloadedFile}. */
export function isDownloadedFile(value: unknown): value is DownloadedFile {
  return value !== null && typeof value === 'object' && (value as { blob?: unknown }).blob instanceof Blob;
}

/**
 * The file name of a `Content-Disposition` header: `filename*` (RFC 5987, UTF-8 with percent encoding) wins over
 * `filename`, quoted or not. Undefined without a name or with an encoding that cannot be read.
 */
export function fileNameFromDisposition(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (extended && /^utf-8$/i.test(extended[1].trim())) {
    try {
      return decodeURIComponent(extended[2].trim().replace(/^"(.*)"$/, '$1'));
    } catch {
      // A wrong percent encoding: the plain filename, if any, still counts.
    }
  }
  const plain = /(?:^|;)\s*filename\s*=\s*("((?:[^"\\]|\\.)*)"|[^;]*)/i.exec(header);
  if (!plain) return undefined;
  const value = plain[2] !== undefined ? plain[2].replace(/\\(.)/g, '$1') : plain[1].trim();
  return value || undefined;
}

/**
 * A name that can be given to a file on the user's disk: no folders (only what follows the last / or \), no control
 * characters nor the characters Windows refuses, no dots or spaces at the ends, at most 150 characters. Undefined when
 * nothing is left.
 */
export function safeFileName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const base = name.split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- control characters are removed from file names on purpose
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 150);
  return clean || undefined;
}

/** The last segment of the path of an address, decoded (`/api/users/ada/export?x=1` gives `export`). */
export function lastPathSegment(url: string): string | undefined {
  const segment = url.split(/[?#]/)[0].split('/').filter(Boolean).pop();
  if (!segment) return undefined;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Makes the browser save a file. */
export function saveBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const LIVE_REGION_ID = 'lc-download-status';

/**
 * Tells screen readers that a download has started (the browser shows it in its own bar, which they do not read): a
 * polite live region, hidden from view, shared by every download of the page.
 */
export function announceDownload(text: string): void {
  let region = document.getElementById(LIVE_REGION_ID);
  if (!region) {
    region = document.createElement('div');
    region.id = LIVE_REGION_ID;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    // Visually hidden, still read (the usual "sr-only" rules), with the CSSOM: no style attribute in the markup.
    Object.assign(region.style, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' });
    document.body.appendChild(region);
  }
  // A change of text is what is read: emptied first, so that the same text twice is read twice.
  region.textContent = '';
  const target = region;
  setTimeout(() => (target.textContent = text), 50);
}
