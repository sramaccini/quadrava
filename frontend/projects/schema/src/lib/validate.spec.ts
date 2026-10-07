import { validateScreen } from './validate';

const minimal = () => ({
  schemaVersion: '1.0',
  screen: 'ordini-elenco',
  components: [{ type: 'text', text: 'Ciao' }],
});

function issuesOf(doc: unknown): string[] {
  const result = validateScreen(doc);
  return result.valid ? [] : result.issues.map((i) => `${i.path} ${i.message}`);
}

describe('validateScreen', () => {
  it('accetta una schermata minima', () => {
    expect(validateScreen(minimal()).valid).toBe(true);
  });

  it('accetta una tabella con azione condizionata dai permessi', () => {
    const doc = {
      ...minimal(),
      requires: 'ordini.leggi',
      dataSources: { ordini: { type: 'rest', method: 'GET', url: '/api/ordini', paging: 'server' } },
      components: [
        {
          id: 'tabella-ordini',
          type: 'table',
          source: 'ordini',
          columns: [{ field: 'numero' }],
          rowActions: [
            {
              label: 'Approva',
              visibleIf: "{{can('ordini.approva') && row.stato == 'inviato'}}",
              onClick: [{ call: 'approvaOrdine', onError: { toast: 'Errore' } }, { refresh: 'ordini' }],
            },
          ],
        },
      ],
    };
    expect(issuesOf(doc)).toEqual([]);
  });

  it('rifiuta una schermata senza componenti', () => {
    expect(issuesOf({ schemaVersion: '1.0', screen: 'a' })).toContain('/ proprietà obbligatoria mancante: components');
  });

  it('rifiuta un identificativo non in kebab-case', () => {
    expect(issuesOf({ ...minimal(), screen: 'OrdiniElenco' }).some((m) => m.startsWith('/screen'))).toBe(true);
  });

  it('rifiuta un tipo di componente sconosciuto', () => {
    const issues = issuesOf({ ...minimal(), components: [{ type: 'carosello' }] });
    expect(issues.some((m) => m.startsWith('/components/0/type'))).toBe(true);
  });

  it('rifiuta proprietà non previste su un componente', () => {
    const issues = issuesOf({ ...minimal(), components: [{ type: 'text', text: 'x', colore: 'rosso' }] });
    expect(issues).toContain('/components/0 proprietà non prevista: colore');
  });

  it('richiede le proprietà specifiche del tipo', () => {
    const issues = issuesOf({ ...minimal(), components: [{ type: 'table', source: 'ordini' }] });
    expect(issues).toContain('/components/0 proprietà obbligatoria mancante: columns');
  });

  it('rifiuta una condizione senza doppie graffe', () => {
    const doc = { ...minimal(), components: [{ type: 'text', text: 'x', visibleIf: "can('a.b')" }] };
    expect(issuesOf(doc).some((m) => m.startsWith('/components/0/visibleIf'))).toBe(true);
  });

  it('rifiuta un permesso malformato', () => {
    expect(issuesOf({ ...minimal(), requires: 'Ordini' }).some((m) => m.startsWith('/requires'))).toBe(true);
  });

  it('rifiuta un passo di azione sconosciuto', () => {
    const doc = { ...minimal(), components: [{ type: 'button', label: 'Vai', onClick: [{ esegui: 'x' }] }] };
    expect(validateScreen(doc).valid).toBe(false);
  });

  it('valida i componenti annidati nelle sezioni', () => {
    const doc = { ...minimal(), components: [{ type: 'section', components: [{ type: 'text' }] }] };
    expect(issuesOf(doc)).toContain('/components/0/components/0 proprietà obbligatoria mancante: text');
  });
});
