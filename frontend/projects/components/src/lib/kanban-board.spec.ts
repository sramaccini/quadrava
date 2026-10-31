import type { KanbanColumnDefinition, KanbanNode } from 'schema';
import { columnsOf, initials, kanbanBoard, placement } from './kanban-board';

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
  // The columns arrive with their labels already resolved; `label` is for the headers of the lanes.
  const boardOf = (n: KanbanNode) => kanbanBoard(rows, n, n.columns as KanbanColumnDefinition[], label, 'No group');

  it('without lanes: one lane, columns with counts and the limit exceeded', () => {
    const board = boardOf(node());
    expect(board.columns).toEqual([
      { value: 'to-do', label: 'To do', tone: 'neutral', limit: null, count: 2, overLimit: false },
      { value: 'doing', label: 'Doing', tone: 'primary', limit: 1, count: 2, overLimit: true },
    ]);
    expect(board.lanes).toHaveLength(1);
    expect(board.lanes[0].value).toBeNull();
    expect(titles(board.lanes[0].cells)).toEqual([['A', 'E'], ['B', 'C']]);
  });

  it('lanes from the data in order of appearance, the cards without a value last', () => {
    const board = boardOf(node({ laneField: 'who' }));
    expect(board.lanes.map((l) => [l.label, l.count])).toEqual([['Anna', 2], ['Luca', 1], ['No group', 1]]);
    expect(titles(board.lanes[0].cells)).toEqual([['A'], ['C']]);
    // The limit counts the cards of every lane.
    expect(board.columns[1].count).toBe(2);
  });

  it('listed lanes: their order and headers; rows of other lanes left out', () => {
    const board = boardOf(node({ laneField: 'who', lanes: [{ value: 'Luca', label: 'Luca B.' }, { value: 'Marta', label: 'Marta' }] }));
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

  it('columns from data: texts, known tones, positive whole limits; no value or repeated values left out', () => {
    const fromService = [
      { id: 'new', name: 'New', colour: 'primary', wip: 3 },
      { id: 7, name: '{{ user.name }}', colour: 'purple', wip: 0 },
      { id: '', name: 'Nothing' },
      { id: 'new', name: 'Again' },
      null,
      { id: 'closed', wip: 2.5 },
      { id: 'review', wip: '4' },
    ];
    expect(columnsOf(fromService, { source: 's', valueField: 'id', labelField: 'name', toneField: 'colour', limitField: 'wip' })).toEqual([
      { value: 'new', label: 'New', tone: 'primary', limit: 3 },
      // A label from the data is never evaluated.
      { value: '7', label: '{{ user.name }}' },
      { value: 'closed', label: 'closed' },
      { value: 'review', label: 'review', limit: 4 },
    ]);
    // The result of an expression: fields with the names of the list.
    expect(columnsOf([{ value: 'a', label: 'A', tone: 'success', limit: 2 }])).toEqual([{ value: 'a', label: 'A', tone: 'success', limit: 2 }]);
    expect(columnsOf('not a list')).toEqual([]);
  });

  it('initials of a name', () => {
    expect(initials('Anna Maria Rossi')).toBe('AM');
    expect(initials(' luca ')).toBe('L');
    expect(initials('')).toBe('');
  });
});
