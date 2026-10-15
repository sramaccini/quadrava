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

/** Che cosa si sa del registro: in verifica, raggiungibile, raggiungibile ma serve l'accesso, assente. */
export type RegistryStatus = 'checking' | 'available' | 'login' | 'unavailable';

/** Documento del registro: tipo e identificativo. */
export interface RegistryRef {
  kind: DocumentKind;
  id: string;
}

/**
 * Stato del registro condiviso dal menu File e dal pannello Registro: applicazione e ambiente scelti (ricordati nel
 * browser), disponibilità del registro, schermate dell'applicazione, versione da cui parte il documento aperto,
 * salvataggio di una versione.
 *
 * La disponibilità si ricava da `GET /registry/apps`: 200 = raggiungibile, 401 = serve l'accesso attraverso il BFF,
 * qualunque altra risposta (o nessuna, come nell'editor della demo) = assente.
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
  /** Applicazioni visibili all'utente, dall'ultima verifica. */
  readonly apps = signal<AppSummary[]>([]);
  /** Problemi di validazione segnalati dal registro all'ultimo salvataggio. */
  readonly issues = signal<RegistryIssue[]>([]);
  readonly busy = signal(false);
  /** Schermate dell'applicazione scelta nel registro (vuoto senza registro o senza applicazione). */
  readonly screens = signal<string[]>([]);
  /** Versione da cui parte il documento aperto (aperta o appena salvata): il registro la usa per le modifiche concorrenti. */
  private readonly origin = signal<(RegistryRef & { hash: string }) | null>(null);

  constructor() {
    effect(() => {
      const settings: RegistrySettings = { appId: this.appId(), env: this.env() };
      try {
        localStorage.setItem(REGISTRY_SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        // vedi la bozza
      }
    });
    // Con il registro raggiungibile e un'applicazione scelta, se ne leggono le schermate (le «schermate note»).
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
      // Applicazione nuova o registro non più raggiungibile: nessuna schermata nota dal registro.
    }
    // Una risposta arrivata dopo un cambio di applicazione non vale più.
    if (appId === this.appId()) this.screens.set(screens);
  }

  /** Verifica se il registro c'è (e se chiede l'accesso); aggiorna l'elenco delle applicazioni. */
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

  /** Il registro si può usare dal menu: raggiungibile, oppure raggiungibile dopo l'accesso. */
  usable(): boolean {
    return this.status() === 'available' || this.status() === 'login';
  }

  login(): void {
    this.redirect(loginUrl(globalThis.location.href));
  }

  /** Hash della versione da cui parte il documento indicato, se è quello aperto dal registro o salvato per ultimo. */
  basedOn(ref: RegistryRef | null): string | null {
    const origin = this.origin();
    return ref && origin && origin.kind === ref.kind && origin.id === ref.id ? origin.hash : null;
  }

  setOrigin(ref: RegistryRef | null, hash: string | null): void {
    this.origin.set(ref && hash ? { ...ref, hash } : null);
  }

  /**
   * Salva il documento come nuova versione nell'applicazione scelta. Restituisce la versione salvata, oppure null se non
   * è stato salvato: errori segnalati qui (con i problemi di validazione in `issues`), modifiche concorrenti non
   * confermate, documento senza identificativo valido.
   */
  async save(kind: DocumentKind, doc: Json): Promise<DocumentVersion | null> {
    const ref = documentRef(kind, doc);
    const appId = this.appId();
    if (!ref || !appId) return null;
    this.issues.set([]);
    this.busy.set(true);
    try {
      const version = await this.client.save(appId, ref.kind, ref.id, doc, this.basedOn(ref));
      this.setOrigin(ref, version.hash);
      this.status.set('available');
      if (ref.kind === 'screen' && !this.screens().includes(ref.id)) this.screens.update((s) => [...s, ref.id]);
      this.notifier.toast(this.i18n.t('ed.registry.saved', { hash: version.hash.slice(0, 10) }));
      return version;
    } catch (e) {
      if (e instanceof RegistryError && e.status === 412) {
        this.busy.set(false);
        // Qualcuno ha salvato dopo la versione da cui si è partiti: si salva comunque solo se l'autore lo conferma.
        if (!(await this.confirmation.confirm(this.i18n.t('ed.registry.conflict', { author: e.latestAuthor ?? '?' })))) return null;
        this.setOrigin(null, null);
        return this.save(kind, doc);
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

  /** Segnala un errore del registro in modo comprensibile, senza i dettagli tecnici del servizio. */
  report(e: unknown): void {
    const status = e instanceof RegistryError ? e.status : 0;
    if (status === 401) {
      this.status.set('login');
      this.notifier.toast(this.i18n.t('ed.registry.loginNeeded'), 'error');
      return;
    }
    // 403 con un titolo (per esempio «L'autore di una versione non può approvarla») lo mostra; senza, il messaggio generico.
    const titled = e instanceof RegistryError && e.message !== '';
    const key =
      status === 0 ? 'ed.registry.unreachable' : status === 403 && !titled ? 'ed.registry.forbidden' : status === 404 ? 'ed.registry.notFound' : 'ed.registry.rejected';
    // Il titolo del Problem è un testo pensato per l'autore (per esempio «identificativo diverso dal percorso»).
    this.notifier.toast(this.i18n.t(key, { reason: e instanceof RegistryError ? e.message : '' }), 'error');
  }
}
