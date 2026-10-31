import type { KanbanNode } from 'schema';
import { initials, kanbanBoard, placement } from './kanban-board';

describe('kanban board', () => {
  const node = (extra: Partial<KanbanNode> = {}): KanbanNode => ({
    type: 'kanban',
    source: 'tasks',
    columnField: 'status',
    titleField: 'title',
    columns: [
      { value: 'to-do', label: 'To do' },
      { value: 'doing', label: 'Doing', tone: 'primary', limit: 1 },
    ],
    ...extra,
  });
  const rows = [
    { id: 1, title: 'A', status: 'to-do', who: 'Anna' },
    { id: 2, title: 'B', status: 'doing', who: 'Luca' },
    { id: 3, title: 'C', status: 'doing', who: 'Anna' },
    { id: 4, title: 'D', status: 'archived', who: 'Anna' },
    { id: 5, title: 'E', status: 'to-do' },
  ];
  const label = (text: string) => text.toUpperCase();
  const titles = (cells: Record<string, unknown>[][]) => cells.map((cell) => cell.map((r) => r['title']));

  it('without lanes: one lane, columns with counts and the limit exceeded', () => {
    const board = kanbanBoard(rows, node(), label, 'No group');
    expect(board.columns).toEqual([
      { value: 'to-do', label: 'TO DO', tone: 'neutral', limit: null, count: 2, overLimit: false },
      { value: 'doing', label: 'DOING', tone: 'primary', limit: 1, count: 2, overLimit: true },
    ]);
    expect(board.lanes).toHaveLength(1);
    expect(board.lanes[0].value).toBeNull();
    expect(titles(board.lanes[0].cells)).toEqual([['A', 'E'], ['B', 'C']]);
  });

  it('lanes from the data in order of appearance, the cards without a value last', () => {
    const board = kanbanBoard(rows, node({ laneField: 'who' }), label, 'No group');
    expect(board.lanes.map((l) => [l.label, l.count])).toEqual([['Anna', 2], ['Luca', 1], ['No group', 1]]);
    expect(titles(board.lanes[0].cells)).toEqual([['A'], ['C']]);
    // The limit counts the cards of every lane.
    expect(board.columns[1].count).toBe(2);
  });

  it('listed lanes: their order and headers; rows of other lanes left out', () => {
    const board = kanbanBoard(rows, node({ laneField: 'who', lanes: [{ value: 'Luca', label: 'Luca B.' }, { value: 'Marta', label: 'Marta' }] }), label, 'No group');
    expect(board.lanes.map((l) => [l.label, l.count])).toEqual([['LUCA B.', 1], ['MARTA', 0]]);
    expect(board.columns.map((c) => c.count)).toEqual([0, 1]);
  });

  it('placement: the keys of the neighbours in the new place, null at the ends', () => {
    const cell = [rows[1], rows[2]];
    const n = node();
    // From another column: before the first, between, after the last.
    expect(placement(cell, rows[0], 0, n)).toEqual({ beforeId: null, afterId: 2 });
    expect(placement(cell, rows[0], 1, n)).toEqual({ beforeId: 2, afterId: 3 });
    expect(placement(cell, rows[0], 2, n)).toEqual({ beforeId: 3, afterId: null });
    expect(placement([], rows[0], 0, n)).toEqual({ beforeId: null, afterId: null });
    // Within the column: down one place, up one place; dropping it where it is does nothing.
    expect(placement(cell, rows[1], 2, n)).toEqual({ beforeId: 3, afterId: null });
    expect(placement(cell, rows[2], 0, n)).toEqual({ beforeId: null, afterId: 2 });
    expect(placement(cell, rows[1], 0, n)).toBeNull();
    expect(placement(cell, rows[1], 1, n)).toBeNull();
    // Another key field.
    expect(placement(cell, rows[0], 0, node({ keyField: 'title' }))).toEqual({ beforeId: null, afterId: 'B' });
  });

  it('initials of a name', () => {
    expect(initials('Anna Maria Rossi')).toBe('AM');
    expect(initials(' luca ')).toBe('L');
    expect(initials('')).toBe('');
  });
});
