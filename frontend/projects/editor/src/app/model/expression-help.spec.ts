import type { Json } from './doc-ops';
import { expressionHints, insertHint } from './expression-help';

describe('aiuto alle espressioni', () => {
  const doc: Json = {
    dataSources: { elenco: { type: 'rest', method: 'GET', url: '/api/x', params: { stato: '{{ state.filtri.stato }}', id: '{{ params.id }}' } } },
    components: [
      { type: 'filterBar', bind: 'state.filtri', fields: [{ name: 'stato', type: 'text' }] },
      { type: 'table', source: 'elenco', columns: [{ field: 'numero' }, { field: 'importo' }], rowActions: [{ label: 'X', onClick: [{ toast: 'x' }] }] },
      { type: 'form', fields: [{ name: 'cliente', type: 'text', validate: { rule: '{{ true }}', message: 'm' } }], actions: [{ label: 'Salva', onClick: [{ toast: 'x' }] }] },
    ],
  };
  const names = (path: (string | number)[]): string[] => expressionHints(doc, path).filter((h) => h.kind === 'variable').map((h) => h.label);

  it('variabili del contesto prima, poi stato e parametri usati, poi l’utente', () => {
    expect(names(['components', 1, 'rowActions', 0, 'visibleIf'])).toEqual([
      'row.importo',
      'row.numero',
      'params.id',
      'state.filtri',
      'state.filtri.stato',
      'user.displayName',
      'user.locale',
      'user.username',
    ]);
    expect(names(['components', 2, 'actions', 0, 'enabledIf'])).toContain('form.cliente');
    expect(names(['components', 2, 'fields', 0, 'validate', 'rule'])).toEqual(expect.arrayContaining(['value', 'form.cliente']));
    expect(names(['dataSources', 'elenco', 'params', 'stato'])).toEqual(expect.arrayContaining(['search', 'lookupKey', 'request']));
    // Fuori da tabelle e form niente row né form.
    expect(names(['components', 0, 'visibleIf']).some((n) => n.startsWith('row.') || n.startsWith('form.'))).toBe(false);
    expect(expressionHints(doc, []).some((h) => h.insert === "can('')")).toBe(true);
  });

  it('inserisce al cursore; un campo vuoto diventa {{ }}', () => {
    expect(insertHint('', 0, 0, 'row.numero')).toEqual({ value: '{{ row.numero }}', caret: 13 });
    expect(insertHint('{{  > 0 }}', 3, 3, 'row.importo')).toEqual({ value: '{{ row.importo > 0 }}', caret: 14 });
  });
});
