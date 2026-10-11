import { validateScreen } from './validate';

/** Schema dei componenti aggiunti al catalogo dopo la prima versione (uno spazio per componente). */
const screen = (components: unknown[], dataSources: Record<string, unknown> = {}) => ({ schemaVersion: '1.0', screen: 'prova', dataSources, components });
const issuesOf = (doc: unknown): string[] => {
  const result = validateScreen(doc);
  return result.valid ? [] : result.issues.map((i) => `${i.path} ${i.message}`);
};
const table = (extra: Record<string, unknown>, columns: unknown[] = [{ field: 'numero' }]) => screen([{ type: 'table', source: 's', columns, ...extra }]);

describe('schema dei componenti nuovi', () => {
  describe('ordinamento', () => {
    it('accetta colonne ordinabili e un ordinamento con stato e predefinito', () => {
      expect(issuesOf(table({ sort: { bind: 'state.ordinamento', default: { field: 'numero', direction: 'desc' } } }, [{ field: 'numero', sortable: true }]))).toEqual([]);
      expect(issuesOf(table({ sort: {} }))).toEqual([]);
    });

    it('rifiuta direzioni sconosciute, percorsi fuori dallo stato e proprietà estranee', () => {
      expect(issuesOf(table({ sort: { default: { field: 'numero', direction: 'su' } } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ sort: { bind: 'params.ordine' } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ sort: { bind: 'state.x', verso: 'asc' } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({}, [{ field: 'numero', ordinabile: true }])).length).toBeGreaterThan(0);
    });

    it('le proprietà da tabella non valgono nei campi della scheda di dettaglio', () => {
      expect(issuesOf(screen([{ type: 'detail', source: 's', fields: [{ field: 'numero' }] }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'detail', source: 's', fields: [{ field: 'numero', sortable: true }] }])).length).toBeGreaterThan(0);
    });
  });

  describe('selezione e azioni multiple', () => {
    it('accetta selezione con chiave e azioni multiple', () => {
      expect(issuesOf(table({ selection: { bind: 'state.scelte', key: 'codice' }, bulkActions: [{ label: 'Invia', onClick: [{ toast: 'ok' }] }] }))).toEqual([]);
    });

    it('rifiuta selezioni senza stato o con proprietà estranee', () => {
      expect(issuesOf(table({ selection: { key: 'id' } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ selection: { bind: 'state.x', multipla: true } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ bulkActions: [{ label: 'Invia' }] })).length).toBeGreaterThan(0);
    });
  });

  describe('menu delle azioni di riga', () => {
    it('accetta un numero di pulsanti tra 0 e 10', () => {
      expect(issuesOf(table({ rowActionsInline: 0 }))).toEqual([]);
      expect(issuesOf(table({ rowActionsInline: 2 }))).toEqual([]);
      expect(issuesOf(table({ rowActionsInline: -1 })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ rowActionsInline: 1.5 })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ rowActionsInline: 11 })).length).toBeGreaterThan(0);
    });
  });

  describe('righe espandibili', () => {
    it('accetta un’area con nodi e una condizione', () => {
      expect(issuesOf(table({ expand: { expandIf: '{{ row.x > 0 }}', components: [{ type: 'text', text: '{{ row.note }}' }] } }))).toEqual([]);
    });

    it('rifiuta aree vuote, condizioni che non sono espressioni e proprietà estranee', () => {
      expect(issuesOf(table({ expand: { components: [] } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ expand: { components: [{ type: 'text', text: 'x' }], expandIf: 'sempre' } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ expand: { components: [{ type: 'text', text: 'x' }], aperta: true } })).length).toBeGreaterThan(0);
    });
  });

  describe('formato numerico, celle cliccabili e totali', () => {
    it('accetta number con decimali (anche nel dettaglio), onClick e aggregate nelle colonne di tabella', () => {
      expect(issuesOf(table({}, [{ field: 'n', format: 'number', decimals: 2, aggregate: 'sum', onClick: [{ toast: '{{ row.n }}' }] }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'detail', source: 's', fields: [{ field: 'n', format: 'number', decimals: 0 }] }]))).toEqual([]);
    });

    it('rifiuta decimali fuori misura, aggregati sconosciuti e onClick o aggregate nel dettaglio', () => {
      expect(issuesOf(table({}, [{ field: 'n', format: 'number', decimals: 7 }])).length).toBeGreaterThan(0);
      expect(issuesOf(table({}, [{ field: 'n', aggregate: 'median' }])).length).toBeGreaterThan(0);
      expect(issuesOf(table({}, [{ field: 'n', onClick: [] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'detail', source: 's', fields: [{ field: 'n', aggregate: 'sum' }] }])).length).toBeGreaterThan(0);
    });
  });
});
