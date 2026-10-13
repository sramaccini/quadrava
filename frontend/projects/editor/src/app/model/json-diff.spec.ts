import type { Json } from './doc-ops';
import { jsonDiff } from './json-diff';

describe('confronto tra versioni', () => {
  it('riporta aggiunte, rimozioni e modifiche con il percorso', () => {
    const before = { screen: 'a', title: 'Fatture', components: [{ type: 'text', text: 'x' }], tolto: 1 } as Json;
    const after = { screen: 'a', title: 'Fatture emesse', components: [{ type: 'text', text: 'x' }, { type: 'button' }], nuovo: { a: 1 } } as Json;
    expect(jsonDiff(before, after).changes).toEqual([
      { path: '/title', kind: 'changed', before: '"Fatture"', after: '"Fatture emesse"' },
      { path: '/components/1', kind: 'added', after: '{"type":"button"}' },
      { path: '/tolto', kind: 'removed', before: '1' },
      { path: '/nuovo', kind: 'added', after: '{"a":1}' },
    ]);
  });

  it('documenti uguali: nessuna differenza; chiavi con barre secondo JSON Pointer; tipi diversi sono una modifica', () => {
    expect(jsonDiff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }).changes).toEqual([]);
    expect(jsonDiff({ 'a/b': 1 }, { 'a/b': 2 }).changes[0].path).toBe('/a~1b');
    expect(jsonDiff({ a: [1] }, { a: { 0: 1 } }).changes).toEqual([{ path: '/a', kind: 'changed', before: '[1]', after: '{"0":1}' }]);
  });

  it('si ferma al limite e lo dice; i valori lunghi si accorciano', () => {
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i]));
    const result = jsonDiff({}, many(10), 3);
    expect(result.changes.length).toBe(3);
    expect(result.truncated).toBe(true);
    expect(jsonDiff({ a: 'x' }, { a: 'y'.repeat(200) }).changes[0].after?.length).toBe(80);
  });
});
