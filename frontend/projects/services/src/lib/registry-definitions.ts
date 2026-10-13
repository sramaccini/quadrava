import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, InjectionToken, inject, type Provider } from '@angular/core';
import { DefinitionSource } from 'core';
import { firstValueFrom } from 'rxjs';

/** Dove il runtime prende le definizioni pubblicate nel registro. */
export interface RegistryDefinitionsConfig {
  /** Applicazione nel registro. */
  app: string;
  /** Ambiente di cui caricare le versioni pubblicate (per esempio `produzione`). */
  env: string;
  /** Identificativo del documento di navigazione. */
  navigation: string;
  /** Temi tra cui scegliere; il primo è quello iniziale. */
  themes: string[];
  /** Base delle API del registro (stessa origine, servita dal BFF). */
  base?: string;
}

export const REGISTRY_DEFINITIONS_CONFIG = new InjectionToken<RegistryDefinitionsConfig>('REGISTRY_DEFINITIONS_CONFIG');

/** Documento non caricato dal registro: lo stato HTTP (0 se il servizio non risponde). Mai il corpo della risposta. */
export class DefinitionLoadError extends Error {
  constructor(readonly status: number) {
    super(status ? `HTTP ${status}` : 'registro non raggiungibile');
  }
}

/**
 * Definizioni dal registro (contracts/registry.yaml 0.3): ogni schermata, la navigazione, ogni tema e il catalogo di ogni lingua sono documenti
 * separati, e il runtime carica la versione pubblicata nell'ambiente configurato. Le risposte si ricordano con il
 * loro ETag: ricaricando lo stesso documento il registro risponde 304 e si riusa la copia già scaricata.
 */
@Injectable()
export class RegistryDefinitions extends DefinitionSource {
  private readonly http = inject(HttpClient);
  private readonly config = inject(REGISTRY_DEFINITIONS_CONFIG);
  private readonly cache = new Map<string, { etag: string; body: unknown }>();

  screen(id: string): Promise<unknown> {
    return this.published('screen', id);
  }

  navigation(): Promise<unknown> {
    return this.published('navigation', this.config.navigation);
  }

  theme(id: string): Promise<unknown> {
    return this.published('theme', id);
  }

  themes(): string[] {
    return this.config.themes;
  }

  /** Catalogo pubblicato della lingua (documento `messages`): si restituiscono i testi, chiave → testo. */
  async messages(locale: string): Promise<unknown> {
    const doc = (await this.published('messages', locale)) as { texts?: unknown } | null;
    return doc && typeof doc === 'object' ? doc.texts : null;
  }

  private async published(kind: 'screen' | 'navigation' | 'theme' | 'messages', id: string): Promise<unknown> {
    const base = (this.config.base ?? '/registry').replace(/\/+$/, '');
    const url = `${base}/apps/${encodeURIComponent(this.config.app)}/documents/${kind}/${encodeURIComponent(id)}/published`;
    const cached = this.cache.get(url);
    let headers = new HttpHeaders({ Accept: 'application/json' });
    if (cached) headers = headers.set('If-None-Match', cached.etag);
    try {
      const response = await firstValueFrom(this.http.get(url, { headers, params: { env: this.config.env }, observe: 'response' }));
      const etag = response.headers.get('ETag');
      if (etag) this.cache.set(url, { etag, body: response.body });
      return response.body;
    } catch (e) {
      const status = e instanceof HttpErrorResponse ? e.status : 0;
      if (status === 304 && cached) return cached.body;
      throw new DefinitionLoadError(status);
    }
  }
}

/** Il runtime carica schermate, navigazione e temi dal registro. Richiede `HttpClient` (vedi `provideLowcodeServices`). */
export function provideRegistryDefinitions(config: RegistryDefinitionsConfig): Provider[] {
  return [{ provide: REGISTRY_DEFINITIONS_CONFIG, useValue: config }, RegistryDefinitions, { provide: DefinitionSource, useExisting: RegistryDefinitions }];
}
