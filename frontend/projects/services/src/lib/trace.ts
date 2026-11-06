import type { SpanContext } from 'core';

function hex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  // The W3C forbids all-zero values.
  if (buf.every((b) => b === 0)) buf[bytes - 1] = 1;
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Identity of a new span: child of `parent` (same trace, same sampling) or root of a new trace. */
export function newSpanContext(parent?: SpanContext, sampled = true): SpanContext {
  return { traceId: parent?.traceId ?? hex(16), spanId: hex(8), sampled: parent ? parent.sampled : sampled };
}

/** `traceparent` header (W3C Trace Context) that carries the trace on in the services, starting from this span. */
export function traceparent(context: SpanContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.sampled ? '01' : '00'}`;
}

/**
 * `baggage` header (W3C Baggage) with the context of a call for the audit of the services: `key=value` pairs separated by
 * commas, values percent-encoded. Null if there is nothing to send.
 */
export function baggage(entries: Readonly<Record<string, string>> | undefined): string | null {
  const pairs = Object.entries(entries ?? {}).map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return pairs.length ? pairs.join(',') : null;
}

/** True only for URLs relative to the same origin: internal headers are not sent to third parties. */
export function isSameOriginRelative(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.includes('\\');
}
