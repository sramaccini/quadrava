import { Injectable, InjectionToken } from '@angular/core';
import type { Json } from './doc-ops';

/**
 * Client del registro (contracts/registry.yaml 0.3): ogni schermata, la navigazione e ogni tema sono documenti
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

export type DocumentKind = 'screen' | 'navigation' | 'theme' | 'messages';

/** Applicazione e ambiente del registro scelti nell'editor (ricordati nel browser), condivisi dai pannelli. */
export interface RegistrySettings {
  appId: string;
  env: string;
}

export const REGISTRY_SETTINGS_KEY = 'lc.editor.registry';

/** Impostazioni del registro salvate; ambiente iniziale sviluppo (collaudo e produzione chiedono versioni approvate). */
export function readRegistrySettings(): RegistrySettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(REGISTRY_SETTINGS_KEY) ?? '{}') as Partial<RegistrySettings>;
    return { appId: typeof parsed.appId === 'string' ? parsed.appId : '', env: typeof parsed.env === 'string' ? parsed.env : 'sviluppo' };
  } catch {
    return { appId: '', env: 'sviluppo' };
  }
}

/** Stato di revisione di una versione. */
export type ReviewState = 'bozza' | 'in-revisione' | 'approvata' | 'respinta';
export type ReviewAction = 'richiedi' | 'approva' | 'respingi';

export interface DocumentVersion {
  hash: string;
  createdAt: string;
  author: string;
  state?: ReviewState;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

/** Un problema di validazione segnalato dal registro. */
export interface RegistryIssue {
  path: string;
  message: string;
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
    /** Con 400: i problemi di validazione del documento. */
    readonly issues: RegistryIssue[] = [],
    /** Con 412: chi ha salvato l'ultima versione. */
    readonly latestAuthor: string | null = null,
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

  /**
   * Salva una versione. Con `basedOn` (l'hash della versione da cui si è partiti) il registro accetta il salvataggio
   * solo se nessuno ha salvato nel frattempo; altrimenti RegistryError 412 con l'autore dell'ultima versione.
   */
  async save(appId: string, kind: DocumentKind, id: string, content: Json, basedOn?: string | null): Promise<DocumentVersion> {
    return this.call<DocumentVersion>('POST', this.path(appId, kind, id, '/versions'), content, basedOn ? { 'If-Match': `"${basedOn}"` } : {});
  }

  /** Revisione: chiedila (bozza o respinta), approva o respingi (solo i revisori, mai l'autore). */
  async review(appId: string, kind: DocumentKind, id: string, hash: string, action: ReviewAction, note?: string): Promise<DocumentVersion> {
    return this.call<DocumentVersion>('POST', this.path(appId, kind, id, `/versions/${enc(hash)}/review`), note ? { action, note } : { action });
  }

  async version(appId: string, kind: DocumentKind, id: string, hash: string): Promise<Json> {
    return this.call<Json>('GET', this.path(appId, kind, id, `/versions/${enc(hash)}`));
  }

  async publish(appId: string, kind: DocumentKind, id: string, env: string, hash: string): Promise<void> {
    await this.call<void>('PUT', this.path(appId, kind, id, `/published?env=${enc(env)}`), { hash });
  }

  private async send(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...extra };
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

  private async call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const hadToken = csrfToken(document.cookie) !== null;
    let response = await this.send(method, path, body, headers);
    // Prima scrittura senza cookie CSRF: il BFF risponde 403 e intanto lo crea. Si riprova una volta, con il token.
    if (response.status === 403 && method !== 'GET' && !hadToken && csrfToken(document.cookie)) {
      response = await this.send(method, path, body, headers);
    }
    if (!response.ok) {
      let title = '';
      let issues: RegistryIssue[] = [];
      let latestAuthor: string | null = null;
      try {
        const problem = (await response.json()) as { title?: unknown; errors?: unknown; latestAuthor?: unknown };
        // Solo testi pensati per l'autore (titolo, problemi di validazione, autore): mai HTML, mai il dettaglio tecnico.
        if (typeof problem.title === 'string') title = problem.title;
        if (Array.isArray(problem.errors)) {
          issues = problem.errors
            .filter((e): e is RegistryIssue => typeof e?.path === 'string' && typeof e?.message === 'string')
            .slice(0, 20)
            .map((e) => ({ path: e.path, message: e.message }));
        }
        if (typeof problem.latestAuthor === 'string') latestAuthor = problem.latestAuthor;
      } catch {
        // Corpo assente o non JSON.
      }
      throw new RegistryError(response.status, title, issues, latestAuthor);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}
