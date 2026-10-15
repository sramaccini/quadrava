import type { NzTagComponent } from 'ng-zorro-antd/tag';
import type { Tone } from 'schema';

let counter = 0;
/** Unique identifier to connect labels and controls. */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** NG-ZORRO colour of a semantic tone: it follows the theme colours (primary, success, error). */
export const TONE_COLORS: Record<Tone, NonNullable<NzTagComponent['nzColor']>> = {
  neutral: 'default',
  primary: 'processing',
  success: 'success',
  danger: 'error',
};

/** Date in `YYYY-MM-DD` format → local `Date` (midnight), or `null` if the text is not a valid date. */
export function parseIsoDate(value: unknown): Date | null {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `Date` → `YYYY-MM-DD` (local day, without time zone). */
export function toIsoDate(date: Date | null): string | null {
  if (!date) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Date and time `YYYY-MM-DDTHH:mm` (local time, optional seconds) → `Date`, or `null` if the text is not valid. */
export function parseIsoDateTime(value: unknown): Date | null {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value) : null;
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `Date` → `YYYY-MM-DDTHH:mm` (local time, without time zone). */
export function toIsoDateTime(date: Date | null): string | null {
  if (!date) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${toIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
