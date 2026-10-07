import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { RuntimeDiagnostics } from 'core';
import { firstValueFrom } from 'rxjs';
import { LOWCODE_SERVICES_CONFIG } from './config';

interface Event {
  screen: string;
  source: string;
  error: string;
}

const MAX_TEXT = 200;
const BATCH = 20;
const FLUSH_MS = 5000;

/** Toglie query string, sequenze lunghe di cifre e indirizzi email, poi tronca: nulla che somigli a un dato finisce nei log. */
export function redact(text: string): string {
  return text
    .replace(/\?[^\s'"]*/g, '?…')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\d{6,}/g, '[num]')
    .slice(0, MAX_TEXT);
}

/** Invia le segnalazioni tecniche come log OTLP/HTTP (JSON), a lotti e con un tetto al minuto. Non lancia mai errori. */
@Injectable({ providedIn: 'root' })
export class HttpDiagnostics extends RuntimeDiagnostics {
  private readonly http = inject(HttpClient);
  private readonly config = inject(LOWCODE_SERVICES_CONFIG);
  private queue: { time: number; event: Event }[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private windowStart = 0;
  private sentInWindow = 0;

  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      void this.flush();
    });
  }

  report(event: Event): void {
    if (!this.config.telemetry) return;
    const now = Date.now();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.sentInWindow = 0;
    }
    if (this.sentInWindow >= this.config.telemetryMaxPerMinute) return;
    this.sentInWindow++;
    this.queue.push({ time: now, event: { screen: redact(event.screen), source: redact(event.source), error: redact(event.error) } });
    if (this.queue.length >= BATCH) void this.flush();
    else this.timer ??= setTimeout(() => void this.flush(), FLUSH_MS);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const batch = this.queue;
    this.queue = [];
    if (batch.length === 0) return;
    const str = (key: string, value: string) => ({ key, value: { stringValue: value } });
    const body = {
      resourceLogs: [
        {
          resource: { attributes: [str('service.name', 'lowcode-runtime'), str('lowcode.app', this.config.appId)] },
          scopeLogs: [
            {
              scope: { name: 'lowcode.runtime' },
              logRecords: batch.map(({ time, event }) => ({
                timeUnixNano: String(BigInt(time) * 1_000_000n),
                severityNumber: 17,
                severityText: 'ERROR',
                body: { stringValue: event.error },
                attributes: [str('screen', event.screen), str('source', event.source)],
              })),
            },
          ],
        },
      ],
    };
    try {
      await firstValueFrom(this.http.post(`${this.config.telemetryBase}/logs`, body));
    } catch {
      // La telemetria non deve mai disturbare l'applicazione.
    }
  }
}
