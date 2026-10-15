import { HttpClient } from '@angular/common/http';
import { DestroyRef } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const BATCH = 20;
const FLUSH_MS = 5000;

export type OtlpValue = { stringValue: string } | { intValue: string } | { doubleValue: number } | { boolValue: boolean };
export interface OtlpAttribute {
  key: string;
  value: OtlpValue;
}

/** Attributo OTLP/HTTP JSON (gli interi a 64 bit viaggiano come stringhe). */
export function attribute(key: string, value: string | number | boolean): OtlpAttribute {
  if (typeof value === 'string') return { key, value: { stringValue: value } };
  if (typeof value === 'boolean') return { key, value: { boolValue: value } };
  return { key, value: Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value } };
}

/** Istante in nanosecondi dall'epoca, come stringa (OTLP JSON). */
export function unixNano(ms: number): string {
  return String(BigInt(Math.round(ms)) * 1_000_000n);
}

/**
 * Coda verso un endpoint OTLP/HTTP (JSON): invia a lotti (ogni BATCH elementi o dopo FLUSH_MS), con un tetto al
 * minuto, e svuota la coda quando la pagina si chiude o va in secondo piano (con `keepalive`, perché la richiesta
 * sopravviva alla pagina). Non lancia mai errori.
 */
export class OtlpQueue<T> {
  private queue: T[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private windowStart = 0;
  private sentInWindow = 0;

  constructor(
    private readonly http: HttpClient,
    private readonly url: string,
    private readonly maxPerMinute: number,
    private readonly body: (items: T[]) => unknown,
    destroyRef: DestroyRef,
  ) {
    const onHide = () => void this.flush(true);
    const onVisibility = () => {
      if (globalThis.document?.visibilityState === 'hidden') onHide();
    };
    globalThis.addEventListener?.('pagehide', onHide);
    globalThis.document?.addEventListener('visibilitychange', onVisibility);
    destroyRef.onDestroy(() => {
      globalThis.removeEventListener?.('pagehide', onHide);
      globalThis.document?.removeEventListener('visibilitychange', onVisibility);
      void this.flush();
    });
  }

  /** Accoda un elemento; oltre il tetto al minuto lo scarta. */
  add(item: T): void {
    const now = Date.now();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.sentInWindow = 0;
    }
    if (this.sentInWindow >= this.maxPerMinute) return;
    this.sentInWindow++;
    this.queue.push(item);
    if (this.queue.length >= BATCH) void this.flush();
    else this.timer ??= setTimeout(() => void this.flush(), FLUSH_MS);
  }

  async flush(keepalive = false): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const batch = this.queue;
    this.queue = [];
    if (batch.length === 0) return;
    try {
      await firstValueFrom(this.http.post(this.url, this.body(batch), { keepalive }));
    } catch {
      // La telemetria non deve mai disturbare l'applicazione.
    }
  }
}

/** Risorsa comune di log e tracce: il runtime e l'applicazione. */
export function runtimeResource(appId: string): { attributes: OtlpAttribute[] } {
  return { attributes: [attribute('service.name', 'lowcode-runtime'), attribute('lowcode.app', appId)] };
}
