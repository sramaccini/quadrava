import type { NzTagComponent } from 'ng-zorro-antd/tag';
import type { Tone } from 'schema';

let counter = 0;
/** Identificatore univoco per collegare etichette e controlli. */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** Colore NG-ZORRO di un tono semantico: segue i colori del tema (primario, successo, errore). */
export const TONE_COLORS: Record<Tone, NonNullable<NzTagComponent['nzColor']>> = {
  neutral: 'default',
  primary: 'processing',
  success: 'success',
  danger: 'error',
};

/** Data in formato `AAAA-MM-GG` → `Date` locale (mezzanotte), oppure `null` se il testo non è una data valida. */
export function parseIsoDate(value: unknown): Date | null {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `Date` → `AAAA-MM-GG` (giorno locale, senza fuso orario). */
export function toIsoDate(date: Date | null): string | null {
  if (!date) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Data e ora `AAAA-MM-GGTHH:mm` (ora locale, secondi facoltativi) → `Date`, oppure `null` se il testo non è valido. */
export function parseIsoDateTime(value: unknown): Date | null {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value) : null;
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `Date` → `AAAA-MM-GGTHH:mm` (ora locale, senza fuso orario). */
export function toIsoDateTime(date: Date | null): string | null {
  if (!date) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${toIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
