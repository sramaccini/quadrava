import type { KanbanColumnDefinition, KanbanNode, Tone } from 'schema';

type Row = Record<string, unknown>;

export interface KanbanColumn {
  value: string;
  label: string;
  tone: Tone;
  /** Maximum number of cards, if any (work in progress). */
  limit: number | null;
  /** Cards in the column, in every lane. */
  count: number;
  /** More cards than the limit. */
  overLimit: boolean;
}

export interface KanbanLane {
  /** Value of `laneField`; null for the board without lanes. */
  value: string | null;
  label: string;
  count: number;
  /** The cards of the lane, one list per column, in the order of the data. */
  cells: Row[][];
}

export interface KanbanBoard {
  columns: KanbanColumn[];
  lanes: KanbanLane[];
}

const valueOf = (row: Row, field: string): string => {
  const value = row[field];
  return value === null || value === undefined ? '' : String(value);
};

const TONES: readonly string[] = ['neutral', 'primary', 'success', 'danger'];

/**
 * Columns that come from data (the rows of `columnsFrom`, or the result of a `columns` expression): the value and the
 * label are texts, the tone one of the known ones, the limit a positive whole number (also written as text); rows without a value, and values
 * already seen, are left out. The labels are data: they are shown as they are, never evaluated.
 */
export function columnsOf(list: unknown, fields: NonNullable<KanbanNode['columnsFrom']> | Record<string, never> = {}): KanbanColumnDefinition[] {
  if (!Array.isArray(list)) return [];
  const f = fields as Partial<NonNullable<KanbanNode['columnsFrom']>>;
  const seen = new Set<string>();
  const columns: KanbanColumnDefinition[] = [];
  for (const row of list) {
    if (row === null || typeof row !== 'object') continue;
    const r = row as Row;
    const value = valueOf(r, f.valueField ?? 'value');
    if (value === '' || seen.has(value)) continue;
    seen.add(value);
    const label = valueOf(r, f.labelField ?? 'label');
    const tone = r[f.toneField ?? 'tone'];
    // A whole number, also as text: the values of a CEL map literal all have the same type ({'limit': '5'}).
    const raw = r[f.limitField ?? 'limit'];
    const limit = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
    columns.push({
      value,
      label: label || value,
      ...(typeof tone === 'string' && TONES.includes(tone) ? { tone: tone as Tone } : {}),
      ...(typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? { limit } : {}),
    });
  }
  return columns;
}

/**
 * The board: columns in the order given (their labels already resolved) and, with `laneField`, lanes in the order of
 * `lanes` (or of appearance in the data, with the cards without a value in a last lane labelled `noLane`). Rows whose
 * column, or lane when `lanes` is given, is not listed are left out. Inside a cell the cards keep the order of the data:
 * the service decides it.
 */
export function kanbanBoard(
  rows: readonly Row[],
  node: KanbanNode,
  columnDefs: readonly KanbanColumnDefinition[],
  label: (text: string) => string,
  noLane: string,
): KanbanBoard {
  const columnIndex = new Map(columnDefs.map((c, i) => [c.value, i]));
  const shown = rows.filter((row) => columnIndex.has(valueOf(row, node.columnField)));

  let laneDefs: { value: string | null; label: string }[];
  if (!node.laneField) {
    laneDefs = [{ value: null, label: '' }];
  } else if (node.lanes) {
    laneDefs = node.lanes.map((l) => ({ value: l.value, label: label(l.label) }));
  } else {
    const seen = [...new Set(shown.map((row) => valueOf(row, node.laneField!)))];
    const named = seen.filter((v) => v !== '').map((v) => ({ value: v, label: v }));
    laneDefs = seen.includes('') ? [...named, { value: '', label: noLane }] : named;
  }

  const lanes: KanbanLane[] = laneDefs.map((lane) => ({ ...lane, count: 0, cells: columnDefs.map(() => []) }));
  const laneIndex = new Map(lanes.map((l, i) => [l.value, i]));
  const counts = columnDefs.map(() => 0);
  for (const row of shown) {
    const lane = lanes[node.laneField ? (laneIndex.get(valueOf(row, node.laneField)) ?? -1) : 0];
    if (!lane) continue;
    const column = columnIndex.get(valueOf(row, node.columnField))!;
    lane.cells[column].push(row);
    lane.count++;
    counts[column]++;
  }

  const columns = columnDefs.map((c, i) => ({
    value: c.value,
    label: c.label,
    tone: c.tone ?? 'neutral',
    limit: c.limit ?? null,
    count: counts[i],
    overLimit: c.limit !== undefined && counts[i] > c.limit,
  }));
  return { columns, lanes };
}

/** Key of a card: the value of `keyField` (`id` if absent), or null. */
export function cardKey(row: Row, node: KanbanNode): unknown {
  return row[node.keyField ?? 'id'] ?? null;
}

/**
 * Where a card lands among the cards of the target cell: `gap` is the position between the cards as they are shown (0
 * before the first, `cards.length` after the last), counting the moved card too when it is in the same cell. Returns the
 * keys of the neighbours in the new place (null at the ends), or null if the card would stay where it is.
 */
export function placement(cards: readonly Row[], moved: Row, gap: number, node: KanbanNode): { beforeId: unknown; afterId: unknown } | null {
  const from = cards.indexOf(moved);
  const others = cards.filter((c) => c !== moved);
  let index = Math.max(0, Math.min(gap, cards.length));
  if (from >= 0 && from < index) index--;
  if (from >= 0 && index === from) return null;
  index = Math.min(index, others.length);
  return {
    beforeId: index > 0 ? cardKey(others[index - 1], node) : null,
    afterId: index < others.length ? cardKey(others[index], node) : null,
  };
}

/** Initials of a name, at most two: «Anna Rossi» → «AR». */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}
