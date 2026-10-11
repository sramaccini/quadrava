import type { SortSpec } from 'schema';

/*
 * Operazioni sulle righe caricate in pagina (ordinamento, e più avanti filtri, gruppi e totali).
 * Funzioni pure: non conoscono Angular e non lanciano eccezioni.
 */

export type Row = Record<string, unknown>;

const collators = new Map<string, Intl.Collator>();
function collator(locale: string): Intl.Collator {
  let c = collators.get(locale);
  if (!c) collators.set(locale, (c = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })));
  return c;
}

/**
 * Confronto tra due valori di una colonna: numeri come numeri, booleani (falso prima di vero), testi secondo la lingua
 * (con i numeri nel testo in ordine naturale, quindi le date ISO restano in ordine). I valori vuoti vanno sempre in fondo.
 */
export function compareValues(a: unknown, b: unknown, locale = 'it-IT'): number {
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator(locale).compare(String(a), String(b));
}

/** Righe ordinate secondo `sort` (copia: l'originale non cambia). Ordinamento stabile; i vuoti restano in fondo in entrambe le direzioni. */
export function sortRows(rows: readonly Row[], sort: SortSpec | null, locale = 'it-IT'): Row[] {
  if (!sort) return [...rows];
  const sign = sort.direction === 'desc' ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const a = x.row[sort.field];
      const b = y.row[sort.field];
      const emptyA = a === null || a === undefined || a === '';
      const emptyB = b === null || b === undefined || b === '';
      if (emptyA || emptyB) return emptyA === emptyB ? x.index - y.index : emptyA ? 1 : -1;
      return sign * compareValues(a, b, locale) || x.index - y.index;
    })
    .map((x) => x.row);
}

/** Legge un ordinamento dallo stato: accetta solo `{ field: testo, direction: 'asc' | 'desc' }`. */
export function asSort(value: unknown): SortSpec | null {
  if (value === null || typeof value !== 'object') return null;
  const { field, direction } = value as Record<string, unknown>;
  return typeof field === 'string' && field && (direction === 'asc' || direction === 'desc') ? { field, direction } : null;
}
