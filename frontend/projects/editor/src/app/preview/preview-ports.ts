import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Authorization, DataClient, I18n, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider, type DataRequest } from 'core';
import { isToPreview, type FromPreview, type PreviewEvent, type PreviewState } from './protocol';

/**
 * Iframe side of the preview: the channel with the editor and the ports of the runtime. No call leaves the browser: the
 * DataClient answers with the sample data, permissions and user are those of the simulated profile, navigations and
 * reports go back to the editor as log events.
 */

/** Channel with the editor window: receives the state to draw, sends selections and events. */
@Injectable({ providedIn: 'root' })
export class PreviewChannel {
  readonly state = signal<PreviewState | null>(null);

  constructor() {
    const listener = (event: MessageEvent): void => {
      // Only the editor containing this iframe, from the same origin.
      if (event.origin !== location.origin || event.source !== window.parent) return;
      if (isToPreview(event.data)) this.state.set(event.data.state);
    };
    window.addEventListener('message', listener);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('message', listener));
  }

  send(message: FromPreview): void {
    window.parent.postMessage(message, location.origin);
  }

  event(event: PreviewEvent): void {
    this.send({ type: 'lc-preview:event', event });
  }
}

/** Simulated profile: the permissions granted by the editor (all, if not given). */
@Injectable({ providedIn: 'root' })
export class PreviewSession implements Authorization, UserProvider {
  private readonly channel = inject(PreviewChannel);
  private readonly i18n = inject(I18n);

  can(permission: string): boolean {
    const granted = this.channel.state()?.granted;
    return granted === null || granted === undefined || granted.includes(permission);
  }

  user(): Record<string, unknown> {
    return { username: 'preview', displayName: 'Preview', locale: this.i18n.locale() };
  }
}

/** Finds the data source a request corresponds to (method and URL, with the `{{ }}` parts free). */
export function matchSource(sources: Record<string, unknown>, request: Pick<DataRequest, 'method' | 'url'>): string | null {
  const path = request.url.split('?')[0];
  for (const [name, source] of Object.entries(sources)) {
    const s = source as { method?: unknown; url?: unknown } | null;
    if (!s || s.method !== request.method || typeof s.url !== 'string') continue;
    const pattern = s.url
      .split(/\{\{[\s\S]*?\}\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*');
    if (new RegExp(`^${pattern}$`).test(path)) return name;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class PreviewDataClient implements DataClient {
  private readonly channel = inject(PreviewChannel);

  async request(request: DataRequest): Promise<unknown> {
    const state = this.channel.state();
    const name = matchSource((state?.screen?.dataSources ?? {}) as Record<string, unknown>, request);
    if (state?.liveData) return this.live(request, name);
    this.channel.event({ kind: 'request', text: `${request.method} ${request.url}${name ? ` → ${name}` : ''}` });
    const sample = name ? state?.samples[name] : undefined;
    // Without sample data: an empty list for reads, an empty object for writes.
    return structuredClone(sample ?? (request.method === 'GET' ? [] : {}));
  }

  private async live(request: DataRequest, name: string | null): Promise<unknown> {
    const label = `${request.method} ${request.url}${name ? ` → ${name}` : ''}`;
    let result: { status: number; body: unknown };
    try {
      result = await liveRequest(request);
    } catch {
      result = { status: 0, body: null };
    }
    const outcome = result.status === -1 ? 'blocked (real data: reads only)' : result.status === 0 ? 'service unreachable' : `HTTP ${result.status}`;
    this.channel.event({ kind: 'request', text: `${label} · ${outcome}` });
    if (result.status < 200 || result.status >= 300) throw new Error(result.status === -1 ? '403' : String(result.status));
    return result.body;
  }
}

/**
 * Read from the real services: GET only, only relative paths of the same origin (the editor behind the BFF, which adds
 * the token). Writes are blocked: trying a screen must not change the real data.
 */
async function liveRequest(request: DataRequest): Promise<{ status: number; body: unknown }> {
  if (request.method !== 'GET') return { status: -1, body: null };
  const path = request.url.split(/[?#]/)[0];
  if (!/^\/(?!\/)/.test(request.url) || path.split('/').includes('..')) return { status: 0, body: null };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value === null || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  const query = params.toString();
  const response = await fetch(query ? `${request.url}?${query}` : request.url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  return { status: response.status, body: response.ok ? await response.json().catch(() => null) : null };
}

@Injectable({ providedIn: 'root' })
export class PreviewNavigator implements ScreenNavigator {
  private readonly channel = inject(PreviewChannel);
  private readonly notifier = inject(Notifier);
  private readonly i18n = inject(I18n);

  navigate(screen: string, params: Record<string, unknown>): void {
    this.channel.event({ kind: 'navigate', text: `${screen} ${JSON.stringify(params)}` });
    this.notifier.toast(this.i18n.t('ed.preview.navigated', { screen }));
  }
}

@Injectable({ providedIn: 'root' })
export class PreviewDiagnostics implements RuntimeDiagnostics {
  private readonly channel = inject(PreviewChannel);

  report(event: { screen: string; source: string; error: string }): void {
    this.channel.event({ kind: 'diagnostic', text: `${event.source}: ${event.error}` });
  }
}
