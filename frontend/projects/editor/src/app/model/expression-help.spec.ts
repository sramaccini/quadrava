import type { Json } from './doc-ops';
import { applyCompletion, completionAt, expressionHints, insertHint, type Hint } from './expression-help';

describe('expression help', () => {
  const doc: Json = {
    dataSources: { list: { type: 'rest', method: 'GET', url: '/api/x', params: { status: '{{ state.filters.status }}', id: '{{ params.id }}' } } },
    components: [
      { type: 'filterBar', bind: 'state.filters', fields: [{ name: 'status', type: 'text' }] },
      { type: 'table', source: 'list', columns: [{ field: 'number' }, { field: 'amount' }], rowActions: [{ label: 'X', onClick: [{ toast: 'x' }] }] },
      { type: 'form', fields: [{ name: 'customer', type: 'text', validate: { rule: '{{ true }}', message: 'm' } }], actions: [{ label: 'Save', onClick: [{ toast: 'x' }] }] },
    ],
  };
  const names = (path: (string | number)[]): string[] => expressionHints(doc, path).filter((h) => h.kind === 'variable').map((h) => h.label);

  it('context variables first, then the state and parameters used, then the user', () => {
    expect(names(['components', 1, 'rowActions', 0, 'visibleIf'])).toEqual([
      'row.amount',
      'row.number',
      'params.id',
      'state.filters',
      'state.filters.status',
      'user.displayName',
      'user.locale',
      'user.username',
    ]);
    expect(names(['components', 2, 'actions', 0, 'enabledIf'])).toContain('form.customer');
    expect(names(['components', 2, 'fields', 0, 'validate', 'rule'])).toEqual(expect.arrayContaining(['value', 'form.customer']));
    expect(names(['dataSources', 'list', 'params', 'status'])).toEqual(expect.arrayContaining(['search', 'lookupKey', 'request']));
    // Outside tables and forms no row or form.
    expect(names(['components', 0, 'visibleIf']).some((n) => n.startsWith('row.') || n.startsWith('form.'))).toBe(false);
    expect(expressionHints(doc, []).some((h) => h.insert === "can('')")).toBe(true);
  });

  it('in steps: the responses of the previous calls with as; in onError the error code', () => {
    const doc: Json = {
      components: [
        {
          type: 'button',
          onClick: [
            { call: 'create', as: 'created' },
            { call: 'other' },
            { toast: '…' },
            { call: 'send', as: 'sent', onError: [{ toast: '…' }] },
          ],
        },
      ],
    };
    const names = (path: (string | number)[]) => expressionHints(doc, path).filter((h) => h.kind === 'variable').map((h) => h.label);
    expect(names(['components', 0, 'onClick', 2, 'toast'])).toContain('created');
    expect(names(['components', 0, 'onClick', 2, 'toast'])).not.toContain('sent');
    expect(names(['components', 0, 'onClick', 0, 'call'])).not.toContain('created');
    const inError = names(['components', 0, 'onClick', 3, 'onError', 0, 'toast']);
    expect(inError).toContain('error.status');
    expect(inError).toContain('created');
    expect(names(['components', 0, 'onClick', 2, 'toast'])).not.toContain('error.status');
  });

    it('inserts at the cursor; an empty field becomes {{ }}', () => {
    expect(insertHint('', 0, 0, 'row.number')).toEqual({ value: '{{ row.number }}', caret: 13 });
    expect(insertHint('{{  > 0 }}', 3, 3, 'row.amount')).toEqual({ value: '{{ row.amount > 0 }}', caret: 13 });
  });

  describe('completion while typing', () => {
    const hints: Hint[] = [
      { label: 'row.customer', insert: 'row.customer', kind: 'variable' },
      { label: 'row.amount', insert: 'row.amount', kind: 'variable' },
      { label: 'state.filters.status', insert: 'state.filters.status', kind: 'variable' },
      { label: "can('…')", insert: "can('')", kind: 'function' },
      { label: 'fmtNumber(…)', insert: 'fmtNumber()', kind: 'function' },
      { label: "fmtCurrency(…, 'EUR')", insert: "fmtCurrency(, 'EUR')", kind: 'function' },
    ];

    it('offers only inside the braces and after the start of a name', () => {
      expect(completionAt('Total row', 9, hints)).toBeNull();
      expect(completionAt('{{ }} row', 9, hints)).toBeNull();
      expect(completionAt('{{ ', 3, hints)).toBeNull();
      expect(completionAt('{{ row.', 7, hints)).toEqual({ from: 3, items: hints.slice(0, 2) });
      expect(completionAt('{{ row.cu', 9, hints)?.items.map((h) => h.insert)).toEqual(['row.customer']);
      expect(completionAt('Hello {{ fmt', 12, hints)?.items.map((h) => h.insert)).toEqual(['fmtNumber()', "fmtCurrency(, 'EUR')"]);
      // Word already complete or unknown: nothing.
      expect(completionAt('{{ row.customer', 15, hints)).toBeNull();
      expect(completionAt('{{ zzz', 6, hints)).toBeNull();
      // The cursor in the middle: what is before it counts.
      expect(completionAt('{{ sta > 0 }}', 6, hints)?.from).toBe(3);
    });

    it('the chosen item replaces the word; in functions the cursor goes inside', () => {
      expect(applyCompletion('{{ row.cu }}', 3, 9, hints[0])).toEqual({ value: '{{ row.customer }}', caret: 15 });
      expect(applyCompletion('{{ ca', 3, 5, hints[3])).toEqual({ value: "{{ can('')", caret: 8 });
      expect(applyCompletion('{{ fmtN', 3, 7, hints[4])).toEqual({ value: '{{ fmtNumber()', caret: 13 });
      expect(applyCompletion('{{ fmtC', 3, 7, hints[5])).toEqual({ value: "{{ fmtCurrency(, 'EUR')", caret: 15 });
    });
  });
});
