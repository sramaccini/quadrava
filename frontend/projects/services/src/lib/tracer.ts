import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { RuntimeTracer, type SpanAttributes, type SpanContext, type TraceSpan } from 'core';
import { LOWCODE_SERVICES_CONFIG } from './config';
import { redact } from './diagnostics';
import { OtlpQueue, attribute, runtimeResource, unixNano } from './otlp';
import { newSpanContext } from './trace';

/** OTLP span kind: internal to the runtime (screen, action) or client of an HTTP call. */
export type SpanKind = 'internal' | 'client';

interface FinishedSpan {
  name: string;
  kind: SpanKind;
  context: SpanContext;
  parentSpanId?: string;
  start: number;
  end: number;
  ok: boolean;
  attributes: SpanAttributes;
}

/**
 * Sends the traces as OTLP/HTTP (JSON) spans, in batches and with a per-minute cap. Sampling is decided at the root
 * of the trace (`traceSampleRatio`) and passed on to the children; spans in error are sent anyway. Attribute texts
 * go through `redact`. Never throws.
 */
@Injectable({ providedIn: 'root' })
export class HttpTracer extends RuntimeTracer {
  private readonly config = inject(LOWCODE_SERVICES_CONFIG);
  private readonly queue = new OtlpQueue<FinishedSpan>(
    inject(HttpClient),
    `${this.config.telemetryBase}/traces`,
    this.config.traceMaxPerMinute,
    (spans) => ({
      resourceSpans: [
        {
          resource: runtimeResource(this.config.appId),
          scopeSpans: [
            {
              scope: { name: 'lowcode.runtime' },
              spans: spans.map((span) => ({
                traceId: span.context.traceId,
                spanId: span.context.spanId,
                ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
                name: span.name,
                // OTLP: 1 = internal, 3 = client.
                kind: span.kind === 'client' ? 3 : 1,
                startTimeUnixNano: unixNano(span.start),
                endTimeUnixNano: unixNano(span.end),
                attributes: Object.entries(span.attributes).map(([key, value]) => attribute(key, typeof value === 'string' ? redact(value) : value)),
                // Status unset when successful (as OpenTelemetry recommends), 2 = error.
                status: span.ok ? {} : { code: 2 },
              })),
            },
          ],
        },
      ],
    }),
    inject(DestroyRef),
  );

  start(name: string, attributes: SpanAttributes, parent?: SpanContext, kind: SpanKind = 'internal'): TraceSpan {
    const context = newSpanContext(parent, Math.random() < this.config.traceSampleRatio);
    const start = Date.now();
    let ended = false;
    return {
      context,
      end: (ok, extra) => {
        if (ended) return;
        ended = true;
        if (!this.config.telemetry || (!context.sampled && ok)) return;
        this.queue.add({ name, kind, context, parentSpanId: parent?.spanId, start, end: Date.now(), ok, attributes: { ...attributes, ...extra } });
      },
    };
  }

  flush(): Promise<void> {
    return this.queue.flush();
  }
}
