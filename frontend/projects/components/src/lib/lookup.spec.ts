import type { DataRequest } from 'core';
import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { openSelect, stubViewportHeight } from './select-testing';

describe('lookup field', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  const clients = [
    { id: 1, name: 'Smith Ltd' },
    { id: 2, name: 'Smithson Inc' },
    { id: 3, name: 'White Inc' },
  ];
  const form: NodeDefinition = {
    type: 'form',
    fields: [{ name: 'customer', type: 'lookup', label: 'Customer', required: true, lookup: { source: 'customers', labelField: 'name', minChars: 2 } }],
    actions: [{ label: 'Save', onClick: [{ call: 'save' }] }],
  };
  const dataSources = {
    customers: { type: 'rest' as const, method: 'GET' as const, url: '/api/customers', params: { q: '{{ search }}' } },
    save: { type: 'rest' as const, method: 'POST' as const, url: '/api/save', body: '{{form}}' },
  };
  /** Responds filtering by `q`; the searches listed in `slow` arrive late. */
  const respondWith = (slow: string[] = []) => async (r: DataRequest) => {
    const q = String(r.query?.['q'] ?? '').toLowerCase();
    if (slow.includes(q)) await new Promise((res) => setTimeout(res, 600));
    return r.method === 'GET' ? clients.filter((c) => c.name.toLowerCase().includes(q)) : {};
  };
  const options = (): string[] => [...document.querySelectorAll('.ant-select-item-option')].map((o) => plain(o.textContent));
  const typeSearch = (h: ScreenHarness, text: string): void => {
    const input = h.el.querySelector('lc-lookup input.ant-select-selection-search-input') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };

  it('offers the loaded rows, searches after a pause and saves the value of the chosen row', async () => {
    const h = await renderScreen({ components: [form], dataSources, respond: respondWith() });
    // The automatic load has no text: `search` is null and does not become a parameter.
    expect(h.requests[0].query).toEqual({});
    expect(h.reports).toEqual([]);
    await openSelect(h.el.querySelector('lc-lookup nz-select')!, () => h.settle());
    await h.until(() => options().length === 3, 'initial rows');
    typeSearch(h, 's');
    await new Promise((r) => setTimeout(r, 400));
    // A single character: below the threshold, no request.
    expect(h.requests.filter((r) => r.query?.['q'])).toEqual([]);
    typeSearch(h, 'sm');
    typeSearch(h, 'smi');
    await h.until(() => options().length === 2, 'search results');
    expect(options()).toEqual(['Smith Ltd', 'Smithson Inc']);
    // Keystrokes close together become a single request.
    expect(h.requests.filter((r) => r.query?.['q']).map((r) => r.query?.['q'])).toEqual(['smi']);
    (document.querySelectorAll('.ant-select-item-option')[1] as HTMLElement).click();
    await h.settle();
    expect(plain(h.el.querySelector('lc-lookup .ant-select-selection-item')?.textContent)).toBe('Smithson Inc');
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Save')) as HTMLButtonElement).click();
    await h.until(() => h.requests.some((r) => r.method === 'POST'), 'saving');
    expect(h.requests.find((r) => r.method === 'POST')?.body).toEqual({ customer: 2 });
  });

  it('an older response does not overwrite the one of the last search', async () => {
    const h = await renderScreen({ components: [form], dataSources, respond: respondWith(['sm']) });
    await openSelect(h.el.querySelector('lc-lookup nz-select')!, () => h.settle());
    typeSearch(h, 'sm');
    await new Promise((r) => setTimeout(r, 350));
    typeSearch(h, 'wh');
    await h.until(() => options().length === 1, 'result for «wh»');
    await new Promise((r) => setTimeout(r, 700));
    await h.settle();
    expect(options()).toEqual(['White Inc']);
  });

  it('an initial value not among the loaded rows shows its text, asked of the service with lookupKey', async () => {
    const many = [...clients, { id: 42, name: 'Zeta Logistics' }];
    const h = await renderScreen({
      components: [{ ...form, initial: { customer: 42 } } as NodeDefinition],
      dataSources: {
        ...dataSources,
        customers: { type: 'rest', method: 'GET', url: '/api/customers', params: { q: '{{ search }}', id: '{{ lookupKey }}' } },
      },
      // Without filters the service returns only the first rows: customer 42 is not there.
      respond: (r) => {
        if (r.query?.['id'] !== undefined) return many.filter((c) => c.id === r.query?.['id']);
        return clients;
      },
    });
    await h.until(() => plain(h.el.querySelector('lc-lookup .ant-select-selection-item')?.textContent) === 'Zeta Logistics', 'text of the value');
    // A single request per key, and the rows of the data source for the other components do not change.
    expect(h.requests.filter((r) => r.query?.['id'] === 42)).toHaveLength(1);
    expect(h.requests[0].query).toEqual({});
  });
});
