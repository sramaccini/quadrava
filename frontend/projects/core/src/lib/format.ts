import { InjectionToken } from '@angular/core';
import type { ColumnDefinition, Tone } from 'schema';

/** Lingua usata per date, importi e numeri. Per ora una sola per applicazione. */
export const LOWCODE_LOCALE = new InjectionToken<string>('LOWCODE_LOCALE', { providedIn: 'root', factory: () => 'it-IT' });

export interface FormattedValue {
  text: string;
  /** Presente solo per il formato `badge`. */
  tone?: Tone;
}

type FormatSpec = Pick<ColumnDefinition, 'format' | 'currency' | 'badges'>;

// Creare un formattatore costa: se ne tiene uno per ogni combinazione di lingua e opzioni.
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
 * Trasforma un valore della riga nel testo da mostrare. Non lancia mai eccezioni: un valore che non si può
 * formattare (data non valida, importo non numerico) viene mostrato com'è, e `null` o `undefined` diventano testo vuoto.
 */
export function formatValue(value: unknown, spec: FormatSpec, locale = 'it-IT'): FormattedValue {
  if (value === null || value === undefined) return { text: '' };
  try {
    switch (spec.format) {
      case 'currency': {
        const n = toNumber(value);
        return { text: n === null ? String(value) : number(locale, { style: 'currency', currency: spec.currency ?? 'EUR' }).format(n) };
      }
      case 'percent': {
        // Il valore è già in punti percentuali: 10 significa 10 %.
        const n = toNumber(value);
        return { text: n === null ? String(value) : `${number(locale, { maximumFractionDigits: 2 }).format(n)} %` };
      }
      case 'date':
      case 'datetime': {
        const date = toDate(value);
        if (!date) return { text: String(value) };
        // Una data senza ora si legge in UTC, altrimenti nei fusi a ovest di Greenwich scivola al giorno prima.
        const dateOnly = typeof value === 'string' && DATE_ONLY.test(value);
        const options: Intl.DateTimeFormatOptions =
          spec.format === 'date' || dateOnly ? { dateStyle: 'short', ...(dateOnly ? { timeZone: 'UTC' } : {}) } : { dateStyle: 'short', timeStyle: 'short' };
        return { text: dateTime(locale, options).format(date) };
      }
      case 'boolean':
        return { text: value === true ? 'Sì' : value === false ? 'No' : String(value) };
      case 'badge': {
        const text = String(value);
        const own = spec.badges && Object.prototype.hasOwnProperty.call(spec.badges, text) ? spec.badges[text] : undefined;
        return { text, tone: own ?? 'neutral' };
      }
      default:
        return { text: String(value) };
    }
  } catch {
    return { text: String(value) };
  }
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
