import type { KanbanNode, Tone } from 'schema';

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

/**
 * The board: columns in the order of `columns` and, with `laneField`, lanes in the order of `lanes` (or of appearance
 * in the data, with the cards without a value in a last lane labelled `noLane`). Rows whose column, or lane when `lanes`
 * is given, is not listed are left out. Inside a cell the cards keep the order of the data: the service decides it.
 */
export function kanbanBoard(rows: readonly Row[], node: KanbanNode, label: (text: string) => string, noLane: string): KanbanBoard {
  const columnIndex = new Map(node.columns.map((c, i) => [c.value, i]));
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

  const lanes: KanbanLane[] = laneDefs.map((lane) => ({ ...lane, count: 0, cells: node.columns.map(() => []) }));
  const laneIndex = new Map(lanes.map((l, i) => [l.value, i]));
  const counts = node.columns.map(() => 0);
  for (const row of shown) {
    const lane = lanes[node.laneField ? (laneIndex.get(valueOf(row, node.laneField)) ?? -1) : 0];
    if (!lane) continue;
    const column = columnIndex.get(valueOf(row, node.columnField))!;
    lane.cells[column].push(row);
    lane.count++;
    counts[column]++;
  }

  const columns = node.columns.map((c, i) => ({
    value: c.value,
    label: label(c.label),
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
