import { validateScreen } from 'schema';
import { paletteGroups } from '../ui/palette.component';
import { EDITOR_MESSAGES } from '../messages';
import type { Json, JsonObject } from './doc-ops';
import { childSlots, containerItems, definitionProperties, listItem, nodeProperties, NODE_TYPES, objectFields, ownerOf, screenProperties, targetAt, type PropertyInfo, type Variant } from './schema-info';
import { defaultItem, emptyScreen, ensureSource, freshId, INPUT_KINDS, nodeTemplate, summaryOf, uniqueInputName, withFreshIds } from './templates';

const t = (key: string): string => EDITOR_MESSAGES['it'][key] ?? key;

describe('lettura dello schema', () => {
  it('descrive le proprietà di un nodo con il modo di modificarle', () => {
    const table = nodeProperties('table');
    expect(table[0].name).toBe('id');
    expect(table.find((p) => p.name === 'source')).toMatchObject({ kind: 'text', required: true });
    expect(table.find((p) => p.name === 'columns')).toMatchObject({ kind: 'list', required: true, minimum: 1 });
    expect(table.find((p) => p.name === 'sort')?.kind).toBe('object');
    expect(table.find((p) => p.name === 'rowActionsInline')).toMatchObject({ kind: 'number', minimum: 0, maximum: 10 });
    expect(table.find((p) => p.name === 'visibleIf')).toMatchObject({ kind: 'expression' });
    expect(nodeProperties('alert').find((p) => p.name === 'kind')).toMatchObject({ kind: 'enum', options: ['info', 'success', 'error'] });
    expect(nodeProperties('tree').find((p) => p.name === 'searchable')?.kind).toBe('boolean');
    expect(nodeProperties('section').find((p) => p.name === 'components')?.kind).toBe('children');
    expect(definitionProperties('wizardStep').map((p) => p.name)).toContain('nextIf');
    expect(screenProperties().map((p) => p.name)).toEqual(['screen', 'title', 'description', 'requires', 'schemaVersion']);
  });

  it('elenchi: le colonne ereditano i campi da più definizioni; i passi sono varianti riconosciute dalla chiave', () => {
    const columns = listItem(nodeProperties('dataTable').find((p) => p.name === 'columns')!) as { fields: PropertyInfo[] };
    expect(columns.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['field', 'label', 'format', 'sortable', 'aggregate', 'filter', 'groupable']));
    expect(columns.fields.find((f) => f.name === 'field')?.required).toBe(true);
    const steps = listItem(nodeProperties('button').find((p) => p.name === 'onClick')!) as { variants: Variant[] };
    expect(steps.variants.map((v) => v.key)).toEqual(['call', 'refresh', 'navigate', 'toast', 'set', 'confirm', 'dialog']);
    const dialog = steps.variants.find((v) => v.key === 'dialog')!.fields[0];
    expect(dialog.kind).toBe('object');
    expect(objectFields(dialog).find((f) => f.name === 'fields')?.kind).toBe('list');
    // Le mappe libere restano JSON.
    expect(nodeProperties('form').find((p) => p.name === 'initial')?.kind).toBe('json');
  });

  it('elementi nuovi e riassunti', () => {
    const fields = (listItem(nodeProperties('form').find((p) => p.name === 'fields')!) as { fields: PropertyInfo[] }).fields;
    expect(defaultItem(fields, 1, t)).toEqual({ name: 'campo2', type: 'text' });
    const columns = (listItem(nodeProperties('table').find((p) => p.name === 'columns')!) as { fields: PropertyInfo[] }).fields;
    expect(defaultItem(columns, 0, t)).toEqual({ field: 'campo1', label: 'Descrizione' });
    // Un elenco obbligatorio con un minimo nasce con un elemento: un'azione ha già un passo (un messaggio).
    const actions = (listItem(nodeProperties('table').find((p) => p.name === 'rowActions')!) as { fields: PropertyInfo[] }).fields;
    expect(defaultItem(actions, 0, t)).toEqual({ label: 'Descrizione', onClick: [{ toast: '' }] });
    expect(summaryOf({ field: 'importo', label: "{{ t('x.importo', 'Importo') }}" })).toBe('Importo (importo)');
    expect(summaryOf({ name: 'cliente', type: 'lookup' })).toBe('cliente · lookup');
    expect(summaryOf({ toast: "{{ t('x.ok', 'Fatto') }}" }, 'toast')).toBe('toast: Fatto');
  });

  it('riconosce nodi, schede e passi e trova l’elemento che contiene un percorso', () => {
    const doc: Json = {
      components: [{ type: 'tabs', tabs: [{ label: 'A', components: [{ type: 'text', text: 'x' }] }] }, { type: 'wizard', steps: [{ label: 'P', components: [] }] }],
    };
    expect(targetAt(doc, [])).toEqual({ kind: 'screen' });
    expect(targetAt(doc, ['components', 0])).toEqual({ kind: 'node', type: 'tabs' });
    expect(targetAt(doc, ['components', 0, 'tabs', 0])).toEqual({ kind: 'tab' });
    expect(targetAt(doc, ['components', 1, 'steps', 0])).toEqual({ kind: 'step' });
    expect(targetAt(doc, ['components', 0, 'tabs'])).toBeNull();
    expect(ownerOf(doc, ['components', 0, 'tabs', 0, 'components', 0, 'text'])).toEqual(['components', 0, 'tabs', 0, 'components', 0]);
    expect(containerItems(doc, ['components', 0])).toEqual([['components', 0, 'tabs', 0]]);
    expect(childSlots(doc, ['components', 0, 'tabs', 0])).toEqual([{ path: ['components', 0, 'tabs', 0, 'components'] }]);
    expect(childSlots(doc, ['components', 0])).toEqual([]);
  });

  it('ogni tipo dello schema è nella tavolozza e ha un modello valido, con il data source che usa', () => {
    const kinds = paletteGroups().flatMap((g) => g.types);
    expect([...new Set(kinds.map((k) => k.split('.')[0]))].sort()).toEqual([...NODE_TYPES].sort());
    for (const type of [...NODE_TYPES, ...kinds.filter((k) => k.includes('.'))]) {
      const node: JsonObject = { id: freshId({}, type.split('.')[0]), ...nodeTemplate(type, t) };
      const doc = ensureSource({ ...emptyScreen(t), components: [node] }, node);
      const result = validateScreen(doc);
      expect(result.valid ? [] : result.issues, type).toEqual([]);
      if (typeof node['source'] === 'string') expect(Object.keys((doc as { dataSources: object }).dataSources)).toContain(node['source']);
    }
  });

  it('la tavolozza offre ogni tipo di campo a sé; i nomi dei campi nuovi non si ripetono', () => {
    expect(paletteGroups().find((g) => g.key === 'fields')?.types).toEqual(INPUT_KINDS.map((k) => 'input.' + k));
    expect(nodeTemplate('input.select', t)).toMatchObject({ type: 'input', field: { name: 'scelta', type: 'select' } });
    const lookup = nodeTemplate('input.lookup', t);
    expect(Object.keys((ensureSource(emptyScreen(t), lookup) as { dataSources: object }).dataSources)).toEqual(['clienti']);
    const doc: Json = { components: [{ type: 'input', field: { name: 'testo', type: 'text' } }, { type: 'input', field: { name: 'testo2', type: 'text' } }] };
    expect(uniqueInputName(doc, nodeTemplate('input.text', t))).toMatchObject({ field: { name: 'testo3' } });
    expect(uniqueInputName(doc, nodeTemplate('input.date', t))).toMatchObject({ field: { name: 'data' } });
  });

  it('identificativi nuovi in kebab-case e unici, anche per le copie', () => {
    const doc: Json = { components: [{ id: 'data-table-1', type: 'dataTable' }] };
    expect(freshId(doc, 'dataTable')).toBe('data-table-2');
    const copy = withFreshIds(doc, { id: 'data-table-1', type: 'dataTable', rowActions: [{ id: 'azione-1', label: 'X' }] }) as { id: string; rowActions: { id: string }[] };
    expect(copy.id).toBe('data-table-2');
    expect(copy.rowActions[0].id).toBe('azione-1');
    expect(withFreshIds({ components: [{ id: 'azione-1' }] }, { id: 'azione-1', label: 'X' })).toEqual({ id: 'azione-2', label: 'X' });
  });
});
