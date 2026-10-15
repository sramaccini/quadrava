import { LANGUAGE_CODE } from './editor-store';

/**
 * Languages offered when one is added to the translations: those of the European Union, the most used in the world and
 * some country variants. Any valid code can be typed anyway.
 */
export const SUGGESTED_LANGUAGES = [
  'it', 'en', 'fr', 'de', 'es', 'pt', 'pt-BR', 'nl', 'pl', 'ro', 'cs', 'sk', 'sl', 'hr', 'hu', 'el', 'bg', 'sv', 'da', 'fi',
  'et', 'lv', 'lt', 'ga', 'mt', 'ca', 'eu', 'gl', 'nb', 'is', 'sq', 'sr', 'bs', 'mk', 'uk', 'ru', 'tr', 'ar', 'he', 'fa',
  'hi', 'bn', 'ur', 'zh', 'ja', 'ko', 'vi', 'th', 'id', 'ms', 'sw', 'en-US', 'en-GB', 'es-MX', 'fr-CA', 'de-CH',
];

/** Name of a language in the given language (`fr` → «French»), from the browser; the code if the browser does not know it. */
export function languageName(code: string, displayLocale: string): string {
  try {
    const name = new Intl.DisplayNames([displayLocale], { type: 'language' }).of(code);
    return name && name !== code ? name.charAt(0).toLocaleUpperCase(displayLocale) + name.slice(1) : code;
  } catch {
    return code;
  }
}

/**
 * The language typed in the «Add language» box: a valid code as it is, or the name of an offered
 * language (in the editor's language or in English, ignoring accents and case), also in the form
 * «French (fr)» shown by the list of suggestions. Null if it is not recognised.
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
