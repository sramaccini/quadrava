import { Injectable, inject, signal } from '@angular/core';
import { Authorization, DataClient, I18n, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider, type DataRequest } from 'core';
import { isObject, type Json } from '../model/doc-ops';
import { EditorStore } from '../model/editor-store';

/**
 * Porte dell'anteprima: nessuna chiamata esce dal browser. Il DataClient risponde con i dati di esempio che l'autore
 * scrive per ogni data source; permessi e utente sono simulati; navigazioni e segnalazioni finiscono nel registro
 * dell'anteprima invece di cambiare pagina.
 */

/** Riga del registro dell'anteprima. */
export interface PreviewEvent {
  kind: 'request' | 'navigate' | 'diagnostic';
  text: string;
}

@Injectable({ providedIn: 'root' })
export class PreviewLog {
  readonly events = signal<PreviewEvent[]>([]);

  add(event: PreviewEvent): void {
    this.events.update((list) => [...list, event].slice(-100));
  }

  clear(): void {
    this.events.set([]);
  }
}

/** Permessi dell'anteprima: tutti concessi, oppure nessuno (per vedere la schermata come un utente senza permessi). */
@Injectable({ providedIn: 'root' })
export class PreviewSession implements Authorization, UserProvider {
  readonly grantAll = signal(true);
  private readonly i18n = inject(I18n);

  can(): boolean {
    return this.grantAll();
  }

  user(): Record<string, unknown> {
    return { username: 'anteprima', displayName: 'Anteprima', locale: this.i18n.locale() };
  }
}

/** Trova il data source a cui corrisponde una richiesta (metodo e URL, con le parti `{{ }}` libere). */
export function matchSource(sources: Record<string, Json>, request: Pick<DataRequest, 'method' | 'url'>): string | null {
  const path = request.url.split('?')[0];
  for (const [name, source] of Object.entries(sources)) {
    if (!isObject(source) || source['method'] !== request.method || typeof source['url'] !== 'string') continue;
    const pattern = source['url']
      .split(/\{\{[\s\S]*?\}\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*');
    if (new RegExp(`^${pattern}$`).test(path)) return name;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class PreviewDataClient implements DataClient {
  private readonly store = inject(EditorStore);
  private readonly log = inject(PreviewLog);

  async request(request: DataRequest): Promise<unknown> {
    const sources = this.store.doc() && isObject(this.store.doc()) ? (this.store.doc() as Record<string, Json>)['dataSources'] : null;
    const name = isObject(sources) ? matchSource(sources, request) : null;
    this.log.add({ kind: 'request', text: `${request.method} ${request.url}${name ? ` → ${name}` : ''}` });
    const sample = name ? this.store.samples()[name] : undefined;
    // Senza dati di esempio: elenco vuoto per le letture, oggetto vuoto per le scritture.
    return structuredClone(sample ?? (request.method === 'GET' ? [] : {}));
  }
}

@Injectable({ providedIn: 'root' })
export class PreviewNavigator implements ScreenNavigator {
  private readonly log = inject(PreviewLog);
  private readonly notifier = inject(Notifier);
  private readonly i18n = inject(I18n);

  navigate(screen: string, params: Record<string, unknown>): void {
    const text = `${screen} ${JSON.stringify(params)}`;
    this.log.add({ kind: 'navigate', text });
    this.notifier.toast(this.i18n.t('ed.preview.navigated', { screen }));
  }
}

@Injectable({ providedIn: 'root' })
export class PreviewDiagnostics implements RuntimeDiagnostics {
  private readonly log = inject(PreviewLog);

  report(event: { screen: string; source: string; error: string }): void {
    this.log.add({ kind: 'diagnostic', text: `${event.source}: ${event.error}` });
  }
}
