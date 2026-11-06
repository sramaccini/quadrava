import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { RuntimeDiagnostics, type DiagnosticSeverity } from 'core';
import { LOWCODE_SERVICES_CONFIG, type LogLevel } from './config';
import { OtlpQueue, attribute, runtimeResource, unixNano } from './otlp';

interface Event {
  screen: string;
  source: string;
  error: string;
  severity?: DiagnosticSeverity;
}

/** OTLP severity of each weight (ERROR 17, WARN 13, INFO 9), and its rank against the configured level. */
const SEVERITY: Record<DiagnosticSeverity, { number: number; text: string; rank: number }> = {
  error: { number: 17, text: 'ERROR', rank: 3 },
  warn: { number: 13, text: 'WARN', rank: 2 },
  info: { number: 9, text: 'INFO', rank: 1 },
};
const LEVEL_RANK: Record<LogLevel, number> = { info: 1, warn: 2, error: 3, off: 4 };

const MAX_TEXT = 200;

/** Removes query strings, long digit sequences and email addresses, then truncates: nothing resembling data ends up in the logs. */
export function redact(text: string): string {
  return text
    .replace(/\?[^\s'"]*/g, '?…')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\d{6,}/g, '[num]')
    .slice(0, MAX_TEXT);
}

/**
 * Sends technical reports as OTLP/HTTP (JSON) logs, in batches and with a per-minute cap, leaving out those lighter than
 * `logLevel`. Never throws.
 */
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
                severityNumber: SEVERITY[event.severity ?? 'error'].number,
                severityText: SEVERITY[event.severity ?? 'error'].text,
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
    if (!this.config.telemetry || SEVERITY[event.severity ?? 'error'].rank < LEVEL_RANK[this.config.logLevel]) return;
    this.queue.add({ time: Date.now(), event: { screen: redact(event.screen), source: redact(event.source), error: redact(event.error), severity: event.severity } });
  }

  flush(): Promise<void> {
    return this.queue.flush();
  }
}
