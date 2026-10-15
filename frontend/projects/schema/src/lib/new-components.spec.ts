import { validateMessages, validateScreen } from './validate';

/** Schema of the components added to the catalogue after the first version (one block per component). */
const screen = (components: unknown[], dataSources: Record<string, unknown> = {}) => ({ schemaVersion: '1.0', screen: 'prova', dataSources, components });
const issuesOf = (doc: unknown): string[] => {
  const result = validateScreen(doc);
  return result.valid ? [] : result.issues.map((i) => `${i.path} ${i.message}`);
};
const table = (extra: Record<string, unknown>, columns: unknown[] = [{ field: 'numero' }]) => screen([{ type: 'table', source: 's', columns, ...extra }]);

describe('schema of the new components', () => {
  describe('sorting', () => {
    it('accepts sortable columns and sorting with state and default', () => {
      expect(issuesOf(table({ sort: { bind: 'state.ordinamento', default: { field: 'numero', direction: 'desc' } } }, [{ field: 'numero', sortable: true }]))).toEqual([]);
      expect(issuesOf(table({ sort: {} }))).toEqual([]);
    });

    it('rejects unknown directions, paths outside the state and foreign properties', () => {
      expect(issuesOf(table({ sort: { default: { field: 'numero', direction: 'su' } } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ sort: { bind: 'params.ordine' } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ sort: { bind: 'state.x', verso: 'asc' } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({}, [{ field: 'numero', ordinabile: true }])).length).toBeGreaterThan(0);
    });

    it('table properties do not apply to the fields of the detail panel', () => {
      expect(issuesOf(screen([{ type: 'detail', source: 's', fields: [{ field: 'numero' }] }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'detail', source: 's', fields: [{ field: 'numero', sortable: true }] }])).length).toBeGreaterThan(0);
    });
  });

  describe('selection and bulk actions', () => {
    it('accepts selection with key and bulk actions', () => {
      expect(issuesOf(table({ selection: { bind: 'state.scelte', key: 'codice' }, bulkActions: [{ label: 'Invia', onClick: [{ toast: 'ok' }] }] }))).toEqual([]);
    });

    it('rejects selections without state or with foreign properties', () => {
      expect(issuesOf(table({ selection: { key: 'id' } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ selection: { bind: 'state.x', multipla: true } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ bulkActions: [{ label: 'Invia' }] })).length).toBeGreaterThan(0);
    });
  });

  describe('row actions menu', () => {
    it('accepts a number of buttons between 0 and 10', () => {
      expect(issuesOf(table({ rowActionsInline: 0 }))).toEqual([]);
      expect(issuesOf(table({ rowActionsInline: 2 }))).toEqual([]);
      expect(issuesOf(table({ rowActionsInline: -1 })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ rowActionsInline: 1.5 })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ rowActionsInline: 11 })).length).toBeGreaterThan(0);
    });
  });

  describe('expandable rows', () => {
    it('accepts an area with nodes and a condition', () => {
      expect(issuesOf(table({ expand: { expandIf: '{{ row.x > 0 }}', components: [{ type: 'text', text: '{{ row.note }}' }] } }))).toEqual([]);
    });

    it('rejects empty areas, conditions that are not expressions and foreign properties', () => {
      expect(issuesOf(table({ expand: { components: [] } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ expand: { components: [{ type: 'text', text: 'x' }], expandIf: 'sempre' } })).length).toBeGreaterThan(0);
      expect(issuesOf(table({ expand: { components: [{ type: 'text', text: 'x' }], aperta: true } })).length).toBeGreaterThan(0);
    });
  });

  describe('number format, clickable cells and totals', () => {
    it('accepts number with decimals (also in the detail), onClick and aggregate in table columns', () => {
      expect(issuesOf(table({}, [{ field: 'n', format: 'number', decimals: 2, aggregate: 'sum', onClick: [{ toast: '{{ row.n }}' }] }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'detail', source: 's', fields: [{ field: 'n', format: 'number', decimals: 0 }] }]))).toEqual([]);
    });

    it('rejects out-of-range decimals, unknown aggregates and onClick or aggregate in the detail', () => {
      expect(issuesOf(table({}, [{ field: 'n', format: 'number', decimals: 7 }])).length).toBeGreaterThan(0);
      expect(issuesOf(table({}, [{ field: 'n', aggregate: 'median' }])).length).toBeGreaterThan(0);
      expect(issuesOf(table({}, [{ field: 'n', onClick: [] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'detail', source: 's', fields: [{ field: 'n', aggregate: 'sum' }] }])).length).toBeGreaterThan(0);
    });
  });

  describe('new field types', () => {
    const form = (fields: unknown[]) => screen([{ type: 'form', fields }]);
    it('accepts the five new types and the rows of the text area', () => {
      expect(issuesOf(form([{ name: 'a', type: 'textarea', rows: 5 }, { name: 'b', type: 'datetime' }, { name: 'c', type: 'radio', options: ['x'] }, { name: 'd', type: 'switch' }, { name: 'e', type: 'multiselect', options: ['x'] }]))).toEqual([]);
    });
    it('rejects unknown types and out-of-range rows', () => {
      expect(issuesOf(form([{ name: 'a', type: 'colore' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'a', type: 'textarea', rows: 1 }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'a', type: 'textarea', rows: 21 }])).length).toBeGreaterThan(0);
    });
  });

  describe('lookup field', () => {
    const form = (fields: unknown[]) => screen([{ type: 'form', fields }]);
    it('accepts a lookup with data source and text field', () => {
      expect(issuesOf(form([{ name: 'c', type: 'lookup', lookup: { source: 'clienti', labelField: 'nome', valueField: 'id', minChars: 0 } }]))).toEqual([]);
    });
    it('rejects lookups without settings, without a text field or with out-of-range thresholds', () => {
      expect(issuesOf(form([{ name: 'c', type: 'lookup' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'c', type: 'lookup', lookup: { source: 'clienti' } }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'c', type: 'lookup', lookup: { source: 'c', labelField: 'n', minChars: 6 } }])).length).toBeGreaterThan(0);
    });
  });

  describe('file upload', () => {
    const form = (fields: unknown[]) => screen([{ type: 'form', fields }]);
    it('accepts allowed types, maximum size and upload data source', () => {
      expect(issuesOf(form([{ name: 'f', type: 'file', accept: '.pdf, image/*,application/vnd.ms-excel', maxSizeKb: 2048, upload: 'carica' }]))).toEqual([]);
    });
    it('rejects malformed type lists and out-of-range sizes', () => {
      expect(issuesOf(form([{ name: 'f', type: 'file', accept: 'pdf' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'f', type: 'file', accept: '.pdf;.doc' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'f', type: 'file', maxSizeKb: 0 }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'f', type: 'file', maxSizeKb: 200000 }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'f', type: 'file', upload: 'u', uploadAs: 'zip' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'f', type: 'file', upload: 'u', uploadAs: 'multipart', maxSizeKb: 102400 }]))).toEqual([]);
    });
    it('the state must start with state. followed by names', () => {
      expect(issuesOf(screen([{ type: 'table', source: 's', columns: [{ field: 'n' }], sort: { bind: 'statex.y' } }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'table', source: 's', columns: [{ field: 'n' }], sort: { bind: 'state.a.b' } }]))).toEqual([]);
    });
  });

  describe('grid in the form', () => {
    it('accepts from 1 to 4 columns and fields that take more than one', () => {
      expect(issuesOf(screen([{ type: 'form', columns: 3, fields: [{ name: 'a', type: 'text', span: 2 }] }]))).toEqual([]);
    });
    it('rejects out-of-range columns and spans', () => {
      expect(issuesOf(screen([{ type: 'form', columns: 5, fields: [{ name: 'a', type: 'text' }] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'form', fields: [{ name: 'a', type: 'text', span: 0 }] }])).length).toBeGreaterThan(0);
    });
  });

  describe('repeatable rows', () => {
    const form = (fields: unknown[]) => screen([{ type: 'form', fields }]);
    it('accepts rows with simple fields and limits', () => {
      expect(issuesOf(form([{ name: 'r', type: 'repeater', minRows: 1, maxRows: 5, addLabel: 'Aggiungi', fields: [{ name: 'a', type: 'text', required: true }, { name: 'b', type: 'switch' }] }]))).toEqual([]);
    });
    it('rejects rows without fields, non-simple fields and out-of-range limits', () => {
      expect(issuesOf(form([{ name: 'r', type: 'repeater' }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'r', type: 'repeater', fields: [{ name: 'x', type: 'repeater', fields: [{ name: 'y', type: 'text' }] }] }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'r', type: 'repeater', fields: [{ name: 'x', type: 'multiselect', options: ['a'] }] }])).length).toBeGreaterThan(0);
      expect(issuesOf(form([{ name: 'r', type: 'repeater', fields: [{ name: 'x', type: 'file' }, { name: 'y', type: 'lookup', lookup: { source: 's', labelField: 'n' } }] }]))).toEqual([]);
      expect(issuesOf(form([{ name: 'r', type: 'repeater', maxRows: 0, fields: [{ name: 'x', type: 'text' }] }])).length).toBeGreaterThan(0);
    });
  });

  describe('dialog step', () => {
    const button = (onClick: unknown[]) => screen([{ type: 'button', label: 'Apri', onClick }]);
    it('accepts a window with title, fields, initial values and submit steps', () => {
      expect(issuesOf(button([{ dialog: { title: 'Nota', fields: [{ name: 'testo', type: 'textarea' }], initial: { testo: '{{ row.nota }}' }, columns: 2, submitLabel: 'Salva', onSubmit: [{ call: 'salva' }] } }, { refresh: 'x' }]))).toEqual([]);
    });
    it('rejects windows without title, fields or submit, or with foreign properties', () => {
      expect(issuesOf(button([{ dialog: { fields: [{ name: 'a', type: 'text' }], onSubmit: [{ toast: 'x' }] } }])).length).toBeGreaterThan(0);
      expect(issuesOf(button([{ dialog: { title: 'T', fields: [], onSubmit: [{ toast: 'x' }] } }])).length).toBeGreaterThan(0);
      expect(issuesOf(button([{ dialog: { title: 'T', fields: [{ name: 'a', type: 'text' }] } }])).length).toBeGreaterThan(0);
      expect(issuesOf(button([{ dialog: { title: 'T', fields: [{ name: 'a', type: 'text' }], onSubmit: [{ toast: 'x' }], larghezza: 3 } }])).length).toBeGreaterThan(0);
    });
  });

  describe('indicators', () => {
    it('accepts indicators from a field or from an expression', () => {
      expect(issuesOf(screen([{ type: 'stats', source: 'r', items: [{ label: 'A', field: 'a', format: 'currency', tone: 'success', caption: 'x' }, { label: 'B', value: '{{ row.a / 2 }}' }] }]))).toEqual([]);
    });
    it('rejects indicators without a value, too many indicators or foreign properties', () => {
      expect(issuesOf(screen([{ type: 'stats', items: [{ label: 'A' }] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'stats', items: [] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'stats', items: Array.from({ length: 9 }, (_, i) => ({ label: String(i), field: 'a' })) }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'stats', items: [{ label: 'A', field: 'a', icona: 'x' }] }])).length).toBeGreaterThan(0);
    });
  });

  describe('wizard', () => {
    const step = (label: string) => ({ label, components: [{ type: 'text', text: label }] });
    it('accepts from 2 to 10 steps with state, conditions and labels', () => {
      expect(issuesOf(screen([{ type: 'wizard', bind: 'state.passo', nextLabel: 'Avanti', steps: [{ ...step('A'), nextIf: '{{ true }}', description: 'x' }, step('B')] }]))).toEqual([]);
    });
    it('rejects a single step, steps without content or with foreign properties', () => {
      expect(issuesOf(screen([{ type: 'wizard', steps: [step('A')] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'wizard', steps: [{ label: 'A' }, step('B')] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'wizard', steps: [{ ...step('A'), icona: 'x' }, step('B')] }])).length).toBeGreaterThan(0);
    });
  });

  describe('tree view', () => {
    it('accepts a tree with fields, state, search and steps on selection', () => {
      expect(issuesOf(screen([{ type: 'tree', source: 's', keyField: 'id', labelField: 'nome', childrenField: 'figli', bind: 'state.x', searchable: true, expandAll: false, onSelect: [{ toast: '{{ row.nome }}' }] }]))).toEqual([]);
    });
    it('rejects trees without data source or text field, or with foreign properties', () => {
      expect(issuesOf(screen([{ type: 'tree', labelField: 'nome' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'tree', source: 's' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'tree', source: 's', labelField: 'n', trascinabile: true }])).length).toBeGreaterThan(0);
    });
  });

  describe('calendar', () => {
    it('accepts a calendar with colours, month state and steps on click', () => {
      expect(issuesOf(screen([{ type: 'calendar', source: 's', dateField: 'data', labelField: 'titolo', badgeField: 'stato', badges: { scaduta: 'danger' }, bind: 'state.mese', maxPerDay: 2, onSelect: [{ toast: 'x' }] }]))).toEqual([]);
    });
    it('rejects calendars without essential fields, unknown tones or out-of-range limits', () => {
      expect(issuesOf(screen([{ type: 'calendar', source: 's', labelField: 't' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'calendar', source: 's', dateField: 'd', labelField: 't', badges: { x: 'rosso' } }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'calendar', source: 's', dateField: 'd', labelField: 't', maxPerDay: 0 }])).length).toBeGreaterThan(0);
    });
  });

  describe('charts', () => {
    const chart = (extra: Record<string, unknown>) => screen([{ type: 'chart', kind: 'bar', source: 's', categoryField: 'c', series: [{ field: 'v' }], ...extra }]);
    it('accepts bars, lines and pies with formats and coloured series', () => {
      expect(issuesOf(chart({ categoryFormat: 'month', format: 'currency', currency: 'EUR', height: 300, series: [{ field: 'a', label: 'A', tone: 'success' }, { field: 'b' }] }))).toEqual([]);
      expect(issuesOf(chart({ kind: 'pie', categoryKey: 'valori.stato' }))).toEqual([]);
      expect(issuesOf(chart({ stacked: true, rightFormat: 'percent', series: [{ field: 'a' }, { field: 'm', kind: 'line', axis: 'right' }] }))).toEqual([]);
      expect(issuesOf(chart({ series: [{ field: 'm', axis: 'top' }] })).length).toBeGreaterThan(0);
      expect(issuesOf(chart({ series: [{ field: 'm', kind: 'pie' }] })).length).toBeGreaterThan(0);
    });
    it('rejects unknown kinds, empty or too many series, out-of-range heights', () => {
      expect(issuesOf(chart({ kind: 'radar' })).length).toBeGreaterThan(0);
      expect(issuesOf(chart({ series: [] })).length).toBeGreaterThan(0);
      expect(issuesOf(chart({ series: Array.from({ length: 7 }, (_, i) => ({ field: 'f' + i })) })).length).toBeGreaterThan(0);
      expect(issuesOf(chart({ height: 100 })).length).toBeGreaterThan(0);
    });
  });

  describe('datatable', () => {
    const dt = (extra: Record<string, unknown>, columns: unknown[] = [{ field: 'a', filter: 'select', groupable: true, sortable: true, aggregate: 'count' }]) =>
      screen([{ type: 'dataTable', source: 's', columns, ...extra }]);
    it('accepts filterable, sortable and groupable columns, initial groups and paging', () => {
      expect(issuesOf(dt({ groupBy: ['a'], defaultSort: { field: 'a', direction: 'asc' }, pageSize: 20, rowActionsInline: 1, rowActions: [{ label: 'X', onClick: [{ toast: 'x' }] }] }))).toEqual([]);
    });
    it('rejects unknown filters, more than three groups, repeated groups and unexpected table properties', () => {
      expect(issuesOf(dt({}, [{ field: 'a', filter: 'regex' }])).length).toBeGreaterThan(0);
      expect(issuesOf(dt({ groupBy: ['a', 'b', 'c', 'd'] })).length).toBeGreaterThan(0);
      expect(issuesOf(dt({ groupBy: ['a', 'a'] })).length).toBeGreaterThan(0);
      expect(issuesOf(dt({ sort: { bind: 'state.x' } })).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'table', source: 's', columns: [{ field: 'a', filter: 'text' }] }])).length).toBeGreaterThan(0);
    });
  });

  describe('server-side datatable', () => {
    const sdt = (extra: Record<string, unknown>) => screen([{ type: 'serverDataTable', source: 'ricerca', columns: [{ field: 'a', filter: 'text', groupable: true, sortable: true, aggregate: 'sum' }], ...extra }]);
    it('accepts filterable columns, initial groups, pages up to 200 and the request state', () => {
      expect(issuesOf(sdt({ groupBy: ['a'], defaultSort: { field: 'a', direction: 'desc' }, pageSize: 200, bind: 'state.richiesta', rowActionsInline: 1, rowActions: [{ label: 'X', onClick: [{ refresh: 'ricerca' }] }] }))).toEqual([]);
    });
    it('rejects out-of-range pages, more than three groups and foreign properties', () => {
      expect(issuesOf(sdt({ pageSize: 500 })).length).toBeGreaterThan(0);
      expect(issuesOf(sdt({ groupBy: ['a', 'b', 'c', 'd'] })).length).toBeGreaterThan(0);
      expect(issuesOf(sdt({ paging: 'server' })).length).toBeGreaterThan(0);
    });
  });

  describe('standalone field (input) and row section', () => {
    const input = (extra: Record<string, unknown>) => screen([{ type: 'input', field: { name: 'nome', type: 'text', label: 'Nome' }, ...extra }]);

    it('accepts a field with state, initial value and steps on change', () => {
      expect(issuesOf(input({}))).toEqual([]);
      expect(issuesOf(input({ bind: 'state.cliente.nome', default: 'Anna', onChange: [{ refresh: 'elenco' }] }))).toEqual([]);
      expect(issuesOf(screen([{ type: 'input', field: { name: 'c', type: 'lookup', lookup: { source: 'clienti', labelField: 'nome' } } }]))).toEqual([]);
    });

    it('rejects an input without a field, with an invalid field or a state outside state', () => {
      expect(issuesOf(screen([{ type: 'input' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'input', field: { name: 'c', type: 'lookup' } }])).length).toBeGreaterThan(0);
      expect(issuesOf(input({ bind: 'params.x' })).length).toBeGreaterThan(0);
      expect(issuesOf(input({ onChange: [] })).length).toBeGreaterThan(0);
      expect(issuesOf(input({ fields: [] })).length).toBeGreaterThan(0);
    });

    it('the section accepts layout row or column', () => {
      expect(issuesOf(screen([{ type: 'section', layout: 'row', components: [] }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'section', layout: 'griglia', components: [] }])).length).toBeGreaterThan(0);
    });
  });

  describe('layout containers', () => {
    it('accepts box, grid and border with the position properties of the children', () => {
      const text = { type: 'text', text: 'x' };
      expect(issuesOf(screen([{ type: 'box', direction: 'column', gap: 'small', align: 'end', justify: 'between', wrap: false, components: [{ ...text, grow: 2 }] }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'grid', columns: 3, components: [{ ...text, span: 2 }] }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'border', westWidth: 200, components: [{ ...text, region: 'north' }, text] }]))).toEqual([]);
    });

    it('rejects out-of-range values and unknown properties', () => {
      expect(issuesOf(screen([{ type: 'box', components: [], direction: 'diagonal' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'box', components: [], gap: 'enorme' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'grid', components: [], columns: 13 }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'grid', components: [{ type: 'text', text: 'x', span: 0 }] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'border', components: [{ type: 'text', text: 'x', region: 'sopra' }] }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'border', components: [], westWidth: 50 }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'grid' }])).length).toBeGreaterThan(0);
    });
  });

  describe('image, link, progress, timeline and kanban', () => {
    it('accepts the expected shapes', () => {
      expect(issuesOf(screen([{ type: 'image', src: '/logo.png', alt: 'Logo', width: 100, height: 50, fit: 'cover' }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'link', label: 'Ordine', screen: 'ordine-dettaglio', params: { id: 1 } }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'link', label: 'Doc', href: 'https://example.com/doc' }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'progress', value: '{{ 3 }}', max: 4, kind: 'circle', tone: 'success' }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'timeline', source: 's', dateField: 'd', labelField: 'l', toneField: 't', tones: { ko: 'danger' }, order: 'asc' }]))).toEqual([]);
      expect(issuesOf(screen([{ type: 'kanban', source: 's', columnField: 'stato', titleField: 't', columns: [{ value: 'a', label: 'A', tone: 'primary' }], moveIf: '{{ true }}', onMove: [{ refresh: 's' }] }]))).toEqual([]);
    });

    it('rejects images without alternative text, ambiguous or dangerous links, missing columns', () => {
      expect(issuesOf(screen([{ type: 'image', src: '/logo.png' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'image', src: '/logo.png', alt: '' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'link', label: 'X' }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'link', label: 'X', screen: 'a', href: 'https://x.test' }])).length).toBeGreaterThan(0);
      for (const href of ['javascript:alert(1)', 'http://x.test', '//x.test', 'mailto:a@b.c']) {
        expect(issuesOf(screen([{ type: 'link', label: 'X', href }])).length, href).toBeGreaterThan(0);
      }
      expect(issuesOf(screen([{ type: 'progress', value: true }])).length).toBeGreaterThan(0);
      expect(issuesOf(screen([{ type: 'kanban', source: 's', columnField: 'c', titleField: 't', columns: [] }])).length).toBeGreaterThan(0);
    });
  });

  describe('translation catalogues', () => {
    it('accepts one catalogue per language; rejects invalid languages, keys or texts', () => {
      const ok = validateMessages({ schemaVersion: '1.0', messages: 'pt-br', texts: { 'app.title': 'Olá', 'comune.n': '{n, number}' } });
      expect(ok.valid).toBe(true);
      expect(validateMessages({ schemaVersion: '1.0', messages: 'IT', texts: {} }).valid).toBe(false);
      expect(validateMessages({ schemaVersion: '1.0', messages: 'it', texts: { 'chiave con spazi': 'x' } }).valid).toBe(false);
      expect(validateMessages({ schemaVersion: '1.0', messages: 'it', texts: { a: 1 } }).valid).toBe(false);
      expect(validateMessages({ schemaVersion: '1.0', messages: 'it' }).valid).toBe(false);
    });
  });
});
