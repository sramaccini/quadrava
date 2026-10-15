/**
 * Fake search service for the serverDataTable of the demo: an archive of transactions generated only once and a
 * function answering the table's request as a real service would (filters, sorting, groups with counts and sums,
 * pages, distinct values). Only for the demo.
 */

type Row = Record<string, unknown>;

interface Filter {
  field: string;
  kind: 'text' | 'select' | 'number' | 'date';
  text?: string;
  values?: unknown[];
  from?: number | string | null;
  to?: number | string | null;
}

interface SearchRequest {
  page: number;
  size: number;
  sort: { field: string; direction: 'asc' | 'desc' } | null;
  filters: Filter[];
  groupBy: string[];
  groupPath: { field: string; value: unknown }[];
  distinct?: string;
}

const ACCOUNTS = ['Alpha Bank', 'Beta Bank', 'Cash', 'Company card'];
const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Customer receipts', 'Suppliers', 'Sundry expenses', 'Taxes', 'Consulting'];
const BASE: Record<string, number> = { Rent: 1800, Utilities: 240, Salaries: 3100, 'Customer receipts': 2600, Suppliers: 950, 'Sundry expenses': 75, Taxes: 1400, Consulting: 1200 };

let archive: Row[] | null = null;

/** Archive of `size` transactions between 2024 and 2026, always the same (generated deterministically). */
export function transactionArchive(size = 200000): Row[] {
  if (archive && archive.length === size) return archive;
  archive = Array.from({ length: size }, (_, i) => {
    const category = CATEGORIES[(i * 7) % CATEGORIES.length];
    const base = BASE[category];
    const amount = Math.round((base + ((i * 37) % 23) * (base / 40)) * 100) / 100;
    const year = 2024 + (i % 3);
    const month = 1 + ((i * 5) % 12);
    const day = 1 + ((i * 11) % 28);
    return {
      id: i + 1,
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      account: ACCOUNTS[(i * 3) % ACCOUNTS.length],
      category,
      description: `${category} no. ${i + 1}`,
      amount: category === 'Customer receipts' ? amount : -amount,
      status: i % 13 === 4 ? 'to-check' : 'registered',
    };
  });
  return archive;
}

function matches(row: Row, f: Filter): boolean {
  const value = row[f.field];
  switch (f.kind) {
    case 'text':
      return String(value ?? '').toLowerCase().includes(String(f.text ?? '').trim().toLowerCase());
    case 'select':
      return (f.values ?? []).includes(value);
    case 'number': {
      const n = typeof value === 'number' ? value : NaN;
      return !Number.isNaN(n) && (f.from === null || f.from === undefined || n >= Number(f.from)) && (f.to === null || f.to === undefined || n <= Number(f.to));
    }
    case 'date': {
      const day = String(value ?? '').slice(0, 10);
      return day !== '' && (!f.from || day >= String(f.from)) && (!f.to || day <= String(f.to));
    }
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true });
}

const sum = (rows: Row[], field: string): number => Math.round(rows.reduce((t, r) => t + (typeof r[field] === 'number' ? (r[field] as number) : 0), 0) * 100) / 100;

/** Answer to the request of the serverDataTable. */
export function searchTransactions(rows: Row[], request: unknown): unknown {
  const req = request as SearchRequest;
  if (!req || typeof req.page !== 'number' || typeof req.size !== 'number') throw new Error('400');
  let found = rows.filter((row) => (req.filters ?? []).every((f) => matches(row, f)));
  for (const { field, value } of req.groupPath ?? []) found = found.filter((row) => row[field] === value);
  if (req.distinct) return { values: [...new Set(found.map((r) => r[req.distinct!]))].sort(compare) };
  const totals = { amount: sum(found, 'amount'), category: found.length };
  const slice = <T,>(items: T[]): T[] => items.slice(req.page * req.size, req.page * req.size + req.size);
  const groupBy = req.groupBy ?? [];
  if ((req.groupPath ?? []).length < groupBy.length) {
    const field = groupBy[(req.groupPath ?? []).length];
    const buckets = new Map<unknown, Row[]>();
    for (const row of found) {
      const list = buckets.get(row[field]);
      if (list) list.push(row);
      else buckets.set(row[field], [row]);
    }
    const groups = [...buckets.entries()]
      .sort(([a], [b]) => compare(a, b))
      .map(([value, items]) => ({ value, count: items.length, aggregates: { amount: sum(items, 'amount'), category: items.length } }));
    return { groups: slice(groups), total: groups.length, totals };
  }
  if (req.sort) {
    const sign = req.sort.direction === 'desc' ? -1 : 1;
    const field = req.sort.field;
    found = [...found].sort((a, b) => sign * compare(a[field], b[field]));
  }
  return { items: slice(found), total: found.length, totals };
}
