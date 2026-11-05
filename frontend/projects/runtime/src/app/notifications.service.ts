import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { notificationsOf, type UserNotification } from 'components';
import { DataClient, LiveUpdates, RuntimeDiagnostics } from 'core';
import type { NavigationNotifications } from 'schema';

/** Path of an event stream: same origin, no expressions, query or host (as for the live data sources). */
const STREAM_PATH = /^\/(?!\/)[A-Za-z0-9\-._~/%]*$/;

/**
 * Messages of the user (ADR-22), from the service named by `notifications` in the navigation: read at once, at intervals
 * (only with the page visible), when the page comes back, when the bell opens and, with `live`, on every event of the
 * stream. A failed read keeps the previous list and goes to the technical reports, as for the menu counters.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly data = inject(DataClient);
  private readonly live = inject(LiveUpdates, { optional: true });
  private readonly diagnostics = inject(RuntimeDiagnostics, { optional: true });

  /** The configuration of the navigation; null without messages (no bell). */
  readonly config = signal<NavigationNotifications | null>(null);
  readonly items = signal<UserNotification[]>([]);
  private stops: (() => void)[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  watch(config: NavigationNotifications | undefined): void {
    this.stop();
    this.items.set([]);
    this.config.set(config ?? null);
    if (!config || typeof document === 'undefined') return;
    void this.read();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void this.read();
    }, (config.refreshSeconds ?? 60) * 1000);
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') void this.read();
    };
    document.addEventListener('visibilitychange', onVisible);
    this.stops.push(
      () => clearInterval(timer),
      () => document.removeEventListener('visibilitychange', onVisible),
    );
    if (config.live && this.live) {
      if (STREAM_PATH.test(config.live.url)) this.stops.push(this.live.listen(config.live.url, config.live.events ?? [], () => void this.read()));
      else this.report('messages stream', `not a path of the same origin: ${config.live.url}`);
    }
  }

  /** Reads the messages again (the bell was opened, an event arrived). */
  async read(): Promise<void> {
    const config = this.config();
    if (!config) return;
    try {
      this.items.set(notificationsOf(await this.data.request({ method: 'GET', url: config.url })));
    } catch (e) {
      this.report('messages', e);
    }
  }

  /** Marks messages as read with the POST of the configuration, then reads them again. Without `readUrl`, nothing. */
  async markRead(ids: readonly string[]): Promise<void> {
    const config = this.config();
    if (!config?.readUrl || !ids.length) return;
    try {
      await this.data.request({ method: 'POST', url: config.readUrl, body: { ids: [...ids] } });
    } catch (e) {
      this.report('messages read', e);
    }
    await this.read();
  }

  markAllRead(): Promise<void> {
    return this.markRead(this.items().filter((n) => !n.read).map((n) => n.id));
  }

  private stop(): void {
    this.stops.forEach((stop) => stop());
    this.stops = [];
  }

  private report(source: string, error: unknown): void {
    this.diagnostics?.report({ screen: 'navigation', source, error: error instanceof Error ? error.message : String(error) });
  }
}
