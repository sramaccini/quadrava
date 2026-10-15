import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { RuntimeTracer, type SpanAttributes, type SpanContext, type TraceSpan } from 'core';
import { LOWCODE_SERVICES_CONFIG } from './config';
import { redact } from './diagnostics';
import { OtlpQueue, attribute, runtimeResource, unixNano } from './otlp';
import { newSpanContext } from './trace';

/** Tipo di span OTLP: interno al runtime (schermata, azione) o client di una chiamata HTTP. */
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
 * Invia le tracce come span OTLP/HTTP (JSON), a lotti e con un tetto al minuto. Il campionamento si decide alla radice
 * della traccia (`traceSampleRatio`) e passa ai figli; gli span in errore si inviano comunque. I testi degli attributi
 * passano da `redact`. Non lancia mai errori.
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
                // OTLP: 1 = interno, 3 = client.
                kind: span.kind === 'client' ? 3 : 1,
                startTimeUnixNano: unixNano(span.start),
                endTimeUnixNano: unixNano(span.end),
                attributes: Object.entries(span.attributes).map(([key, value]) => attribute(key, typeof value === 'string' ? redact(value) : value)),
                // Esito non impostato se riuscito (come raccomanda OpenTelemetry), 2 = errore.
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
