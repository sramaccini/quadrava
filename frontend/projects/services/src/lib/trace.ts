function hex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  // Il W3C vieta valori tutti a zero.
  if (buf.every((b) => b === 0)) buf[bytes - 1] = 1;
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Intestazione `traceparent` (W3C Trace Context) per una nuova richiesta. */
export function newTraceparent(sampled = true): { header: string; traceId: string } {
  const traceId = hex(16);
  return { header: `00-${traceId}-${hex(8)}-${sampled ? '01' : '00'}`, traceId };
}

/** Vero solo per URL relativi alla stessa origine: a terzi non si inviano intestazioni interne. */
export function isSameOriginRelative(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.includes('\\');
}
