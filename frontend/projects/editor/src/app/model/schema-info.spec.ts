import { validateScreen } from 'schema';
import { paletteGroups } from '../ui/palette.component';
import { EDITOR_MESSAGES } from '../messages';
import type { Json, JsonObject } from './doc-ops';
import { childSlots, containerItems, definitionProperties, nodeProperties, NODE_TYPES, ownerOf, screenProperties, targetAt } from './schema-info';
import { emptyScreen, ensureSource, freshId, nodeTemplate, withFreshIds } from './templates';

const t = (key: string): string => EDITOR_MESSAGES['it'][key] ?? key;

describe('lettura dello schema', () => {
  it('descrive le proprietà di un nodo con il modo di modificarle', () => {
    const table = nodeProperties('table');
    expect(table[0].name).toBe('id');
    expect(table.find((p) => p.name === 'source')).toMatchObject({ kind: 'text', required: true });
    expect(table.find((p) => p.name === 'columns')).toMatchObject({ kind: 'json', required: true });
    expect(table.find((p) => p.name === 'rowActionsInline')).toMatchObject({ kind: 'number', minimum: 0, maximum: 10 });
    expect(table.find((p) => p.name === 'visibleIf')).toMatchObject({ kind: 'expression' });
    expect(nodeProperties('alert').find((p) => p.name === 'kind')).toMatchObject({ kind: 'enum', options: ['info', 'success', 'error'] });
    expect(nodeProperties('tree').find((p) => p.name === 'searchable')?.kind).toBe('boolean');
    expect(nodeProperties('section').find((p) => p.name === 'components')?.kind).toBe('children');
    expect(definitionProperties('wizardStep').map((p) => p.name)).toContain('nextIf');
    expect(screenProperties().map((p) => p.name)).toEqual(['screen', 'title', 'description', 'requires', 'schemaVersion']);
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
    expect(paletteGroups().flatMap((g) => g.types).sort()).toEqual([...NODE_TYPES].sort());
    for (const type of NODE_TYPES) {
      const node: JsonObject = { id: freshId({}, type), ...nodeTemplate(type, t) };
      const doc = ensureSource({ ...emptyScreen(t), components: [node] }, node);
      const result = validateScreen(doc);
      expect(result.valid ? [] : result.issues, type).toEqual([]);
      if (typeof node['source'] === 'string') expect(Object.keys((doc as { dataSources: object }).dataSources)).toContain(node['source']);
    }
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
