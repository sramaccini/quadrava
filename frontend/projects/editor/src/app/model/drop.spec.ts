import type { Json } from './doc-ops';
import { dropPoint, zoneAt } from './drop';

describe('dragging in the outline', () => {
  const doc: Json = {
    components: [
      { type: 'text', text: 'a' },
      { type: 'section', components: [{ type: 'text', text: 'b' }] },
      { type: 'tabs', tabs: [{ label: 'To', components: [] }] },
    ],
  };

  it('before, after and inside a row', () => {
    expect(dropPoint(doc, ['components', 0], 'before')).toEqual({ list: ['components'], index: 0 });
    expect(dropPoint(doc, ['components', 0], 'after')).toEqual({ list: ['components'], index: 1 });
    // Inside a node that contains nothing means right after it.
    expect(dropPoint(doc, ['components', 0], 'inside')).toEqual({ list: ['components'], index: 1 });
    expect(dropPoint(doc, ['components', 1], 'inside')).toEqual({ list: ['components', 1, 'components'], index: 1 });
    expect(dropPoint(doc, ['components', 1, 'components', 0], 'before')).toEqual({ list: ['components', 1, 'components'], index: 0 });
    // Screen, tabs and steps: always inside.
    expect(dropPoint(doc, [], 'before')).toEqual({ list: ['components'], index: 3 });
    expect(dropPoint(doc, ['components', 2, 'tabs', 0], 'after')).toEqual({ list: ['components', 2, 'tabs', 0, 'components'], index: 0 });
  });

  it('a node does not end up inside itself', () => {
    expect(dropPoint(doc, ['components', 1], 'inside', ['components', 1])).toBeNull();
    expect(dropPoint(doc, ['components', 1, 'components', 0], 'after', ['components', 1])).toBeNull();
    expect(dropPoint(doc, ['components', 1], 'after', ['components', 1])).toEqual({ list: ['components'], index: 2 });
  });

  it('zone from the position of the pointer', () => {
    expect(zoneAt(2, 20, true)).toBe('before');
    expect(zoneAt(10, 20, true)).toBe('inside');
    expect(zoneAt(18, 20, true)).toBe('after');
    expect(zoneAt(9, 20, false)).toBe('before');
    expect(zoneAt(11, 20, false)).toBe('after');
  });
});
