import type { ScreenDefinition } from 'schema';
import { loadDataSources } from './data-source-loading';
import { DefinitionSource } from './ports';

class FakeDefinitions extends DefinitionSource {
  readonly asked: string[] = [];
  constructor(private readonly documents: Record<string, unknown>) {
    super();
  }
  screen(): Promise<unknown> {
    return Promise.reject(new Error('not used'));
  }
  async dataSources(id: string): Promise<unknown> {
    this.asked.push(id);
    if (!(id in this.documents)) throw Object.assign(new Error('HTTP 404'), { status: 404 });
    return this.documents[id];
  }
  navigation(): Promise<unknown> {
    return Promise.reject(new Error('not used'));
  }
  theme(): Promise<unknown> {
    return Promise.reject(new Error('not used'));
  }
  themes(): string[] {
    return [];
  }
  messages(): Promise<unknown> {
    return Promise.reject(new Error('not used'));
  }
}

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'orders',
  dataSources: { list: { ref: 'orders/list' }, approve: { ref: 'orders/approve' }, other: { ref: 'broken/list' }, gone: { ref: 'missing/list' } },
  components: [],
};

describe('loadDataSources', () => {
  it('loads every document once, validates it and resolves the references; the others are left out with a problem', async () => {
    const source = new FakeDefinitions({
      orders: {
        schemaVersion: '1.0',
        datasources: 'orders',
        sources: { list: { type: 'rest', method: 'GET', url: '/api/orders' }, approve: { type: 'rest', method: 'POST', url: '/api/orders/{{id}}/approve' } },
      },
      broken: { schemaVersion: '1.0', datasources: 'broken', sources: { list: { url: '/api' } } },
    });
    const { screen: resolved, issues } = await loadDataSources(screen, source);
    expect(source.asked.sort()).toEqual(['broken', 'missing', 'orders']);
    expect(Object.keys(resolved.dataSources ?? {})).toEqual(['list', 'approve']);
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(['datasources/broken', 'datasources/missing', '/dataSources/other/ref', '/dataSources/gone/ref']));
    expect(issues.find((i) => i.path === 'datasources/missing')?.message).toBe('HTTP 404');
  });

  it('a screen without references is returned as it is, without loading anything', async () => {
    const source = new FakeDefinitions({});
    const plain: ScreenDefinition = { schemaVersion: '1.0', screen: 'a', dataSources: { list: { type: 'rest', method: 'GET', url: '/api' } }, components: [] };
    expect((await loadDataSources(plain, source)).screen).toBe(plain);
    expect(source.asked).toEqual([]);
  });
});
