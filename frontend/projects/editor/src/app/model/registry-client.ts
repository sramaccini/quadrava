import { Injectable, InjectionToken } from '@angular/core';
import type { Json } from './doc-ops';

/**
 * Client del registro (contracts/registry.yaml 0.2): ogni schermata, la navigazione e ogni tema sono documenti
 * separati, con versioni immutabili e pubblicazioni per ambiente. Le chiamate sono relative all'origine dell'editor,
 * che in produzione è servito dal BFF (sessione nel cookie, niente token nel browser).
 *
 * Protezione CSRF del BFF: le scritture rimandano il token del cookie `XSRF-TOKEN` nell'intestazione `X-XSRF-TOKEN`.
 * Se il cookie non c'era ancora, il BFF risponde 403 e lo crea: la scrittura si ripete una volta.
 */

/** Cambio di pagina (verso il login del BFF). Sostituibile nei test. */
export const EDITOR_REDIRECT = new InjectionToken<(url: string) => void>('EDITOR_REDIRECT', {
  providedIn: 'root',
  factory: () => (url: string) => globalThis.location.assign(url),
});

/** Pagina del BFF che avvia il login e poi riporta l'utente all'indirizzo indicato. */
export function loginUrl(returnTo: string): string {
  return `/bff/login?return=${encodeURIComponent(returnTo)}`;
}

/** Il token CSRF dal cookie del BFF, se c'è. */
export function csrfToken(cookies: string): string | null {
  for (const part of cookies.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === 'XSRF-TOKEN') return decodeURIComponent(value.join('='));
  }
  return null;
}

export type DocumentKind = 'screen' | 'navigation' | 'theme';

export interface DocumentVersion {
  hash: string;
  createdAt: string;
  author: string;
  state?: string;
}

export interface DocumentSummary {
  kind: DocumentKind;
  id: string;
  latest?: DocumentVersion;
  /** Ambiente → hash pubblicato. */
  publishedEnvironments?: Record<string, string>;
}

/** Errore del registro: il titolo del Problem (RFC 9457) se c'è, altrimenti lo stato HTTP. */
export class RegistryError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Il documento: tipo e identificativo, presi dalla proprietà del contenuto (`screen`, `navigation`, `theme`). */
export function documentRef(kind: DocumentKind, doc: Json): { kind: DocumentKind; id: string } | null {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return null;
  const id = doc[kind];
  return typeof id === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) ? { kind, id } : null;
}

@Injectable({ providedIn: 'root' })
export class RegistryClient {
  /** Radice delle API del registro (stessa origine). */
  base = '/registry';

  async documents(appId: string): Promise<DocumentSummary[]> {
    return this.call<DocumentSummary[]>('GET', `/apps/${enc(appId)}/documents`);
  }

  async versions(appId: string, kind: DocumentKind, id: string): Promise<DocumentVersion[]> {
    return this.call<DocumentVersion[]>('GET', this.path(appId, kind, id, '/versions'));
  }

  async save(appId: string, kind: DocumentKind, id: string, content: Json): Promise<DocumentVersion> {
    return this.call<DocumentVersion>('POST', this.path(appId, kind, id, '/versions'), content);
  }

  async version(appId: string, kind: DocumentKind, id: string, hash: string): Promise<Json> {
    return this.call<Json>('GET', this.path(appId, kind, id, `/versions/${enc(hash)}`));
  }

  async publish(appId: string, kind: DocumentKind, id: string, env: string, hash: string): Promise<void> {
    await this.call<void>('PUT', this.path(appId, kind, id, `/published?env=${enc(env)}`), { hash });
  }

  private async send(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = method === 'GET' ? null : csrfToken(document.cookie);
    if (token) headers['X-XSRF-TOKEN'] = token;
    try {
      return await fetch(this.base + path, { method, credentials: 'same-origin', headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new RegistryError(0, '');
    }
  }

  private path(appId: string, kind: DocumentKind, id: string, rest: string): string {
    return `/apps/${enc(appId)}/documents/${enc(kind)}/${enc(id)}${rest}`;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const hadToken = csrfToken(document.cookie) !== null;
    let response = await this.send(method, path, body);
    // Prima scrittura senza cookie CSRF: il BFF risponde 403 e intanto lo crea. Si riprova una volta, con il token.
    if (response.status === 403 && method !== 'GET' && !hadToken && csrfToken(document.cookie)) {
      response = await this.send(method, path, body);
    }
    if (!response.ok) {
      let title = '';
      try {
        const problem = (await response.json()) as { title?: unknown };
        // Solo il titolo del Problem, come testo: mai HTML, mai il dettaglio tecnico.
        if (typeof problem.title === 'string') title = problem.title;
      } catch {
        // Corpo assente o non JSON.
      }
      throw new RegistryError(response.status, title);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}
