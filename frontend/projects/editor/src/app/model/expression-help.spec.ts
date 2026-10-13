import type { Json } from './doc-ops';
import { applyCompletion, completionAt, expressionHints, insertHint, type Hint } from './expression-help';

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

  describe('completamento mentre si scrive', () => {
    const hints: Hint[] = [
      { label: 'row.cliente', insert: 'row.cliente', kind: 'variable' },
      { label: 'row.importo', insert: 'row.importo', kind: 'variable' },
      { label: 'state.filtri.stato', insert: 'state.filtri.stato', kind: 'variable' },
      { label: "can('…')", insert: "can('')", kind: 'function' },
      { label: 'fmtNumber(…)', insert: 'fmtNumber()', kind: 'function' },
      { label: "fmtCurrency(…, 'EUR')", insert: "fmtCurrency(, 'EUR')", kind: 'function' },
    ];

    it('propone solo dentro le graffe e dopo l’inizio di un nome', () => {
      expect(completionAt('Totale row', 10, hints)).toBeNull();
      expect(completionAt('{{ }} row', 9, hints)).toBeNull();
      expect(completionAt('{{ ', 3, hints)).toBeNull();
      expect(completionAt('{{ row.', 7, hints)).toEqual({ from: 3, items: hints.slice(0, 2) });
      expect(completionAt('{{ row.cl', 9, hints)?.items.map((h) => h.insert)).toEqual(['row.cliente']);
      expect(completionAt('Ciao {{ fmt', 11, hints)?.items.map((h) => h.insert)).toEqual(['fmtNumber()', "fmtCurrency(, 'EUR')"]);
      // Parola già completa o sconosciuta: niente.
      expect(completionAt('{{ row.cliente', 14, hints)).toBeNull();
      expect(completionAt('{{ zzz', 6, hints)).toBeNull();
      // Il cursore a metà: conta quello che c'è prima.
      expect(completionAt('{{ sta > 0 }}', 6, hints)?.from).toBe(3);
    });

    it('la voce scelta sostituisce la parola; nelle funzioni il cursore va dentro', () => {
      expect(applyCompletion('{{ row.cl }}', 3, 9, hints[0])).toEqual({ value: '{{ row.cliente }}', caret: 14 });
      expect(applyCompletion('{{ ca', 3, 5, hints[3])).toEqual({ value: "{{ can('')", caret: 8 });
      expect(applyCompletion('{{ fmtN', 3, 7, hints[4])).toEqual({ value: '{{ fmtNumber()', caret: 13 });
      expect(applyCompletion('{{ fmtC', 3, 7, hints[5])).toEqual({ value: "{{ fmtCurrency(, 'EUR')", caret: 15 });
    });
  });
});
