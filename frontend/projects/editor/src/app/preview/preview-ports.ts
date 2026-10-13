import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Authorization, DataClient, I18n, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider, type DataRequest } from 'core';
import { isToPreview, type FromPreview, type PreviewEvent, type PreviewState } from './protocol';

/**
 * Lato iframe dell'anteprima: il canale con l'editor e le porte del runtime. Nessuna chiamata esce dal browser: il
 * DataClient risponde con i dati di esempio, permessi e utente sono quelli del profilo simulato, navigazioni e
 * segnalazioni tornano all'editor come eventi del registro.
 */

/** Canale con la finestra dell'editor: riceve lo stato da disegnare, manda selezioni ed eventi. */
@Injectable({ providedIn: 'root' })
export class PreviewChannel {
  readonly state = signal<PreviewState | null>(null);

  constructor() {
    const listener = (event: MessageEvent): void => {
      // Solo l'editor che contiene questo iframe, dalla stessa origine.
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

/** Profilo simulato: i permessi concessi dall'editor (tutti, se non indicati). */
@Injectable({ providedIn: 'root' })
export class PreviewSession implements Authorization, UserProvider {
  private readonly channel = inject(PreviewChannel);
  private readonly i18n = inject(I18n);

  can(permission: string): boolean {
    const granted = this.channel.state()?.granted;
    return granted === null || granted === undefined || granted.includes(permission);
  }

  user(): Record<string, unknown> {
    return { username: 'anteprima', displayName: 'Anteprima', locale: this.i18n.locale() };
  }
}

/** Trova il data source a cui corrisponde una richiesta (metodo e URL, con le parti `{{ }}` libere). */
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
    this.channel.event({ kind: 'request', text: `${request.method} ${request.url}${name ? ` → ${name}` : ''}` });
    const sample = name ? state?.samples[name] : undefined;
    // Senza dati di esempio: elenco vuoto per le letture, oggetto vuoto per le scritture.
    return structuredClone(sample ?? (request.method === 'GET' ? [] : {}));
  }
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
