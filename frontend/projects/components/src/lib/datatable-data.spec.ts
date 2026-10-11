import { distinctValues, filterRows, flattenGroups, groupRows, isActiveFilter, type DisplayItem } from './table-data';

describe('datatable: filtri e gruppi', () => {
  const rows = [
    { id: 1, conto: 'Banca', categoria: 'Affitti', importo: -1200, data: '2026-09-01', nota: 'Ufficio Milano' },
    { id: 2, conto: 'Cassa', categoria: 'Spese', importo: -35.5, data: '2026-09-03', nota: 'Cancelleria' },
    { id: 3, conto: 'Banca', categoria: 'Incassi', importo: 4800, data: '2026-09-10T10:00', nota: 'Fattura Rossi' },
    { id: 4, conto: 'Banca', categoria: 'Spese', importo: -90, data: '2026-10-02', nota: null },
  ];
  const shown = (row: Record<string, unknown>, field: string): string => String(row[field] ?? '');
  const ids = (r: Record<string, unknown>[]): unknown[] => r.map((x) => x['id']);

  it('un filtro vuoto non conta', () => {
    expect(isActiveFilter({ kind: 'text', text: '  ' })).toBe(false);
    expect(isActiveFilter({ kind: 'select', values: [] })).toBe(false);
    expect(isActiveFilter({ kind: 'number', from: null, to: null })).toBe(false);
    expect(isActiveFilter({ kind: 'date', from: '2026-01-01', to: null })).toBe(true);
  });

  it('testo, scelta, intervallo numerico e intervallo di date, combinati', () => {
    expect(ids(filterRows(rows, { nota: { kind: 'text', text: 'ROSSI' } }, shown))).toEqual([3]);
    expect(ids(filterRows(rows, { conto: { kind: 'select', values: ['Cassa'] } }, shown))).toEqual([2]);
    expect(ids(filterRows(rows, { importo: { kind: 'number', from: -100, to: 0 } }, shown))).toEqual([2, 4]);
    expect(ids(filterRows(rows, { data: { kind: 'date', from: '2026-09-02', to: '2026-09-30' } }, shown))).toEqual([2, 3]);
    expect(ids(filterRows(rows, { conto: { kind: 'select', values: ['Banca'] }, categoria: { kind: 'text', text: 'spe' } }, shown))).toEqual([4]);
    // Un valore vuoto non soddisfa un filtro attivo.
    expect(ids(filterRows(rows, { nota: { kind: 'text', text: 'l' } }, shown))).toEqual([1, 2]);
  });

  it('valori distinti in ordine', () => {
    expect(distinctValues(rows, 'categoria')).toEqual(['Affitti', 'Incassi', 'Spese']);
  });

  it('gruppi su più livelli, in ordine di valore, e appiattimento con gruppi chiusi', () => {
    const groups = groupRows(rows, ['conto', 'categoria']);
    expect(groups.map((g) => [g.value, g.rows.length])).toEqual([
      ['Banca', 3],
      ['Cassa', 1],
    ]);
    expect(groups[0].children.map((g) => g.value)).toEqual(['Affitti', 'Incassi', 'Spese']);
    const outline = (items: DisplayItem[]): string[] =>
      items.map((i) => (i.kind === 'group' ? `${'.'.repeat(i.group.level)}[${String(i.group.value)}]` : `${'.'.repeat(i.level)}#${String(i.row['id'])}`));
    expect(outline(flattenGroups(groups, new Set(), 2))).toEqual(['[Banca]', '.[Affitti]', '..#1', '.[Incassi]', '..#3', '.[Spese]', '..#4', '[Cassa]', '.[Spese]', '..#2']);
    expect(outline(flattenGroups(groups, new Set([groups[0].key]), 2))).toEqual(['[Banca]', '[Cassa]', '.[Spese]', '..#2']);
  });
});
