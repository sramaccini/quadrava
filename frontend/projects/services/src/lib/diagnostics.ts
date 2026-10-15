import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { RuntimeDiagnostics } from 'core';
import { LOWCODE_SERVICES_CONFIG } from './config';
import { OtlpQueue, attribute, runtimeResource, unixNano } from './otlp';

interface Event {
  screen: string;
  source: string;
  error: string;
}

const MAX_TEXT = 200;

/** Removes query strings, long digit sequences and email addresses, then truncates: nothing resembling data ends up in the logs. */
export function redact(text: string): string {
  return text
    .replace(/\?[^\s'"]*/g, '?…')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\d{6,}/g, '[num]')
    .slice(0, MAX_TEXT);
}

/** Sends technical reports as OTLP/HTTP (JSON) logs, in batches and with a per-minute cap. Never throws. */
@Injectable({ providedIn: 'root' })
export class HttpDiagnostics extends RuntimeDiagnostics {
  private readonly config = inject(LOWCODE_SERVICES_CONFIG);
  private readonly queue = new OtlpQueue<{ time: number; event: Event }>(
    inject(HttpClient),
    `${this.config.telemetryBase}/logs`,
    this.config.telemetryMaxPerMinute,
    (batch) => ({
      resourceLogs: [
        {
          resource: runtimeResource(this.config.appId),
          scopeLogs: [
            {
              scope: { name: 'lowcode.runtime' },
              logRecords: batch.map(({ time, event }) => ({
                timeUnixNano: unixNano(time),
                severityNumber: 17,
                severityText: 'ERROR',
                body: { stringValue: event.error },
                attributes: [attribute('screen', event.screen), attribute('source', event.source)],
              })),
            },
          ],
        },
      ],
    }),
    inject(DestroyRef),
  );

  report(event: Event): void {
    if (!this.config.telemetry) return;
    this.queue.add({ time: Date.now(), event: { screen: redact(event.screen), source: redact(event.source), error: redact(event.error) } });
  }

  flush(): Promise<void> {
    return this.queue.flush();
  }
}
