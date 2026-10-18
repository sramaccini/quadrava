import { Injectable, InjectionToken } from '@angular/core';
import type { Json } from './doc-ops';

/**
 * Registry client (contracts/registry.yaml 0.5): every screen, the navigation and every theme are separate documents,
 * with immutable versions and publications per environment. Calls are relative to the origin of the editor,
 * which in production is served by the BFF (session in the cookie, no token in the browser).
 *
 * CSRF protection of the BFF: writes send back the token of the `XSRF-TOKEN` cookie in the `X-XSRF-TOKEN` header.
 * If the cookie was not there yet, the BFF answers 403 and creates it: the write is repeated once.
 */

/** Page change (towards the BFF login). Replaceable in tests. */
export const EDITOR_REDIRECT = new InjectionToken<(url: string) => void>('EDITOR_REDIRECT', {
  providedIn: 'root',
  factory: () => (url: string) => globalThis.location.assign(url),
});

/** BFF page that starts the login and then takes the user back to the given address. */
export function loginUrl(returnTo: string): string {
  return `/bff/login?return=${encodeURIComponent(returnTo)}`;
}

/** The CSRF token from the BFF cookie, if there is one. */
export function csrfToken(cookies: string): string | null {
  for (const part of cookies.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === 'XSRF-TOKEN') return decodeURIComponent(value.join('='));
  }
  return null;
}

export type DocumentKind = 'screen' | 'datasources' | 'navigation' | 'theme' | 'messages';

/** Application and environment of the registry chosen in the editor (remembered in the browser), shared by the panels. */
export interface RegistrySettings {
  appId: string;
  env: string;
}

export const REGISTRY_SETTINGS_KEY = 'lc.editor.registry';

/** Saved registry settings; initial environment development (testing and production ask for approved versions). */
export function readRegistrySettings(): RegistrySettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(REGISTRY_SETTINGS_KEY) ?? '{}') as Partial<RegistrySettings>;
    return { appId: typeof parsed.appId === 'string' ? parsed.appId : '', env: typeof parsed.env === 'string' ? parsed.env : 'development' };
  } catch {
    return { appId: '', env: 'development' };
  }
}

/** Review state of a version. */
export type ReviewState = 'draft' | 'in-review' | 'approved' | 'rejected';
export type ReviewAction = 'request' | 'approve' | 'reject';

export interface DocumentVersion {
  hash: string;
  createdAt: string;
  author: string;
  state?: ReviewState;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

/** A validation problem reported by the registry. */
export interface RegistryIssue {
  path: string;
  message: string;
}

/** A reference to another screen: identifier and position in the document (JSON Pointer). */
export interface ScreenReference {
  screen: string;
  path: string;
}

/** Screens referenced by a version and those not published in the environment (or not existing, without environment). */
export interface ReferenceReport {
  env?: string;
  references: ScreenReference[];
  missing: ScreenReference[];
}

/** An application of the registry visible to the user. */
export interface AppSummary {
  id: string;
  name: string;
  documentCount?: number;
}

export interface DocumentSummary {
  kind: DocumentKind;
  id: string;
  latest?: DocumentVersion;
  /** Environment → published hash. */
  publishedEnvironments?: Record<string, string>;
}

/** Registry error: the title of the Problem (RFC 9457) if there is one, otherwise the HTTP status. */
export class RegistryError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** With 400: the validation problems of the document. */
    readonly issues: RegistryIssue[] = [],
    /** With 412: who saved the last version. */
    readonly latestAuthor: string | null = null,
    /** With 409 on publication: the screens referenced and not published in the environment. */
    readonly missingReferences: ScreenReference[] = [],
  ) {
    super(message);
  }
}

/** The document: type and identifier, taken from the property of the content (`screen`, `navigation`, `theme`). */
export function documentRef(kind: DocumentKind, doc: Json): { kind: DocumentKind; id: string } | null {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return null;
  const id = doc[kind];
  return typeof id === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) ? { kind, id } : null;
}

@Injectable({ providedIn: 'root' })
export class RegistryClient {
  /** Root of the registry APIs (same origin). */
  base = '/registry';

  /** Applications visible to the user: it also tells whether the registry is there and whether it asks for sign-in (401). */
  async apps(): Promise<AppSummary[]> {
    return this.call<AppSummary[]>('GET', '/apps');
  }

  async documents(appId: string): Promise<DocumentSummary[]> {
    return this.call<DocumentSummary[]>('GET', `/apps/${enc(appId)}/documents`);
  }

  async versions(appId: string, kind: DocumentKind, id: string): Promise<DocumentVersion[]> {
    return this.call<DocumentVersion[]>('GET', this.path(appId, kind, id, '/versions'));
  }

  /**
   * Saves a version. With `basedOn` (the hash of the version one started from) the registry accepts the save
   * only if nobody saved in the meantime; otherwise RegistryError 412 with the author of the last version.
   */
  async save(appId: string, kind: DocumentKind, id: string, content: Json, basedOn?: string | null): Promise<DocumentVersion> {
    return this.call<DocumentVersion>('POST', this.path(appId, kind, id, '/versions'), content, basedOn ? { 'If-Match': `"${basedOn}"` } : {});
  }

  /** Review: request it (draft or rejected), approve or reject (reviewers only, never the author). */
  async review(appId: string, kind: DocumentKind, id: string, hash: string, action: ReviewAction, note?: string): Promise<DocumentVersion> {
    return this.call<DocumentVersion>('POST', this.path(appId, kind, id, `/versions/${enc(hash)}/review`), note ? { action, note } : { action });
  }

  async version(appId: string, kind: DocumentKind, id: string, hash: string): Promise<Json> {
    return this.call<Json>('GET', this.path(appId, kind, id, `/versions/${enc(hash)}`));
  }

  /** Screens referenced by the version; with `env` those not published there are missing, without it those that do not exist. */
  async references(appId: string, kind: DocumentKind, id: string, hash: string, env?: string): Promise<ReferenceReport> {
    const query = env ? `?env=${enc(env)}` : '';
    return this.call<ReferenceReport>('GET', this.path(appId, kind, id, `/versions/${enc(hash)}/references${query}`));
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
    // First write without CSRF cookie: the BFF answers 403 and meanwhile creates it. Try again once, with the token.
    if (response.status === 403 && method !== 'GET' && !hadToken && csrfToken(document.cookie)) {
      response = await this.send(method, path, body, headers);
    }
    if (!response.ok) {
      let title = '';
      let issues: RegistryIssue[] = [];
      let latestAuthor: string | null = null;
      let missingReferences: ScreenReference[] = [];
      try {
        const problem = (await response.json()) as { title?: unknown; errors?: unknown; latestAuthor?: unknown; missingReferences?: unknown };
        // Only texts meant for the author (title, validation problems, author): never HTML, never the technical detail.
        if (typeof problem.title === 'string') title = problem.title;
        if (Array.isArray(problem.errors)) {
          issues = problem.errors
            .filter((e): e is RegistryIssue => typeof e?.path === 'string' && typeof e?.message === 'string')
            .slice(0, 20)
            .map((e) => ({ path: e.path, message: e.message }));
        }
        if (typeof problem.latestAuthor === 'string') latestAuthor = problem.latestAuthor;
        if (Array.isArray(problem.missingReferences)) {
          missingReferences = problem.missingReferences
            .filter((r): r is ScreenReference => typeof r?.screen === 'string' && typeof r?.path === 'string')
            .slice(0, 20)
            .map((r) => ({ screen: r.screen, path: r.path }));
        }
      } catch {
        // Body missing or not JSON.
      }
      throw new RegistryError(response.status, title, issues, latestAuthor, missingReferences);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}
