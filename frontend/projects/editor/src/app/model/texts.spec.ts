import { ExpressionEngine } from 'expressions';
import type { Json } from './doc-ops';
import { collectTexts, keyPrefix, makeKey, translatable, usedKeys } from './texts';

describe('texts and translation keys', () => {
  const doc: Json = {
    screen: 'order-list',
    title: "{{ t('order_list.title', 'Orders') }}",
    dataSources: { list: { type: 'rest', method: 'GET', url: '/api/x', params: { title: 'not a text' } } },
    components: [
      { type: 'text', text: 'Welcome' },
      { type: 'button', label: "{{ t('common.save') }}", onClick: [{ toast: "{{ t('x.ok', 'The order\\'s saved', {'n': row.number}) }}" }] },
      { type: 'text', text: "{{ t('a.one', 'One') + ' ' + t('a.two') }}" },
      { type: 'table', source: 'list', columns: [{ field: 'status', label: 'Status' }] },
    ],
  };

  it('finds the user-facing texts and classifies them', () => {
    const entries = collectTexts(doc);
    expect(entries.map((e) => [e.path.join('/'), e.kind])).toEqual([
      ['title', 'key'],
      ['components/0/text', 'plain'],
      ['components/1/label', 'key'],
      ['components/1/onClick/0/toast', 'key'],
      ['components/2/text', 'expression'],
      ['components/3/columns/0/label', 'plain'],
    ]);
    expect(entries[0]).toMatchObject({ key: 'order_list.title', fallback: 'Orders' });
    expect(entries[2]).toMatchObject({ key: 'common.save', fallback: undefined });
    expect(entries[3]).toMatchObject({ key: 'x.ok', fallback: "The order's saved" });
    expect(entries[4].keys).toEqual(['a.one', 'a.two']);
    expect([...usedKeys(entries)]).toEqual(['order_list.title', 'common.save', 'x.ok', 'a.one', 'a.two']);
  });

  it('new keys are readable and unique', () => {
    expect(keyPrefix('order-list')).toBe('order_list');
    expect(makeKey('order-list', 'Café delivery!', new Set())).toBe('order_list.cafe_delivery');
    expect(makeKey('p', 'Status', new Set(['p.status']))).toBe('p.status_2');
    expect(makeKey('p', '???', new Set())).toBe('p.text');
    expect(makeKey('p', 'A very long sentence that does not fit in the key', new Set())).toBe('p.a_very_long_sentence_that_does');
  });

  it('the translatable text is a valid expression with the text as fallback', () => {
    const value = translatable('p.order', "The order's \\ ready")!;
    expect(value).toBe("{{ t('p.order', 'The order\\'s \\\\ ready') }}");
    const engine = new ExpressionEngine({ can: () => false });
    expect(engine.checkTemplate(value).valid).toBe(true);
    expect(collectTexts({ text: value } as Json)[0]).toMatchObject({ kind: 'key', key: 'p.order', fallback: "The order's \\ ready" });
    expect(translatable('p.x', 'Total {n}')).toBeNull();
  });

  it('a multi-line text (Markdown) becomes a valid expression and comes back the same', () => {
    const text = 'Before **sending**:\n\n- check the data\n- attach the invoice';
    const value = translatable('p.instructions', text)!;
    expect(value).not.toContain('\n');
    const engine = new ExpressionEngine({ can: () => false });
    expect(engine.checkTemplate(value).valid).toBe(true);
    expect(collectTexts({ text: value } as Json)[0]).toMatchObject({ kind: 'key', fallback: text });
  });
});
