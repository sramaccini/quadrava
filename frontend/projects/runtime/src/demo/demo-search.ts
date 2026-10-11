/**
 * Servizio di ricerca finto per la serverDataTable della demo: un archivio di movimenti generato una sola volta e una
 * funzione che risponde alla richiesta della tabella come farebbe un vero servizio (filtri, ordinamento, gruppi con
 * conteggi e somme, pagine, valori distinti). Serve solo alla demo.
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

const CONTI = ['Banca Intesa', 'Banca Sella', 'Cassa', 'Carta aziendale'];
const CATEGORIE = ['Affitti', 'Utenze', 'Stipendi', 'Incassi clienti', 'Fornitori', 'Spese varie', 'Imposte', 'Consulenze'];
const BASE: Record<string, number> = { Affitti: 1800, Utenze: 240, Stipendi: 3100, 'Incassi clienti': 2600, Fornitori: 950, 'Spese varie': 75, Imposte: 1400, Consulenze: 1200 };

let archive: Row[] | null = null;

/** Archivio di `size` movimenti tra il 2024 e il 2026, sempre uguale (generato in modo deterministico). */
export function movementArchive(size = 200000): Row[] {
  if (archive && archive.length === size) return archive;
  archive = Array.from({ length: size }, (_, i) => {
    const categoria = CATEGORIE[(i * 7) % CATEGORIE.length];
    const base = BASE[categoria];
    const importo = Math.round((base + ((i * 37) % 23) * (base / 40)) * 100) / 100;
    const anno = 2024 + (i % 3);
    const mese = 1 + ((i * 5) % 12);
    const giorno = 1 + ((i * 11) % 28);
    return {
      id: i + 1,
      data: `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`,
      conto: CONTI[(i * 3) % CONTI.length],
      categoria,
      descrizione: `${categoria} n. ${i + 1}`,
      importo: categoria === 'Incassi clienti' ? importo : -importo,
      stato: i % 13 === 4 ? 'da-verificare' : 'registrato',
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
  return String(a ?? '').localeCompare(String(b ?? ''), 'it', { numeric: true });
}

const sum = (rows: Row[], field: string): number => Math.round(rows.reduce((t, r) => t + (typeof r[field] === 'number' ? (r[field] as number) : 0), 0) * 100) / 100;

/** Risposta alla richiesta della serverDataTable. */
export function searchMovements(rows: Row[], request: unknown): unknown {
  const req = request as SearchRequest;
  if (!req || typeof req.page !== 'number' || typeof req.size !== 'number') throw new Error('400');
  let found = rows.filter((row) => (req.filters ?? []).every((f) => matches(row, f)));
  for (const { field, value } of req.groupPath ?? []) found = found.filter((row) => row[field] === value);
  if (req.distinct) return { values: [...new Set(found.map((r) => r[req.distinct!]))].sort(compare) };
  const totals = { importo: sum(found, 'importo'), categoria: found.length };
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
      .map(([value, items]) => ({ value, count: items.length, aggregates: { importo: sum(items, 'importo'), categoria: items.length } }));
    return { groups: slice(groups), total: groups.length, totals };
  }
  if (req.sort) {
    const sign = req.sort.direction === 'desc' ? -1 : 1;
    const field = req.sort.field;
    found = [...found].sort((a, b) => sign * compare(a[field], b[field]));
  }
  return { items: slice(found), total: found.length, totals };
}
