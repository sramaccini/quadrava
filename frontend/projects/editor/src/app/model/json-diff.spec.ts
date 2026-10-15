import type { Json } from './doc-ops';
import { jsonDiff } from './json-diff';

describe('comparison between versions', () => {
  it('reports additions, removals and changes with the path', () => {
    const before = { screen: 'a', title: 'Invoices', components: [{ type: 'text', text: 'x' }], gone: 1 } as Json;
    const after = { screen: 'a', title: 'Issued invoices', components: [{ type: 'text', text: 'x' }, { type: 'button' }], fresh: { a: 1 } } as Json;
    expect(jsonDiff(before, after).changes).toEqual([
      { path: '/title', kind: 'changed', before: '"Invoices"', after: '"Issued invoices"' },
      { path: '/components/1', kind: 'added', after: '{"type":"button"}' },
      { path: '/gone', kind: 'removed', before: '1' },
      { path: '/fresh', kind: 'added', after: '{"a":1}' },
    ]);
  });

  it('equal documents: no difference; keys with slashes as in JSON Pointer; different types are a change', () => {
    expect(jsonDiff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }).changes).toEqual([]);
    expect(jsonDiff({ 'a/b': 1 }, { 'a/b': 2 }).changes[0].path).toBe('/a~1b');
    expect(jsonDiff({ a: [1] }, { a: { 0: 1 } }).changes).toEqual([{ path: '/a', kind: 'changed', before: '[1]', after: '{"0":1}' }]);
  });

  it('stops at the limit and says so; long values are shortened', () => {
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i]));
    const result = jsonDiff({}, many(10), 3);
    expect(result.changes.length).toBe(3);
    expect(result.truncated).toBe(true);
    expect(jsonDiff({ a: 'x' }, { a: 'y'.repeat(200) }).changes[0].after?.length).toBe(80);
  });
});
