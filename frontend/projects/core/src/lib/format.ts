import { markdownToPlain } from './markdown';
import type { ColumnDefinition, Tone } from 'schema';

export interface FormattedValue {
  text: string;
  /** Present only for the `badge` format. */
  tone?: Tone;
}

type FormatSpec = Pick<ColumnDefinition, 'format' | 'currency' | 'badges' | 'valueKey' | 'decimals'>;

/** Language-dependent words: yes/no and the translation of values (`valueKey`). */
export interface FormatLabels {
  yes: string;
  no: string;
  /** Translates a key (with the value as a fallback). If missing, values stay as they are. */
  translate?: (key: string, fallback: string) => string;
}

// Creating a formatter is expensive: one is kept for every combination of language and options.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function number(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) numberFormats.set(key, (format = new Intl.NumberFormat(locale, options)));
  return format;
}

function dateTime(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) dateFormats.set(key, (format = new Intl.DateTimeFormat(locale, options)));
  return format;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns a value of the row into the text to show. It never throws: a value that cannot be
 * formatted (invalid date, non-numeric amount) is shown as it is, and `null` or `undefined` become empty text.
 */
export function formatValue(value: unknown, spec: FormatSpec, locale = 'it-IT', labels: FormatLabels = { yes: 'Sì', no: 'No' }): FormattedValue {
  if (value === null || value === undefined) return { text: '' };
  try {
    switch (spec.format) {
      case 'number': {
        const n = toNumber(value);
        const digits = spec.decimals;
        const options: Intl.NumberFormatOptions = digits === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: digits, maximumFractionDigits: digits };
        return { text: n === null ? String(value) : number(locale, options).format(n) };
      }
      case 'currency': {
        const n = toNumber(value);
        return { text: n === null ? String(value) : number(locale, { style: 'currency', currency: spec.currency ?? 'EUR' }).format(n) };
      }
      case 'percent': {
        // The value is already in percentage points: 10 means 10 %.
        const n = toNumber(value);
        return { text: n === null ? String(value) : `${number(locale, { maximumFractionDigits: 2 }).format(n)} %` };
      }
      case 'date':
      case 'datetime': {
        const date = toDate(value);
        if (!date) return { text: String(value) };
        // A date without time is read in UTC, otherwise west of Greenwich it slips to the day before.
        const dateOnly = typeof value === 'string' && DATE_ONLY.test(value);
        const options: Intl.DateTimeFormatOptions =
          spec.format === 'date' || dateOnly ? { dateStyle: 'short', ...(dateOnly ? { timeZone: 'UTC' } : {}) } : { dateStyle: 'short', timeStyle: 'short' };
        return { text: dateTime(locale, options).format(date) };
      }
      case 'boolean':
        return { text: value === true ? labels.yes : value === false ? labels.no : String(value) };
      case 'markdown':
        // In tables formatted text is shown as plain text (the detail draws it formatted).
        return { text: markdownToPlain(typeof value === 'string' ? value : String(value)).replace(/\n+/g, ' ') };
      case 'badge': {
        const raw = String(value);
        const own = spec.badges && Object.prototype.hasOwnProperty.call(spec.badges, raw) ? spec.badges[raw] : undefined;
        return { text: translated(raw, spec, labels), tone: own ?? 'neutral' };
      }
      default:
        return { text: translated(String(value), spec, labels) };
    }
  } catch {
    return { text: String(value) };
  }
}

function translated(raw: string, spec: FormatSpec, labels: FormatLabels): string {
  return spec.valueKey && labels.translate ? labels.translate(`${spec.valueKey}.${raw}`, raw) : raw;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
