import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, InjectionToken, inject, type Provider } from '@angular/core';
import { DefinitionSource } from 'core';
import { firstValueFrom } from 'rxjs';

/** Where the runtime takes the definitions published in the registry. */
export interface RegistryDefinitionsConfig {
  /** Application in the registry. */
  app: string;
  /** Environment whose published versions are loaded (for example `production`). */
  env: string;
  /** Identifier of the navigation document. */
  navigation: string;
  /** Themes to choose from; the first is the initial one. */
  themes: string[];
  /** Base of the registry APIs (same origin, served by the BFF). */
  base?: string;
}

export const REGISTRY_DEFINITIONS_CONFIG = new InjectionToken<RegistryDefinitionsConfig>('REGISTRY_DEFINITIONS_CONFIG');

/** Document not loaded from the registry: the HTTP status (0 if the service does not respond). Never the response body. */
export class DefinitionLoadError extends Error {
  constructor(readonly status: number) {
    super(status ? `HTTP ${status}` : 'registry unreachable');
  }
}

/**
 * Definitions from the registry (contracts/registry.yaml 0.6): every screen, every data sources document, the navigation, every theme and the catalogue of every language are separate
 * documents, and the runtime loads the version published in the configured environment. Responses are remembered with their
 * ETag: when the same document is loaded again the registry answers 304 and the copy already downloaded is reused.
 */
@Injectable()
export class RegistryDefinitions extends DefinitionSource {
  private readonly http = inject(HttpClient);
  private readonly config = inject(REGISTRY_DEFINITIONS_CONFIG);
  private readonly cache = new Map<string, { etag: string; body: unknown }>();

  screen(id: string): Promise<unknown> {
    return this.published('screen', id);
  }

  dataSources(id: string): Promise<unknown> {
    return this.published('datasources', id);
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

  /** Published catalogue of the language (`messages` document): the texts are returned, key → text. */
  async messages(locale: string): Promise<unknown> {
    const doc = (await this.published('messages', locale)) as { texts?: unknown } | null;
    return doc && typeof doc === 'object' ? doc.texts : null;
  }

  private async published(kind: 'screen' | 'datasources' | 'navigation' | 'theme' | 'messages', id: string): Promise<unknown> {
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

/** The runtime loads screens, navigation and themes from the registry. Requires `HttpClient` (see `provideLowcodeServices`). */
export function provideRegistryDefinitions(config: RegistryDefinitionsConfig): Provider[] {
  return [{ provide: REGISTRY_DEFINITIONS_CONFIG, useValue: config }, RegistryDefinitions, { provide: DefinitionSource, useExisting: RegistryDefinitions }];
}
