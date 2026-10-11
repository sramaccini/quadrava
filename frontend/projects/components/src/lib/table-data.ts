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

/** Numero di un valore di riga: numeri e testi numerici; tutto il resto non conta. */
export function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Valore aggregato di un campo sulle righe date: `count` conta i valori non vuoti, gli altri considerano solo
 * i valori numerici. Senza valori numerici restituisce `null` (cella vuota), mai `NaN`.
 */
export function aggregate(rows: readonly Row[], field: string, kind: 'sum' | 'avg' | 'min' | 'max' | 'count'): number | null {
  if (kind === 'count') return rows.filter((r) => r[field] !== null && r[field] !== undefined && r[field] !== '').length;
  const values = rows.map((r) => numeric(r[field])).filter((n): n is number => n !== null);
  if (values.length === 0) return null;
  switch (kind) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
  }
}

/** Filtro di una colonna della datatable. */
export type ColumnFilter =
  | { kind: 'text'; text: string }
  | { kind: 'select'; values: unknown[] }
  | { kind: 'number'; from: number | null; to: number | null }
  | { kind: 'date'; from: string | null; to: string | null };

/** Il filtro restringe davvero le righe? Un filtro vuoto non conta. */
export function isActiveFilter(filter: ColumnFilter | undefined): boolean {
  if (!filter) return false;
  switch (filter.kind) {
    case 'text':
      return filter.text.trim() !== '';
    case 'select':
      return filter.values.length > 0;
    default:
      return filter.from !== null || filter.to !== null;
  }
}

/**
 * Righe che soddisfano tutti i filtri attivi. Testo: contiene (senza distinguere maiuscole e minuscole) nel testo
 * mostrato o nel valore; scelta: uno dei valori; numero e data: dentro l'intervallo (estremi compresi). Un valore
 * vuoto non soddisfa un filtro attivo.
 */
export function filterRows(rows: readonly Row[], filters: Readonly<Record<string, ColumnFilter>>, shown: (row: Row, field: string) => string): Row[] {
  const active = Object.entries(filters).filter(([, f]) => isActiveFilter(f));
  if (active.length === 0) return [...rows];
  return rows.filter((row) =>
    active.every(([field, filter]) => {
      const value = row[field];
      switch (filter.kind) {
        case 'text': {
          if (value === null || value === undefined || value === '') return false;
          const needle = filter.text.trim().toLowerCase();
          return shown(row, field).toLowerCase().includes(needle) || String(value).toLowerCase().includes(needle);
        }
        case 'select':
          return filter.values.includes(value);
        case 'number': {
          const n = numeric(value);
          return n !== null && (filter.from === null || n >= filter.from) && (filter.to === null || n <= filter.to);
        }
        case 'date': {
          const day = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
          return day !== null && (filter.from === null || day >= filter.from) && (filter.to === null || day <= filter.to);
        }
      }
    }),
  );
}

/** Valori distinti di una colonna, in ordine (per il filtro a scelta). */
export function distinctValues(rows: readonly Row[], field: string, locale = 'it-IT'): unknown[] {
  const seen = new Set<unknown>();
  for (const row of rows) {
    const v = row[field];
    if (v !== null && v !== undefined && v !== '') seen.add(v);
  }
  return [...seen].sort((a, b) => compareValues(a, b, locale));
}

export interface RowGroup {
  /** Chiave univoca del gruppo (percorso dei valori), per aprirlo e chiuderlo. */
  key: string;
  field: string;
  value: unknown;
  level: number;
  rows: Row[];
  children: RowGroup[];
}

/** Raggruppa le righe per i campi dati, in ordine; i gruppi sono in ordine di valore, le righe restano nel loro ordine. */
export function groupRows(rows: readonly Row[], fields: readonly string[], locale = 'it-IT', level = 0, parent = ''): RowGroup[] {
  if (level >= fields.length) return [];
  const field = fields[level];
  const buckets = new Map<unknown, Row[]>();
  for (const row of rows) {
    const value = row[field] ?? null;
    const bucket = buckets.get(value);
    if (bucket) bucket.push(row);
    else buckets.set(value, [row]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => compareValues(a, b, locale))
    .map(([value, items]) => {
      const key = `${parent}/${field}=${JSON.stringify(value)}`;
      return { key, field, value, level, rows: items, children: groupRows(items, fields, locale, level + 1, key) };
    });
}

export type DisplayItem = { kind: 'group'; group: RowGroup } | { kind: 'row'; row: Row; level: number };

/** Elenco da disegnare: intestazioni dei gruppi e righe, saltando il contenuto dei gruppi chiusi. */
export function flattenGroups(groups: readonly RowGroup[], collapsed: ReadonlySet<string>, depth: number): DisplayItem[] {
  const out: DisplayItem[] = [];
  for (const group of groups) {
    out.push({ kind: 'group', group });
    if (collapsed.has(group.key)) continue;
    if (group.children.length) out.push(...flattenGroups(group.children, collapsed, depth));
    else for (const row of group.rows) out.push({ kind: 'row', row, level: depth });
  }
  return out;
}
