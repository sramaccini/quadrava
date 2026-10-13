import { Injectable, computed, signal } from '@angular/core';
import { formatMessage } from 'expressions';

/** Un catalogo: chiave → messaggio (formato ICU semplificato, vedi `formatMessage`). */
export type Messages = Record<string, string>;

/** Dalla lingua dell'applicazione (`it`) al tag usato da `Intl` (`it-IT`). Una lingua non elencata si usa così com'è. */
const INTL_TAGS: Record<string, string> = { it: 'it-IT', en: 'en-GB' };

/**
 * Lingua attiva e traduzioni. I messaggi hanno due strati: quello dell'applicazione (vince) e quello integrato
 * delle librerie (chiavi `lc.*`). Ricerca di una chiave, nell'ordine: lingua attiva, lingua predefinita, testo di ripiego
 * scritto nel JSON, la chiave stessa. Il risultato è sempre testo semplice.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  /** Lingua attiva (`it`, `en`…). Cambiandola si aggiornano tutti i testi senza ricaricare. */
  readonly locale = signal('it');
  /** Lingua a cui si ricade quando manca una traduzione. */
  readonly defaultLocale = signal('it');
  /** Tag per `Intl` della lingua attiva. */
  readonly intlLocale = computed(() => intlTag(this.locale()));

  private readonly app = signal<Record<string, Messages>>({});
  private readonly builtin = signal<Record<string, Messages>>({});

  setLocale(locale: string): void {
    this.locale.set(locale);
  }

  /** Aggiunge (o sostituisce) i messaggi di una lingua. `layer: 'builtin'` è riservato alle librerie. */
  addMessages(locale: string, messages: Messages, layer: 'app' | 'builtin' = 'app'): void {
    const store = layer === 'app' ? this.app : this.builtin;
    store.update((all) => ({ ...all, [locale]: { ...all[locale], ...messages } }));
  }

  /** Lingue per cui esiste almeno un messaggio dell'applicazione. */
  hasMessages(locale: string): boolean {
    return Object.keys(this.app()[locale] ?? {}).length > 0;
  }

  /** Il messaggio grezzo di una chiave nella lingua indicata, senza ripiego. */
  raw(key: string, locale: string): string | undefined {
    return this.app()[locale]?.[key] ?? this.builtin()[locale]?.[key];
  }

  /** Cerca la chiave e formatta con i parametri. `found` è falso se si è ripiegato sulla chiave stessa. */
  lookup(key: string, fallback?: string, params: Record<string, unknown> = {}): { text: string; found: boolean } {
    const locale = this.locale();
    const pattern = this.raw(key, locale) ?? this.raw(key, this.defaultLocale()) ?? fallback;
    if (pattern === undefined) return { text: key, found: false };
    return { text: formatMessage(pattern, params, intlTag(locale)), found: true };
  }

  /** Come `lookup`, restituendo solo il testo. Si usa nei template dei componenti per le scritte del runtime. */
  t(key: string, params: Record<string, unknown> = {}, fallback?: string): string {
    return this.lookup(key, fallback, params).text;
  }
}

export function intlTag(locale: string): string {
  return INTL_TAGS[locale] ?? locale;
}

/**
 * Carica i cataloghi dell'applicazione (un file JSON piatto per lingua) nel servizio `I18n`.
 * Non lancia: restituisce l'elenco dei problemi (file mancante, JSON non valido, valori non testuali) da mostrare in diagnostica.
 * Una lingua senza file non è un errore bloccante: ripiega sulla lingua predefinita.
 */
/**
 * Carica i cataloghi delle lingue indicate da una funzione che restituisce, per lingua, l'oggetto chiave → testo (per
 * esempio `DefinitionSource.messages`). Le voci che non sono testi si scartano e si segnalano; un catalogo che non si
 * carica non blocca gli altri. Restituisce i problemi incontrati (per le segnalazioni tecniche).
 */
export async function loadCatalogs(i18n: I18n, locales: readonly string[], load: (locale: string) => Promise<unknown>): Promise<string[]> {
  const problems: string[] = [];
  await Promise.all(
    locales.map(async (locale) => {
      try {
        const doc = await load(locale);
        if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('il catalogo deve essere un oggetto chiave → testo');
        const messages: Messages = {};
        for (const [key, value] of Object.entries(doc)) {
          if (typeof value === 'string') messages[key] = value;
          else problems.push(`${locale}: la chiave ${key} non è un testo`);
        }
        i18n.addMessages(locale, messages);
      } catch (e) {
        problems.push(`${locale}: catalogo non caricato (${e instanceof Error ? e.message : String(e)})`);
      }
    }),
  );
  return problems;
}

export async function loadMessages(
  i18n: I18n,
  locales: readonly string[],
  urlFor: (locale: string) => string,
  fetcher: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> = (url) => fetch(url),
): Promise<string[]> {
  const problems: string[] = [];
  await Promise.all(
    locales.map(async (locale) => {
      try {
        const response = await fetcher(urlFor(locale));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const doc = await response.json();
        if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('il catalogo deve essere un oggetto chiave → testo');
        const messages: Messages = {};
        for (const [key, value] of Object.entries(doc)) {
          if (typeof value === 'string') messages[key] = value;
          else problems.push(`${locale}: la chiave ${key} non è un testo`);
        }
        i18n.addMessages(locale, messages);
      } catch (e) {
        problems.push(`${locale}: catalogo non caricato (${e instanceof Error ? e.message : String(e)})`);
      }
    }),
  );
  return problems;
}
