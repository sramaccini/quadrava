import { Injectable, effect, inject, signal } from '@angular/core';
import { Confirmation, I18n, Notifier } from 'core';
import type { Json } from './doc-ops';
import {
  EDITOR_REDIRECT,
  REGISTRY_SETTINGS_KEY,
  RegistryClient,
  RegistryError,
  documentRef,
  loginUrl,
  readRegistrySettings,
  type AppSummary,
  type DocumentKind,
  type DocumentVersion,
  type RegistryIssue,
  type RegistrySettings,
} from './registry-client';

/** What is known about the registry: being checked, reachable, reachable but sign-in is needed, absent. */
export type RegistryStatus = 'checking' | 'available' | 'login' | 'unavailable';

/** Registry document: type and identifier. */
export interface RegistryRef {
  kind: DocumentKind;
  id: string;
}

/**
 * State of the registry shared by the File menu and the Registry panel: application and environment chosen (remembered in the
 * browser), availability of the registry, screens of the application, version every open document starts from,
 * saving of a version.
 *
 * Availability comes from `GET /registry/apps`: 200 = reachable, 401 = sign-in through the BFF needed,
 * any other response (or none, as in the demo editor) = absent.
 */
@Injectable({ providedIn: 'root' })
export class RegistrySession {
  private readonly client = inject(RegistryClient);
  private readonly notifier = inject(Notifier);
  private readonly confirmation = inject(Confirmation);
  private readonly redirect = inject(EDITOR_REDIRECT);
  private readonly i18n = inject(I18n);

  private readonly settings = readRegistrySettings();
  readonly appId = signal(this.settings.appId);
  readonly env = signal(this.settings.env);
  readonly status = signal<RegistryStatus>('checking');
  /** Applications visible to the user, from the last check. */
  readonly apps = signal<AppSummary[]>([]);
  /** Validation problems reported by the registry at the last save. */
  readonly issues = signal<RegistryIssue[]>([]);
  readonly busy = signal(false);
  /** Screens of the application chosen in the registry (empty without registry or without application). */
  readonly screens = signal<string[]>([]);
  /**
   * Version every open document starts from (opened or just saved), by the identifier of the document: the registry uses it for
   * concurrent changes.
   */
  private readonly origins = signal<Record<string, RegistryRef & { hash: string }>>({});

  constructor() {
    effect(() => {
      const settings: RegistrySettings = { appId: this.appId(), env: this.env() };
      try {
        localStorage.setItem(REGISTRY_SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        // see the draft
      }
    });
    // With the registry reachable and an application chosen, its screens are read (the «known screens»).
    effect(() => {
      const appId = this.appId();
      if (this.status() === 'available' && appId) void this.loadScreens(appId);
      else this.screens.set([]);
    });
    void this.check();
  }

  private async loadScreens(appId: string): Promise<void> {
    let screens: string[] = [];
    try {
      const documents = await this.client.documents(appId);
      screens = Array.isArray(documents) ? documents.filter((d) => d?.kind === 'screen' && typeof d.id === 'string').map((d) => d.id) : [];
    } catch {
      // New application or registry no longer reachable: no known screen from the registry.
    }
    // A response arriving after a change of application no longer counts.
    if (appId === this.appId()) this.screens.set(screens);
  }

  /** Checks whether the registry is there (and whether it asks for sign-in); updates the list of applications. */
  async check(): Promise<RegistryStatus> {
    try {
      const apps = await this.client.apps();
      this.apps.set(Array.isArray(apps) ? apps.filter((a) => typeof a?.id === 'string') : []);
      this.status.set('available');
    } catch (e) {
      this.status.set(e instanceof RegistryError && e.status === 401 ? 'login' : 'unavailable');
    }
    return this.status();
  }

  /** The registry can be used from the menu: reachable, or reachable after sign-in. */
  usable(): boolean {
    return this.status() === 'available' || this.status() === 'login';
  }

  login(): void {
    this.redirect(loginUrl(globalThis.location.href));
  }

  /** Hash of the version the document `doc` (identifier) starts from, if `ref` is the one opened from the registry or saved last. */
  basedOn(doc: string, ref: RegistryRef | null): string | null {
    const origin = this.origins()[doc];
    return ref && origin && origin.kind === ref.kind && origin.id === ref.id ? origin.hash : null;
  }

  /** The version the document `doc` starts from (null: none, for a new document, a file or an example). */
  setOrigin(doc: string, ref: RegistryRef | null, hash: string | null): void {
    const { [doc]: _previous, ...rest } = this.origins();
    this.origins.set(ref && hash ? { ...rest, [doc]: { ...ref, hash } } : rest);
  }

  /**
   * Saves the document `doc` (identifier of the open document) as a new version in the chosen application. Returns the saved version, or null if it was not
   * saved: errors reported here (with the validation problems in `issues`), concurrent changes not
   * confirmed, document without a valid identifier.
   */
  async save(doc: string, kind: DocumentKind, content: Json): Promise<DocumentVersion | null> {
    const ref = documentRef(kind, content);
    const appId = this.appId();
    if (!ref || !appId) return null;
    this.issues.set([]);
    this.busy.set(true);
    try {
      const version = await this.client.save(appId, ref.kind, ref.id, content, this.basedOn(doc, ref));
      this.setOrigin(doc, ref, version.hash);
      this.status.set('available');
      if (ref.kind === 'screen' && !this.screens().includes(ref.id)) this.screens.update((s) => [...s, ref.id]);
      this.notifier.toast(this.i18n.t('ed.registry.saved', { hash: version.hash.slice(0, 10) }));
      return version;
    } catch (e) {
      if (e instanceof RegistryError && e.status === 412) {
        this.busy.set(false);
        // Someone saved after the version one started from: save anyway only if the author confirms.
        if (!(await this.confirmation.confirm(this.i18n.t('ed.registry.conflict', { author: e.latestAuthor ?? '?' })))) return null;
        this.setOrigin(doc, null, null);
        return this.save(doc, kind, content);
      }
      if (e instanceof RegistryError && e.status === 400 && e.issues.length) {
        this.issues.set(e.issues);
        this.notifier.toast(this.i18n.t('ed.registry.invalid'), 'error');
      } else this.report(e);
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  /** Reports a registry error in an understandable way, without the technical details of the service. */
  report(e: unknown): void {
    const status = e instanceof RegistryError ? e.status : 0;
    if (status === 401) {
      this.status.set('login');
      this.notifier.toast(this.i18n.t('ed.registry.loginNeeded'), 'error');
      return;
    }
    // 403 with a title (for example «The author of a version cannot approve it») shows it; without one, the generic message.
    const titled = e instanceof RegistryError && e.message !== '';
    const key =
      status === 0 ? 'ed.registry.unreachable' : status === 403 && !titled ? 'ed.registry.forbidden' : status === 404 ? 'ed.registry.notFound' : 'ed.registry.rejected';
    // The title of the Problem is a text meant for the author (for example «identifier different from the path»).
    this.notifier.toast(this.i18n.t(key, { reason: e instanceof RegistryError ? e.message : '' }), 'error');
  }
}
