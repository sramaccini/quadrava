import { Injectable } from '@angular/core';
import type { Json } from './doc-ops';

/**
 * Client del registro (contracts/registry.yaml 0.2): ogni schermata, la navigazione e ogni tema sono documenti
 * separati, con versioni immutabili e pubblicazioni per ambiente. Le chiamate sono relative all'origine dell'editor,
 * che in produzione è servito dal BFF (sessione nel cookie, niente token nel browser).
 */

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

  private path(appId: string, kind: DocumentKind, id: string, rest: string): string {
    return `/apps/${enc(appId)}/documents/${enc(kind)}/${enc(id)}${rest}`;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.base + path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new RegistryError(0, '');
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
