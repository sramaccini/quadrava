import { inlineDataSource, isDataSourceReference, referencedDocuments, resolveDataSources } from './data-sources';
import type { DataSourcesDefinition, ScreenDefinition } from './types';
import { validateDataSources, validateProject, validateScreen } from 'schema/validation';

const orders: DataSourcesDefinition = {
  schemaVersion: '1.0',
  datasources: 'orders',
  sources: {
    list: { type: 'rest', method: 'GET', url: '/api/orders', params: { status: 'open', size: 20 } },
    approve: { type: 'rest', method: 'POST', url: '/api/orders/{{ row.id }}/approve' },
  },
};

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'orders',
  dataSources: {
    list: { ref: 'orders/list', params: { status: '{{ state.status }}' } },
    approve: { ref: 'orders/approve', body: '{{ form }}' },
    local: { type: 'rest', method: 'GET', url: '/api/local' },
  },
  components: [],
};

describe('data sources of the project', () => {
  it('a data sources document and a screen with references are valid; malformed references are not', () => {
    expect(validateDataSources(orders).valid).toBe(true);
    expect(validateScreen(screen).valid).toBe(true);
    const bad = validateScreen({ ...screen, dataSources: { list: { ref: 'Orders list', url: '/x' } } });
    expect(bad.valid ? [] : bad.issues.map((i) => i.path)).toContain('/dataSources/list/ref');
    // Without ref the entry is a full definition, checked as before.
    const inline = validateScreen({ ...screen, dataSources: { list: { url: '/api' } } });
    expect(inline.valid).toBe(false);
    expect(validateDataSources({ schemaVersion: '1.0', datasources: 'orders', sources: {} }).valid).toBe(false);
    expect(validateDataSources({ ...orders, sources: { list: { ref: 'other/list' } } }).valid).toBe(false);
  });

  it('tells references from definitions and lists the documents referred to', () => {
    expect(isDataSourceReference(screen.dataSources!['list'])).toBe(true);
    expect(inlineDataSource(screen.dataSources!['list'])).toBeUndefined();
    expect(inlineDataSource(screen.dataSources!['local'])?.url).toBe('/api/local');
    expect(referencedDocuments(screen)).toEqual(['orders']);
  });

  it('replaces every reference with the definition, merging params and replacing body', () => {
    const { screen: resolved, issues } = resolveDataSources(screen, { orders });
    expect(issues).toEqual([]);
    expect(resolved.dataSources).toEqual({
      list: { type: 'rest', method: 'GET', url: '/api/orders', params: { status: '{{ state.status }}', size: 20 } },
      approve: { type: 'rest', method: 'POST', url: '/api/orders/{{ row.id }}/approve', body: '{{ form }}' },
      local: { type: 'rest', method: 'GET', url: '/api/local' },
    });
    // The resolved screen is still a valid screen; the original is untouched.
    expect(validateScreen(resolved).valid).toBe(true);
    expect(screen.dataSources!['list']).toEqual({ ref: 'orders/list', params: { status: '{{ state.status }}' } });
  });

  it('a reference that does not resolve is left out with a problem (fail-closed)', () => {
    const { screen: resolved, issues } = resolveDataSources(
      { ...screen, dataSources: { list: { ref: 'orders/missing' }, other: { ref: 'customers/list' } } },
      { orders },
    );
    expect(resolved.dataSources).toEqual({});
    expect(issues).toEqual([
      { path: '/dataSources/list/ref', message: 'data source «missing» not found in «orders»' },
      { path: '/dataSources/other/ref', message: 'data sources document «customers» not found' },
    ]);
  });
});

describe('project manifest', () => {
  it('the demo manifest is valid; identifier and languages are checked', () => {
    const manifest = { schemaVersion: '1.0', project: 'demo', name: 'Demo', languages: ['en', 'it'], defaultLanguage: 'en', themes: ['light'] };
    expect(validateProject(manifest).valid).toBe(true);
    expect(validateProject({ ...manifest, project: 'Demo app' }).valid).toBe(false);
    expect(validateProject({ ...manifest, languages: [] }).valid).toBe(false);
    expect(validateProject({ ...manifest, languages: ['en', 'en'] }).valid).toBe(false);
  });
});
