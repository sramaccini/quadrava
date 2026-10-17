import type { SortSpec } from 'schema';

/*
 * Operations on the rows loaded in the page (sorting, filters, groups and totals).
 * Pure functions: they know nothing of Angular and do not throw.
 */

export type Row = Record<string, unknown>;

const collators = new Map<string, Intl.Collator>();
function collator(locale: string): Intl.Collator {
  let c = collators.get(locale);
  if (!c) collators.set(locale, (c = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })));
  return c;
}

/**
 * Comparison between two values of a column: numbers as numbers, booleans (false before true), texts according to the
 * language (with numbers in the text in natural order, so ISO dates stay in order). Empty values always go last.
 */
export function compareValues(a: unknown, b: unknown, locale = 'en-GB'): number {
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator(locale).compare(String(a), String(b));
}

/** Rows sorted according to `sort` (a copy: the original does not change). Stable sorting; empty values stay last in both directions. */
export function sortRows(rows: readonly Row[], sort: SortSpec | null, locale = 'en-GB'): Row[] {
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

/** Reads a sorting from the state: it accepts only `{ field: text, direction: 'asc' | 'desc' }`. */
export function asSort(value: unknown): SortSpec | null {
  if (value === null || typeof value !== 'object') return null;
  const { field, direction } = value as Record<string, unknown>;
  return typeof field === 'string' && field && (direction === 'asc' || direction === 'desc') ? { field, direction } : null;
}

/** Number of a row value: numbers and numeric texts; everything else does not count. */
export function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Aggregated value of a field over the given rows: `count` counts the non-empty values, the others consider only
 * numeric values. Without numeric values it returns `null` (empty cell), never `NaN`.
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

/** Filter of a datatable column. */
export type ColumnFilter =
  | { kind: 'text'; text: string }
  | { kind: 'select'; values: unknown[] }
  | { kind: 'number'; from: number | null; to: number | null }
  | { kind: 'date'; from: string | null; to: string | null };

/** Does the filter really narrow the rows? An empty filter does not count. */
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
 * Rows that satisfy all the active filters. Text: contains (case-insensitive) in the shown text
 * or in the value; choice: one of the values; number and date: inside the range (bounds included). An empty
 * value does not satisfy an active filter.
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

/** Distinct values of a column, in order (for the choice filter). */
export function distinctValues(rows: readonly Row[], field: string, locale = 'en-GB'): unknown[] {
  const seen = new Set<unknown>();
  for (const row of rows) {
    const v = row[field];
    if (v !== null && v !== undefined && v !== '') seen.add(v);
  }
  return [...seen].sort((a, b) => compareValues(a, b, locale));
}

export interface RowGroup {
  /** Unique key of the group (path of the values), to open and close it. */
  key: string;
  field: string;
  value: unknown;
  level: number;
  rows: Row[];
  children: RowGroup[];
}

/** Groups the rows by the given fields, in order; groups are in value order, rows keep their order. */
export function groupRows(rows: readonly Row[], fields: readonly string[], locale = 'en-GB', level = 0, parent = ''): RowGroup[] {
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

/** List to draw: group headers and rows, skipping the content of closed groups. */
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
