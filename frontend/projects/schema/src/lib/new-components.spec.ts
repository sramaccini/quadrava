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

  describe('nuovi tipi di campo', () => {
    const form = (fields: unknown[]) => screen([{ type: 'form', fields }]);
    it('accetta i cinque tipi nuovi e le righe dell’area di testo', () => {
      expect(issuesOf(form([{ name: 'a', type: 'textarea', rows: 5 }, { name: 'b', type: 'datetime' }, { name: 'c', type: 'radio', options: ['x'] }, { name: 'd', type: 'switch' }, { name: 'e', type: 'multiselect', options: ['x'] }]))).toEqual([]);
    });
    it('rifiuta tipi sconosciuti e righe fuori misura', () => {
      expect(issuesOf(form([{ name: 'a', type: 'colore' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'a', type: 'textarea', rows: 1 }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'a', type: 'textarea', rows: 21 }])).length).toBeGreaterThan(0);
    });
  });

  describe('campo lookup', () => {
    const form = (fields: unknown[]) => screen([{ type: 'form', fields }]);
    it('accetta un lookup con data source e campo del testo', () => {
      expect(issuesOf(form([{ name: 'c', type: 'lookup', lookup: { source: 'clienti', labelField: 'nome', valueField: 'id', minChars: 0 } }]))).toEqual([]);
    });
    it('rifiuta lookup senza indicazioni, senza campo del testo o con soglie fuori misura', () => {
      expect(issuesOf(form([{ name: 'c', type: 'lookup' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'c', type: 'lookup', lookup: { source: 'clienti' } }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'c', type: 'lookup', lookup: { source: 'c', labelField: 'n', minChars: 6 } }])).length).toBeGreaterThan(0);
    });
  });

  describe('caricamento di file', () => {
    const form = (fields: unknown[]) => screen([{ type: 'form', fields }]);
    it('accetta tipi ammessi, dimensione massima e data source di invio', () => {
      expect(issuesOf(form([{ name: 'f', type: 'file', accept: '.pdf, image/*,application/vnd.ms-excel', maxSizeKb: 2048, upload: 'carica' }]))).toEqual([]);
    });
    it('rifiuta elenchi di tipi malformati e dimensioni fuori misura', () => {
      expect(issuesOf(form([{ name: 'f', type: 'file', accept: 'pdf' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'f', type: 'file', accept: '.pdf;.doc' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'f', type: 'file', maxSizeKb: 0 }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'f', type: 'file', maxSizeKb: 200000 }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'f', type: 'file', upload: 'u', uploadAs: 'zip' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'f', type: 'file', upload: 'u', uploadAs: 'multipart', maxSizeKb: 102400 }]))).toEqual([]);
    });
    it('lo stato deve iniziare da state. seguito da nomi', () => {
      expect(issuesOf(screen([{ type: 'table', source: 's', columns: [{ field: 'n' }], sort: { bind: 'statex.y' } }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'table', source: 's', columns: [{ field: 'n' }], sort: { bind: 'state.a.b' } }]))).toEqual([]);
    });
  });

  describe('griglia nel form', () => {
    it('accetta da 1 a 4 colonne e campi che ne occupano più di una', () => {
      expect(issuesOf(screen([{ type: 'form', columns: 3, fields: [{ name: 'a', type: 'text', span: 2 }] }]))).toEqual([]);
    });
    it('rifiuta colonne e ampiezze fuori misura', () => {
      expect(issuesOf(screen([{ type: 'form', columns: 5, fields: [{ name: 'a', type: 'text' }] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'form', fields: [{ name: 'a', type: 'text', span: 0 }] }])).length).toBeGreaterThan(0);
    });
  });

  describe('righe ripetibili', () => {
    const form = (fields: unknown[]) => screen([{ type: 'form', fields }]);
    it('accetta righe con campi semplici e limiti', () => {
      expect(issuesOf(form([{ name: 'r', type: 'repeater', minRows: 1, maxRows: 5, addLabel: 'Aggiungi', fields: [{ name: 'a', type: 'text', required: true }, { name: 'b', type: 'switch' }] }]))).toEqual([]);
    });
    it('rifiuta righe senza campi, campi non semplici e limiti fuori misura', () => {
      expect(issuesOf(form([{ name: 'r', type: 'repeater' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'r', type: 'repeater', fields: [{ name: 'x', type: 'repeater', fields: [{ name: 'y', type: 'text' }] }] }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'r', type: 'repeater', fields: [{ name: 'x', type: 'file' }] }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'r', type: 'repeater', maxRows: 0, fields: [{ name: 'x', type: 'text' }] }])).length).toBeGreaterThan(0);
    });
  });

  describe('passo dialog', () => {
    const button = (onClick: unknown[]) => screen([{ type: 'button', label: 'Apri', onClick }]);
    it('accetta una finestra con titolo, campi, valori iniziali e passi di invio', () => {
      expect(issuesOf(button([{ dialog: { title: 'Nota', fields: [{ name: 'testo', type: 'textarea' }], initial: { testo: '{{ row.nota }}' }, columns: 2, submitLabel: 'Salva', onSubmit: [{ call: 'salva' }] } }, { refresh: 'x' }]))).toEqual([]);
    });
    it('rifiuta finestre senza titolo, senza campi, senza invio o con proprietà estranee', () => {
      expect(issuesOf(button([{ dialog: { fields: [{ name: 'a', type: 'text' }], onSubmit: [{ toast: 'x' }] } }])).length).toBeGreaterThan(0);
      expect(issuesOf(button([{ dialog: { title: 'T', fields: [], onSubmit: [{ toast: 'x' }] } }])).length).toBeGreaterThan(0);
      expect(issuesOf(button([{ dialog: { title: 'T', fields: [{ name: 'a', type: 'text' }] } }])).length).toBeGreaterThan(0);
      expect(issuesOf(button([{ dialog: { title: 'T', fields: [{ name: 'a', type: 'text' }], onSubmit: [{ toast: 'x' }], larghezza: 3 } }])).length).toBeGreaterThan(0);
    });
  });

  describe('indicatori', () => {
    it('accetta indicatori da campo o da espressione', () => {
      expect(issuesOf(screen([{ type: 'stats', source: 'r', items: [{ label: 'A', field: 'a', format: 'currency', tone: 'success', caption: 'x' }, { label: 'B', value: '{{ row.a / 2 }}' }] }]))).toEqual([]);
    });
    it('rifiuta indicatori senza valore, troppi indicatori o proprietà estranee', () => {
      expect(issuesOf(screen([{ type: 'stats', items: [{ label: 'A' }] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'stats', items: [] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'stats', items: Array.from({ length: 9 }, (_, i) => ({ label: String(i), field: 'a' })) }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'stats', items: [{ label: 'A', field: 'a', icona: 'x' }] }])).length).toBeGreaterThan(0);
    });
  });

  describe('procedura a passi', () => {
    const step = (label: string) => ({ label, components: [{ type: 'text', text: label }] });
    it('accetta da 2 a 10 passi con stato, condizioni ed etichette', () => {
      expect(issuesOf(screen([{ type: 'wizard', bind: 'state.passo', nextLabel: 'Avanti', steps: [{ ...step('A'), nextIf: '{{ true }}', description: 'x' }, step('B')] }]))).toEqual([]);
    });
    it('rifiuta un solo passo, passi senza contenuto o con proprietà estranee', () => {
      expect(issuesOf(screen([{ type: 'wizard', steps: [step('A')] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'wizard', steps: [{ label: 'A' }, step('B')] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'wizard', steps: [{ ...step('A'), icona: 'x' }, step('B')] }])).length).toBeGreaterThan(0);
    });
  });

  describe('vista ad albero', () => {
    it('accetta un albero con campi, stato, ricerca e passi alla scelta', () => {
      expect(issuesOf(screen([{ type: 'tree', source: 's', keyField: 'id', labelField: 'nome', childrenField: 'figli', bind: 'state.x', searchable: true, expandAll: false, onSelect: [{ toast: '{{ row.nome }}' }] }]))).toEqual([]);
    });
    it('rifiuta alberi senza data source o campo del testo, o con proprietà estranee', () => {
      expect(issuesOf(screen([{ type: 'tree', labelField: 'nome' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'tree', source: 's' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'tree', source: 's', labelField: 'n', trascinabile: true }])).length).toBeGreaterThan(0);
    });
  });

  describe('calendario', () => {
    it('accetta un calendario con colori, stato del mese e passi al clic', () => {
      expect(issuesOf(screen([{ type: 'calendar', source: 's', dateField: 'data', labelField: 'titolo', badgeField: 'stato', badges: { scaduta: 'danger' }, bind: 'state.mese', maxPerDay: 2, onSelect: [{ toast: 'x' }] }]))).toEqual([]);
    });
    it('rifiuta calendari senza campi essenziali, toni sconosciuti o limiti fuori misura', () => {
      expect(issuesOf(screen([{ type: 'calendar', source: 's', labelField: 't' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'calendar', source: 's', dateField: 'd', labelField: 't', badges: { x: 'rosso' } }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'calendar', source: 's', dateField: 'd', labelField: 't', maxPerDay: 0 }])).length).toBeGreaterThan(0);
    });
  });

  describe('grafici', () => {
    const chart = (extra: Record<string, unknown>) => screen([{ type: 'chart', kind: 'bar', source: 's', categoryField: 'c', series: [{ field: 'v' }], ...extra }]);
    it('accetta barre, linee e torte con formati e serie colorate', () => {
      expect(issuesOf(chart({ categoryFormat: 'month', format: 'currency', currency: 'EUR', height: 300, series: [{ field: 'a', label: 'A', tone: 'success' }, { field: 'b' }] }))).toEqual([]);
      expect(issuesOf(chart({ kind: 'pie', categoryKey: 'valori.stato' }))).toEqual([]);
    });
    it('rifiuta tipi sconosciuti, serie vuote o troppe, altezze fuori misura', () => {
      expect(issuesOf(chart({ kind: 'radar' })).length).toBeGreaterThan(0);
      expect(issuesOf(chart({ series: [] })).length).toBeGreaterThan(0);
      expect(issuesOf(chart({ series: Array.from({ length: 7 }, (_, i) => ({ field: 'f' + i })) })).length).toBeGreaterThan(0);
      expect(issuesOf(chart({ height: 100 })).length).toBeGreaterThan(0);
    });
  });

  describe('datatable', () => {
    const dt = (extra: Record<string, unknown>, columns: unknown[] = [{ field: 'a', filter: 'select', groupable: true, sortable: true, aggregate: 'count' }]) =>
      screen([{ type: 'dataTable', source: 's', columns, ...extra }]);
    it('accetta colonne filtrabili, ordinabili e raggruppabili, gruppi iniziali e paginazione', () => {
      expect(issuesOf(dt({ groupBy: ['a'], defaultSort: { field: 'a', direction: 'asc' }, pageSize: 20, rowActionsInline: 1, rowActions: [{ label: 'X', onClick: [{ toast: 'x' }] }] }))).toEqual([]);
    });
    it('rifiuta filtri sconosciuti, più di tre gruppi, gruppi ripetuti e proprietà da tabella non previste', () => {
      expect(issuesOf(dt({}, [{ field: 'a', filter: 'regex' }])).length).toBeGreaterThan(0);
      expect(issuesOf(dt({ groupBy: ['a', 'b', 'c', 'd'] })).length).toBeGreaterThan(0);
      expect(issuesOf(dt({ groupBy: ['a', 'a'] })).length).toBeGreaterThan(0);
      expect(issuesOf(dt({ sort: { bind: 'state.x' } })).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'table', source: 's', columns: [{ field: 'a', filter: 'text' }] }])).length).toBeGreaterThan(0);
    });
  });
});
