import type { Json } from './doc-ops';
import { dropPoint, zoneAt } from './drop';

describe('trascinamento nella struttura', () => {
  const doc: Json = {
    components: [
      { type: 'text', text: 'a' },
      { type: 'section', components: [{ type: 'text', text: 'b' }] },
      { type: 'tabs', tabs: [{ label: 'A', components: [] }] },
    ],
  };

  it('prima, dopo e dentro una riga', () => {
    expect(dropPoint(doc, ['components', 0], 'before')).toEqual({ list: ['components'], index: 0 });
    expect(dropPoint(doc, ['components', 0], 'after')).toEqual({ list: ['components'], index: 1 });
    // Dentro un nodo che non contiene nulla vuol dire subito dopo.
    expect(dropPoint(doc, ['components', 0], 'inside')).toEqual({ list: ['components'], index: 1 });
    expect(dropPoint(doc, ['components', 1], 'inside')).toEqual({ list: ['components', 1, 'components'], index: 1 });
    expect(dropPoint(doc, ['components', 1, 'components', 0], 'before')).toEqual({ list: ['components', 1, 'components'], index: 0 });
    // Schermata, schede e passi: sempre dentro.
    expect(dropPoint(doc, [], 'before')).toEqual({ list: ['components'], index: 3 });
    expect(dropPoint(doc, ['components', 2, 'tabs', 0], 'after')).toEqual({ list: ['components', 2, 'tabs', 0, 'components'], index: 0 });
  });

  it('un nodo non finisce dentro sé stesso', () => {
    expect(dropPoint(doc, ['components', 1], 'inside', ['components', 1])).toBeNull();
    expect(dropPoint(doc, ['components', 1, 'components', 0], 'after', ['components', 1])).toBeNull();
    expect(dropPoint(doc, ['components', 1], 'after', ['components', 1])).toEqual({ list: ['components'], index: 2 });
  });

  it('zona dalla posizione del puntatore', () => {
    expect(zoneAt(2, 20, true)).toBe('before');
    expect(zoneAt(10, 20, true)).toBe('inside');
    expect(zoneAt(18, 20, true)).toBe('after');
    expect(zoneAt(9, 20, false)).toBe('before');
    expect(zoneAt(11, 20, false)).toBe('after');
  });
});
