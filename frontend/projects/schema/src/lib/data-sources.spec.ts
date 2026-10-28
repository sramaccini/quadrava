import { inlineDataSource, isDataSourceReference, joinUrl, referencedDocuments, resolveDataSources } from './data-sources';
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
    const { local: _, ...references } = screen.dataSources!;
    expect(validateScreen({ ...screen, dataSources: references }).valid).toBe(true);
    const bad = validateScreen({ ...screen, dataSources: { list: { ref: 'Orders list', url: '/x' } } });
    expect(bad.valid ? [] : bad.issues.map((i) => i.path)).toContain('/dataSources/list/ref');
    // A screen only refers to data sources: a definition written in it is not accepted.
    const inline = validateScreen({ ...screen, dataSources: { list: { type: 'rest', method: 'GET', url: '/api' } } });
    expect(inline.valid ? [] : inline.issues.map((i) => i.message)).toContain('missing required property: ref');
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
    // The original is untouched.
    expect(screen.dataSources!['list']).toEqual({ ref: 'orders/list', params: { status: '{{ state.status }}' } });
  });

  it('the base address of the document goes in front of the url of its data sources, with a single slash', () => {
    expect(joinUrl(undefined, '/api/x')).toBe('/api/x');
    expect(joinUrl('/api/orders/', '/{{ params.id }}')).toBe('/api/orders/{{ params.id }}');
    expect(joinUrl('{{ settings.ordersApi }}', 'open')).toBe('{{ settings.ordersApi }}/open');
    expect(joinUrl('/api/orders', '')).toBe('/api/orders');
    const based = { ...orders, baseUrl: '{{ settings.ordersApi }}', sources: { get: { type: 'rest' as const, method: 'GET' as const, url: '/{{ params.id }}' } } };
    expect(validateDataSources(based).valid).toBe(true);
    const { screen: resolved } = resolveDataSources({ schemaVersion: '1.0', screen: 's', dataSources: { order: { ref: 'orders/get' } }, components: [] }, { orders: based });
    expect(resolved.dataSources!['order']).toMatchObject({ url: '{{ settings.ordersApi }}/{{ params.id }}' });
  });

  it('the settings of a project: names and text values only', () => {
    const project = { schemaVersion: '1.0', project: 'demo', name: 'Demo', languages: ['en'], defaultLanguage: 'en' };
    expect(validateProject({ ...project, settings: { ordersApi: '/api/orders' } }).valid).toBe(true);
    expect(validateProject({ ...project, settings: { ordersApi: 3 } }).valid).toBe(false);
    expect(validateProject({ ...project, settings: { 'orders-api': '/x' } }).valid).toBe(false);
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
