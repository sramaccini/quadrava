import type { SpanContext } from 'core';

function hex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  // Il W3C vieta valori tutti a zero.
  if (buf.every((b) => b === 0)) buf[bytes - 1] = 1;
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Identità di un nuovo span: figlio di `parent` (stessa traccia, stesso campionamento) o radice di una traccia nuova. */
export function newSpanContext(parent?: SpanContext, sampled = true): SpanContext {
  return { traceId: parent?.traceId ?? hex(16), spanId: hex(8), sampled: parent ? parent.sampled : sampled };
}

/** Intestazione `traceparent` (W3C Trace Context) che fa proseguire la traccia nei servizi a partire da questo span. */
export function traceparent(context: SpanContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.sampled ? '01' : '00'}`;
}

/** Vero solo per URL relativi alla stessa origine: a terzi non si inviano intestazioni interne. */
export function isSameOriginRelative(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.includes('\\');
}
