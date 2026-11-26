import { sourceReferences, unknownSourceReferences } from './source-references';

describe('references to data sources', () => {
  const screen = {
    schemaVersion: '1.0',
    screen: 's',
    dataSources: { issues: { type: 'rest', method: 'GET', url: '/api/issues', source: 'not a reference' }, save: { ref: 'issues/save' } },
    components: [
      { type: 'table', source: 'issues', rowActions: [{ label: 'Done', onClick: [{ call: 'save' }, { refresh: 'issues' }] }] },
      { type: 'kanban', source: 'issues', columnField: 'status', titleField: 'title', columnsFrom: { source: 'statuses' } },
      {
        type: 'form',
        fields: [
          { name: 'owner', type: 'lookup', lookup: { source: 'people', labelField: 'name' } },
          { name: 'query', type: 'text', suggest: { source: 'words' }, validation: [{ remote: 'checkQuery' }] },
          { name: 'file', type: 'file', upload: 'files' },
        ],
        fieldsFrom: { source: 'customFields', types: { user: { name: 'user', type: 'lookup', lookup: { source: 'members', labelField: 'name' } } } },
      },
      { type: 'comments', source: 'comments', mentions: { source: 'people' } },
    ],
  };

  it('finds every place that names a data source, with its path', () => {
    const found = sourceReferences(screen);
    expect(found.map((r) => r.name)).toEqual(['issues', 'save', 'issues', 'issues', 'statuses', 'people', 'words', 'checkQuery', 'files', 'customFields', 'members', 'comments', 'people']);
    expect(found.find((r) => r.name === 'customFields')?.path).toEqual(['components', 2, 'fieldsFrom', 'source']);
    expect(found.find((r) => r.name === 'members')?.path).toEqual(['components', 2, 'fieldsFrom', 'types', 'user', 'lookup', 'source']);
  });

  it('finds the data sources of the items of a menu button', () => {
    const menu = { components: [{ type: 'menuButton', label: 'Status', items: [{ source: 'transitions', labelField: 'name', onClick: [{ call: 'move' }] }, { divider: true }, { label: 'View', onClick: [{ refresh: 'all' }] }] }] };
    expect(sourceReferences(menu).map((r) => [r.name, r.path.join('/')])).toEqual([
      ['transitions', 'components/0/items/0/source'],
      ['move', 'components/0/items/0/onClick/0/call'],
      ['all', 'components/0/items/2/onClick/0/refresh'],
    ]);
  });

  it('the unknown ones are those the screen does not declare; the data sources themselves are not references', () => {
    expect(unknownSourceReferences(screen).map((r) => r.name)).toEqual(['statuses', 'people', 'words', 'checkQuery', 'files', 'customFields', 'members', 'comments', 'people']);
    expect(unknownSourceReferences({ components: [{ type: 'table', source: 'x' }] }).map((r) => r.name)).toEqual(['x']);
    expect(unknownSourceReferences(null)).toEqual([]);
  });
});
