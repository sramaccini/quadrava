import { distinctValues, filterRows, flattenGroups, groupRows, isActiveFilter, sortRows, type DisplayItem } from './table-data';

describe('datatable: filters and groups', () => {
  const rows = [
    { id: 1, account: 'Bank', category: 'Rent', amount: -1200, data: '2026-09-01', note: 'Milan office' },
    { id: 2, account: 'Cash', category: 'Supplies', amount: -35.5, data: '2026-09-03', note: 'Pencils' },
    { id: 3, account: 'Bank', category: 'Sales', amount: 4800, data: '2026-09-10T10:00', note: 'Invoice Smith' },
    { id: 4, account: 'Bank', category: 'Supplies', amount: -90, data: '2026-10-02', note: null },
  ];
  const shown = (row: Record<string, unknown>, field: string): string => String(row[field] ?? '');
  const ids = (r: Record<string, unknown>[]): unknown[] => r.map((x) => x['id']);

  it('an empty filter does not count', () => {
    expect(isActiveFilter({ kind: 'text', text: '  ' })).toBe(false);
    expect(isActiveFilter({ kind: 'select', values: [] })).toBe(false);
    expect(isActiveFilter({ kind: 'number', from: null, to: null })).toBe(false);
    expect(isActiveFilter({ kind: 'date', from: '2026-01-01', to: null })).toBe(true);
  });

  it('text, choice, number range and date range, combined', () => {
    expect(ids(filterRows(rows, { note: { kind: 'text', text: 'SMITH' } }, shown))).toEqual([3]);
    expect(ids(filterRows(rows, { account: { kind: 'select', values: ['Cash'] } }, shown))).toEqual([2]);
    expect(ids(filterRows(rows, { amount: { kind: 'number', from: -100, to: 0 } }, shown))).toEqual([2, 4]);
    expect(ids(filterRows(rows, { data: { kind: 'date', from: '2026-09-02', to: '2026-09-30' } }, shown))).toEqual([2, 3]);
    expect(ids(filterRows(rows, { account: { kind: 'select', values: ['Bank'] }, category: { kind: 'text', text: 'sup' } }, shown))).toEqual([4]);
    // An empty value does not satisfy an active filter.
    expect(ids(filterRows(rows, { note: { kind: 'text', text: 'l' } }, shown))).toEqual([1, 2]);
  });

  it('distinct values in order', () => {
    expect(distinctValues(rows, 'category')).toEqual(['Rent', 'Sales', 'Supplies']);
  });

  it('groups on several levels, in value order, and flattening with closed groups', () => {
    const groups = groupRows(rows, ['account', 'category']);
    expect(groups.map((g) => [g.value, g.rows.length])).toEqual([
      ['Bank', 3],
      ['Cash', 1],
    ]);
    expect(groups[0].children.map((g) => g.value)).toEqual(['Rent', 'Sales', 'Supplies']);
    const outline = (items: DisplayItem[]): string[] =>
      items.map((i) => (i.kind === 'group' ? `${'.'.repeat(i.group.level)}[${String(i.group.value)}]` : `${'.'.repeat(i.level)}#${String(i.row['id'])}`));
    expect(outline(flattenGroups(groups, new Set(), 2))).toEqual(['[Bank]', '.[Rent]', '..#1', '.[Sales]', '..#3', '.[Supplies]', '..#4', '[Cash]', '.[Supplies]', '..#2']);
    expect(outline(flattenGroups(groups, new Set([groups[0].key]), 2))).toEqual(['[Bank]', '[Cash]', '.[Supplies]', '..#2']);
  });

  it('50,000 rows: filter, sorting, groups and flattening in interface time', () => {
    const big = Array.from({ length: 50000 }, (_, i) => ({ id: i, account: ['To', 'B', 'C'][i % 3], cat: String(i % 40), amount: (i * 7919) % 10000, note: 'row ' + i }));
    const t0 = performance.now();
    const filtered = filterRows(big, { amount: { kind: 'number', from: 1000, to: null }, note: { kind: 'text', text: '9' } }, (r, f) => String(r[f]));
    const sorted = sortRows(filtered, { field: 'amount', direction: 'desc' });
    const items = flattenGroups(groupRows(sorted, ['account', 'cat']), new Set(), 2);
    const elapsed = performance.now() - t0;
    expect(items.length).toBeGreaterThan(filtered.length);
    expect(elapsed).toBeLessThan(2000);
  });
});
