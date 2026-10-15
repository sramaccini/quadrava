import { Injectable, computed, signal } from '@angular/core';
import { formatMessage } from 'expressions';

/** A catalogue: key → message (simplified ICU format, see `formatMessage`). */
export type Messages = Record<string, string>;

/** From the language of the application (`it`) to the tag used by `Intl` (`it-IT`). A language not listed is used as it is. */
const INTL_TAGS: Record<string, string> = { it: 'it-IT', en: 'en-GB' };

/**
 * Active language and translations. Messages have two layers: the application's (which wins) and the built-in one
 * of the libraries (`lc.*` keys). Lookup of a key, in order: active language, default language, fallback text
 * written in the JSON, the key itself. The result is always plain text.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  /** Active language (`it`, `en`…). Changing it updates every text without reloading. */
  readonly locale = signal('it');
  /** Language used when a translation is missing. */
  readonly defaultLocale = signal('it');
  /** `Intl` tag of the active language. */
  readonly intlLocale = computed(() => intlTag(this.locale()));

  private readonly app = signal<Record<string, Messages>>({});
  private readonly builtin = signal<Record<string, Messages>>({});

  setLocale(locale: string): void {
    this.locale.set(locale);
  }

  /** Adds (or replaces) the messages of a language. `layer: 'builtin'` is reserved for the libraries. */
  addMessages(locale: string, messages: Messages, layer: 'app' | 'builtin' = 'app'): void {
    const store = layer === 'app' ? this.app : this.builtin;
    store.update((all) => ({ ...all, [locale]: { ...all[locale], ...messages } }));
  }

  /** Languages that have at least one message of the application. */
  hasMessages(locale: string): boolean {
    return Object.keys(this.app()[locale] ?? {}).length > 0;
  }

  /** The raw message of a key in the given language, without fallback. */
  raw(key: string, locale: string): string | undefined {
    return this.app()[locale]?.[key] ?? this.builtin()[locale]?.[key];
  }

  /** Looks up the key and formats it with the parameters. `found` is false if it fell back to the key itself. */
  lookup(key: string, fallback?: string, params: Record<string, unknown> = {}): { text: string; found: boolean } {
    const locale = this.locale();
    const pattern = this.raw(key, locale) ?? this.raw(key, this.defaultLocale()) ?? fallback;
    if (pattern === undefined) return { text: key, found: false };
    return { text: formatMessage(pattern, params, intlTag(locale)), found: true };
  }

  /** Like `lookup`, returning only the text. Used in component templates for the runtime's own words. */
  t(key: string, params: Record<string, unknown> = {}, fallback?: string): string {
    return this.lookup(key, fallback, params).text;
  }
}

export function intlTag(locale: string): string {
  return INTL_TAGS[locale] ?? locale;
}

/**
 * Loads the application catalogues (one flat JSON file per language) into the `I18n` service.
 * It does not throw: it returns the list of problems (missing file, invalid JSON, non-text values) to show in diagnostics.
 * A language without a file is not a blocking error: it falls back to the default language.
 */
/**
 * Loads the catalogues of the given languages from a function that returns, per language, the key → text object (for
 * example `DefinitionSource.messages`). Entries that are not texts are dropped and reported; a catalogue that does not
 * load does not block the others. Returns the problems found (for the technical reports).
 */
export async function loadCatalogs(i18n: I18n, locales: readonly string[], load: (locale: string) => Promise<unknown>): Promise<string[]> {
  const problems: string[] = [];
  await Promise.all(
    locales.map(async (locale) => {
      try {
        const doc = await load(locale);
        if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('the catalogue must be a key → text object');
        const messages: Messages = {};
        for (const [key, value] of Object.entries(doc)) {
          if (typeof value === 'string') messages[key] = value;
          else problems.push(`${locale}: the key ${key} is not a text`);
        }
        i18n.addMessages(locale, messages);
      } catch (e) {
        problems.push(`${locale}: catalogue not loaded (${e instanceof Error ? e.message : String(e)})`);
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
        if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('the catalogue must be a key → text object');
        const messages: Messages = {};
        for (const [key, value] of Object.entries(doc)) {
          if (typeof value === 'string') messages[key] = value;
          else problems.push(`${locale}: the key ${key} is not a text`);
        }
        i18n.addMessages(locale, messages);
      } catch (e) {
        problems.push(`${locale}: catalogue not loaded (${e instanceof Error ? e.message : String(e)})`);
      }
    }),
  );
  return problems;
}
