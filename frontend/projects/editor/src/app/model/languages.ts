import { LANGUAGE_CODE } from './editor-store';

/**
 * Lingue proposte quando se ne aggiunge una alle traduzioni: quelle dell'Unione europea, le più usate nel mondo e
 * alcune varianti di paese. Si può comunque scrivere qualsiasi codice valido.
 */
export const SUGGESTED_LANGUAGES = [
  'it', 'en', 'fr', 'de', 'es', 'pt', 'pt-BR', 'nl', 'pl', 'ro', 'cs', 'sk', 'sl', 'hr', 'hu', 'el', 'bg', 'sv', 'da', 'fi',
  'et', 'lv', 'lt', 'ga', 'mt', 'ca', 'eu', 'gl', 'nb', 'is', 'sq', 'sr', 'bs', 'mk', 'uk', 'ru', 'tr', 'ar', 'he', 'fa',
  'hi', 'bn', 'ur', 'zh', 'ja', 'ko', 'vi', 'th', 'id', 'ms', 'sw', 'en-US', 'en-GB', 'es-MX', 'fr-CA', 'de-CH',
];

/** Nome di una lingua nella lingua indicata (`fr` → «Francese»), dal browser; il codice se il browser non lo conosce. */
export function languageName(code: string, displayLocale: string): string {
  try {
    const name = new Intl.DisplayNames([displayLocale], { type: 'language' }).of(code);
    return name && name !== code ? name.charAt(0).toLocaleUpperCase(displayLocale) + name.slice(1) : code;
  } catch {
    return code;
  }
}

/**
 * La lingua scritta nella casella «Aggiungi lingua»: un codice valido così com'è, oppure il nome di una lingua
 * proposta (nella lingua dell'editor o in inglese, senza badare ad accenti e maiuscole), anche nella forma
 * «Francese (fr)» che mostra l'elenco dei suggerimenti. Null se non si riconosce.
 */
export function languageFromInput(text: string, displayLocale: string): string | null {
  const value = text.trim();
  if (LANGUAGE_CODE.test(value)) return value;
  const inParentheses = /\(([^()]+)\)\s*$/.exec(value)?.[1]?.trim();
  if (inParentheses && LANGUAGE_CODE.test(inParentheses)) return inParentheses;
  const wanted = normalize(value);
  if (!wanted) return null;
  return SUGGESTED_LANGUAGES.find((code) => [displayLocale, 'en'].some((locale) => normalize(languageName(code, locale)) === wanted)) ?? null;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
