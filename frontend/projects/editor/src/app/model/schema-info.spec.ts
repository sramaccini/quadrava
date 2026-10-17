import { validateScreen } from 'schema';
import { paletteGroups } from '../ui/palette.component';
import { EDITOR_MESSAGES } from '../messages';
import type { Json, JsonObject } from './doc-ops';
import { childSlots, containerItems, definitionProperties, listItem, nodeProperties, NODE_TYPES, objectFields, ownerOf, screenProperties, targetAt, type PropertyInfo, type Variant } from './schema-info';
import { defaultItem, emptyScreen, ensureSource, freshId, INPUT_KINDS, nodeTemplate, summaryOf, uniqueInputName, withFreshIds } from './templates';

const t = (key: string): string => EDITOR_MESSAGES['en'][key] ?? key;

describe('reading the schema', () => {
  it('describes the properties of a node with the way to edit them', () => {
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

  it('lists: columns inherit the fields from several definitions; steps are variants recognised by their key', () => {
    const columns = listItem(nodeProperties('dataTable').find((p) => p.name === 'columns')!) as { fields: PropertyInfo[] };
    expect(columns.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['field', 'label', 'format', 'sortable', 'aggregate', 'filter', 'groupable']));
    expect(columns.fields.find((f) => f.name === 'field')?.required).toBe(true);
    const steps = listItem(nodeProperties('button').find((p) => p.name === 'onClick')!) as { variants: Variant[] };
    expect(steps.variants.map((v) => v.key)).toEqual(['call', 'refresh', 'navigate', 'toast', 'set', 'confirm', 'dialog', 'validate', 'print', 'export', 'if', 'run']);
    // Every variant starts valid: a fixed boolean (print) takes its value.
    const print = steps.variants.find((v) => v.key === 'print')!;
    expect(defaultItem(print.fields, 0, t)).toEqual({ print: true });
    const dialog = steps.variants.find((v) => v.key === 'dialog')!.fields[0];
    expect(dialog.kind).toBe('object');
    expect(objectFields(dialog).find((f) => f.name === 'fields')?.kind).toBe('list');
    // Free maps stay JSON.
    expect(nodeProperties('form').find((p) => p.name === 'initial')?.kind).toBe('json');
  });

  it('new elements and summaries', () => {
    const fields = (listItem(nodeProperties('form').find((p) => p.name === 'fields')!) as { fields: PropertyInfo[] }).fields;
    expect(defaultItem(fields, 1, t)).toEqual({ name: 'field2', type: 'text' });
    const columns = (listItem(nodeProperties('table').find((p) => p.name === 'columns')!) as { fields: PropertyInfo[] }).fields;
    expect(defaultItem(columns, 0, t)).toEqual({ field: 'field1', label: 'Description' });
    // A required list with a minimum starts with one element: an action already has a step (a message).
    const actions = (listItem(nodeProperties('table').find((p) => p.name === 'rowActions')!) as { fields: PropertyInfo[] }).fields;
    expect(defaultItem(actions, 0, t)).toEqual({ label: 'Description', onClick: [{ toast: '' }] });
    expect(summaryOf({ field: 'amount', label: "{{ t('x.amount', 'Amount') }}" })).toBe('Amount (amount)');
    expect(summaryOf({ name: 'customer', type: 'lookup' })).toBe('customer · lookup');
    expect(summaryOf({ toast: "{{ t('x.ok', 'Done') }}" }, 'toast')).toBe('toast: Done');
  });

  it('recognises nodes, tabs and steps and finds the element containing a path', () => {
    const doc: Json = {
      components: [{ type: 'tabs', tabs: [{ label: 'To', components: [{ type: 'text', text: 'x' }] }] }, { type: 'wizard', steps: [{ label: 'P', components: [] }] }],
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

  it('every type of the schema is in the palette and has a valid template, with the data source it uses', () => {
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

  it('the palette offers every standalone field type; the names of new fields do not repeat', () => {
    expect(paletteGroups().find((g) => g.key === 'fields')?.types).toEqual(INPUT_KINDS.map((k) => 'input.' + k));
    expect(nodeTemplate('input.select', t)).toMatchObject({ type: 'input', field: { name: 'choice', type: 'select' } });
    expect(nodeTemplate('text.markdown', t)).toMatchObject({ type: 'text', format: 'markdown' });
    const lookup = nodeTemplate('input.lookup', t);
    expect(Object.keys((ensureSource(emptyScreen(t), lookup) as { dataSources: object }).dataSources)).toEqual(['customers']);
    const doc: Json = { components: [{ type: 'input', field: { name: 'text', type: 'text' } }, { type: 'input', field: { name: 'text2', type: 'text' } }] };
    expect(uniqueInputName(doc, nodeTemplate('input.text', t))).toMatchObject({ field: { name: 'text3' } });
    expect(uniqueInputName(doc, nodeTemplate('input.date', t))).toMatchObject({ field: { name: 'date' } });
  });

  it('layout containers take children; the border starts with three regions', () => {
    const doc: Json = { components: [{ type: 'box', components: [] }, { type: 'grid', components: [] }, { type: 'border', components: [] }, { type: 'text', text: 'x' }] };
    for (const i of [0, 1, 2]) expect(childSlots(doc, ['components', i])).toEqual([{ path: ['components', i, 'components'] }]);
    expect(childSlots(doc, ['components', 3])).toEqual([]);
    const border = nodeTemplate('border', t) as { components: { region: string }[] };
    expect(border.components.map((c) => c.region)).toEqual(['north', 'west', 'center']);
  });

  it('new identifiers in kebab-case and unique, also for copies', () => {
    const doc: Json = { components: [{ id: 'data-table-1', type: 'dataTable' }] };
    expect(freshId(doc, 'dataTable')).toBe('data-table-2');
    const copy = withFreshIds(doc, { id: 'data-table-1', type: 'dataTable', rowActions: [{ id: 'action-1', label: 'X' }] }) as { id: string; rowActions: { id: string }[] };
    expect(copy.id).toBe('data-table-2');
    expect(copy.rowActions[0].id).toBe('action-1');
    expect(withFreshIds({ components: [{ id: 'action-1' }] }, { id: 'action-1', label: 'X' })).toEqual({ id: 'action-2', label: 'X' });
  });
});
