import { fromPointer, getIn, insertAt, moveBy, moveTo, removeAt, setIn, toPointer, type Json } from './doc-ops';

describe('operations on the document', () => {
  const doc: Json = { components: [{ type: 'text', text: 'a' }, { type: 'section', components: [{ type: 'text', text: 'b' }] }, { type: 'text', text: 'c' }] };

  it('setIn copies only the touched path and removes properties with undefined', () => {
    const next = setIn(doc, ['components', 0, 'text'], 'A');
    expect(getIn(next, ['components', 0, 'text'])).toBe('A');
    expect(getIn(doc, ['components', 0, 'text'])).toBe('a');
    expect((next as { components: Json[] }).components[1]).toBe((doc as { components: Json[] }).components[1]);
    expect(getIn(setIn(doc, ['components', 0, 'text'], undefined), ['components', 0])).toEqual({ type: 'text' });
    expect(setIn({}, ['a', 'b'], 1)).toEqual({ a: { b: 1 } });
  });

  it('inserts, removes and moves in lists', () => {
    expect(getIn(insertAt(doc, ['components'], 1, { type: 'alert' }), ['components', 1])).toEqual({ type: 'alert' });
    expect(getIn(insertAt(doc, ['components'], 99, 'x'), ['components', 3])).toBe('x');
    expect((getIn(removeAt(doc, ['components', 0]), ['components']) as Json[]).length).toBe(2);
    const moved = moveBy(doc, ['components', 0], 1);
    expect(moved.path).toEqual(['components', 1]);
    expect(getIn(moved.doc, ['components', 1, 'text'])).toBe('a');
    expect(moveBy(doc, ['components', 0], -1).doc).toBe(doc);
  });

  it('moves a node into another container, fixing the indices, and never inside itself', () => {
    // The first node enters the section, which after the removal shifts from 1 to 0.
    const into = moveTo(doc, ['components', 0], ['components', 1, 'components'], 1)!;
    expect(into.path).toEqual(['components', 0, 'components', 1]);
    expect(getIn(into.doc, ['components', 0, 'components'])).toEqual([{ type: 'text', text: 'b' }, { type: 'text', text: 'a' }]);
    // Out of the section, at the end.
    const out = moveTo(doc, ['components', 1, 'components', 0], ['components'], 3)!;
    expect(getIn(out.doc, ['components', 3, 'text'])).toBe('b');
    // Forward in the same list.
    expect(moveTo(doc, ['components', 0], ['components'], 3)!.path).toEqual(['components', 2]);
    expect(moveTo(doc, ['components', 1], ['components', 1, 'components'], 0)).toBeNull();
  });

  it('JSON Pointer round trip', () => {
    expect(toPointer(['components', 0, 'a/b'])).toBe('/components/0/a~1b');
    expect(fromPointer('/components/0/a~1b')).toEqual(['components', 0, 'a/b']);
    expect(fromPointer('/')).toEqual([]);
  });
});
