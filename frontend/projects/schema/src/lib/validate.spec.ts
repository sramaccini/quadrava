import { validateNavigation, validateScreen, validateTheme } from './validate';

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
      requires: 'ordini.ordine.leggi',
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
              visibleIf: "{{can('ordini.ordine.approva') && row.stato == 'inviato'}}",
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

describe('validateTheme', () => {
  const base = {
    schemaVersion: '1.0',
    theme: 'test',
    tokens: {
      colors: { primary: '#123456', onPrimary: '#fff', background: '#fff', surface: '#fff', onSurface: '#000', border: 'rgb(1, 2, 3)' },
      typography: { fontFamily: 'Roboto, sans-serif', baseSize: 14 },
      shape: { radius: 4 },
      density: 'compact',
    },
  };

  it('accetta un tema valido', () => {
    expect(validateTheme(base).valid).toBe(true);
  });

  it('rifiuta colori che potrebbero iniettare CSS', () => {
    const bad = structuredClone(base);
    bad.tokens.colors.primary = 'red; background: url(http://evil)';
    expect(validateTheme(bad).valid).toBe(false);
  });

  it('rifiuta una famiglia di font con caratteri non ammessi', () => {
    const bad = structuredClone(base);
    bad.tokens.typography.fontFamily = 'x}body{display:none';
    expect(validateTheme(bad).valid).toBe(false);
  });

  it('rifiuta token sconosciuti e colori obbligatori mancanti', () => {
    const unknown = { ...base, tokens: { ...base.tokens, extra: 1 } };
    expect(validateTheme(unknown).valid).toBe(false);
    const missing = structuredClone(base) as { tokens: { colors: Record<string, string> } };
    delete missing.tokens.colors['primary'];
    expect(validateTheme(missing).valid).toBe(false);
  });
});

describe('validateNavigation', () => {
  const leaf = (id: string) => ({ id, label: id, screen: 'ordini-elenco' });
  const doc = (items: unknown[]) => ({
    schemaVersion: '1.0',
    navigation: 'app',
    useCases: [{ id: 'uc', label: 'Caso', items }],
  });

  it('accetta una voce, un gruppo e tre livelli', () => {
    const items = [leaf('a'), { id: 'g1', label: 'G1', children: [leaf('b'), { id: 'g2', label: 'G2', children: [leaf('c')] }] }];
    expect(validateNavigation(doc(items)).valid).toBe(true);
  });

  it('rifiuta un quarto livello', () => {
    const deep = [{ id: 'g1', label: 'G1', children: [{ id: 'g2', label: 'G2', children: [{ id: 'g3', label: 'G3', children: [leaf('x')] }] }] }];
    expect(validateNavigation(doc(deep)).valid).toBe(false);
  });

  it('rifiuta voci senza schermata né figli, e gruppi senza figli', () => {
    expect(validateNavigation(doc([{ id: 'a', label: 'A' }])).valid).toBe(false);
    expect(validateNavigation(doc([{ id: 'g', label: 'G', children: [] }])).valid).toBe(false);
  });

  it('rifiuta proprietà sconosciute e permessi non validi', () => {
    expect(validateNavigation(doc([{ ...leaf('a'), color: 'red' }])).valid).toBe(false);
    expect(validateNavigation(doc([{ ...leaf('a'), requires: 'Permesso Maiuscolo' }])).valid).toBe(false);
  });
});

describe('formato dei permessi dominio.risorsa.azione', () => {
  it('accetta tre parti e rifiuta due o quattro, in schermate e navigazione', () => {
    const screen = (requires: string) => ({ schemaVersion: '1.0', screen: 'x', requires, components: [{ type: 'text', text: 'a' }] });
    const nav = (requires: string) => ({ schemaVersion: '1.0', navigation: 'n', useCases: [{ id: 'u', label: 'U', items: [{ id: 'a', label: 'A', screen: 's', requires }] }] });
    for (const make of [screen, nav]) {
      expect(JSON.stringify(validateAny(make, 'ordini.ordine.approva'))).toContain('true');
      expect(JSON.stringify(validateAny(make, 'ordini.approva'))).toContain('false');
      expect(JSON.stringify(validateAny(make, 'a.b.c.d'))).toContain('false');
    }
  });
});

function validateAny(make: (r: string) => unknown, requires: string): { valid: boolean } {
  const doc = make(requires) as { navigation?: string };
  return doc.navigation ? validateNavigation(doc) : validateScreen(doc);
}

describe('nuovi componenti: formati di cella, schede, dettaglio, messaggi e conferma', () => {
  const screen = (components: unknown[]) => ({ schemaVersion: '1.0', screen: 'x', components });

  it('accetta una tabella con formati, tonalità dei badge e colonne condizionate', () => {
    const doc = screen([
      {
        type: 'table',
        source: 'fatture',
        columns: [
          { field: 'importo', format: 'currency', currency: 'USD' },
          { field: 'stato', format: 'badge', badges: { pagata: 'success', scaduta: 'danger', bozza: 'neutral', inviata: 'primary' } },
          { field: 'iban', hiddenIf: "{{!can('ordini.iban.leggi')}}" },
        ],
      },
    ]);
    expect(issuesOf(doc)).toEqual([]);
  });

  it('rifiuta formati, toni e valute non previsti', () => {
    const table = (column: object) => screen([{ type: 'table', source: 's', columns: [{ field: 'a', ...column }] }]);
    expect(issuesOf(table({ format: 'euro' })).length).toBeGreaterThan(0);
    expect(issuesOf(table({ format: 'badge', badges: { x: 'rosso' } })).length).toBeGreaterThan(0);
    expect(issuesOf(table({ format: 'currency', currency: 'euro' })).length).toBeGreaterThan(0);
  });

  it('accetta schede annidate con condizioni, schede di dettaglio e messaggi', () => {
    const doc = screen([
      { type: 'alert', text: 'Attenzione', kind: 'error', visibleIf: '{{true}}' },
      {
        type: 'tabs',
        tabs: [
          { label: 'Dati', components: [{ type: 'detail', source: 'ordine', title: 'Ordine', fields: [{ field: 'cliente' }, { field: 'sconto', format: 'percent' }] }] },
          { id: 'banca', label: 'Dati bancari', visibleIf: "{{can('ordini.iban.leggi')}}", components: [{ type: 'tabs', tabs: [{ label: 'Interna', components: [] }] }] },
        ],
      },
    ]);
    expect(issuesOf(doc)).toEqual([]);
  });

  it('rifiuta schede vuote, dettagli senza campi e messaggi di tipo sconosciuto', () => {
    expect(issuesOf(screen([{ type: 'tabs', tabs: [] }])).length).toBeGreaterThan(0);
    expect(issuesOf(screen([{ type: 'tabs', tabs: [{ components: [] }] }])).length).toBeGreaterThan(0);
    expect(issuesOf(screen([{ type: 'detail', source: 's', fields: [] }])).length).toBeGreaterThan(0);
    expect(issuesOf(screen([{ type: 'alert', text: 'x', kind: 'warning' }])).length).toBeGreaterThan(0);
    expect(issuesOf(screen([{ type: 'alert', text: 'x', colore: 'rosso' }])).length).toBeGreaterThan(0);
  });

  it('accetta il passo confirm e rifiuta forme sbagliate', () => {
    const button = (onClick: unknown[]) => screen([{ type: 'button', label: 'Vai', onClick }]);
    expect(issuesOf(button([{ confirm: "Approvare l'ordine {{row.numero}}?" }, { toast: 'Fatto' }]))).toEqual([]);
    expect(issuesOf(button([{ confirm: 5 }])).length).toBeGreaterThan(0);
    expect(issuesOf(button([{ confirm: 'ok', titolo: 'x' }])).length).toBeGreaterThan(0);
  });
});
