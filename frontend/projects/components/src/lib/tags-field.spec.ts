import { onTestFinished } from 'vitest';
import type { DataRequest } from 'core';
import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { openSelect, stubViewportHeight } from './select-testing';
import { tagsOf } from './tags-field.component';

describe('tags field', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('tags: trimmed, empty ones left out, each once without regard to case', () => {
    expect(tagsOf([' bug ', 'UI', '', 'Bug', 'ui', 3, null, { a: 1 }])).toEqual(['bug', 'UI', '3']);
    expect(tagsOf('bug')).toEqual([]);
    expect(tagsOf(null)).toEqual([]);
  });

  const form = (field: Record<string, unknown> = {}, initial: Record<string, unknown> = { labels: ['bug'] }): NodeDefinition =>
    ({
      type: 'form',
      initial,
      fields: [{ name: 'labels', type: 'tags', label: 'Labels', options: ['bug', 'feature', 'ui'], ...field }],
      actions: [{ label: 'Save', onClick: [{ call: 'save' }] }],
    }) as NodeDefinition;
  const dataSources = {
    save: { type: 'rest' as const, method: 'POST' as const, url: '/api/save', body: '{{form}}' },
    labels: { type: 'rest' as const, method: 'GET' as const, url: '/api/labels', params: { q: '{{ search }}' } },
  };
  const respond = (r: DataRequest) => {
    if (r.url !== '/api/labels') return {};
    const q = String(r.query?.['q'] ?? '').toLowerCase();
    return [{ name: 'backend' }, { name: 'backlog' }, { name: 'docs' }].filter((l) => !q || l.name.startsWith(q));
  };
  const box = (h: ScreenHarness) => h.el.querySelector('nz-select input') as HTMLInputElement;
  const type = async (h: ScreenHarness, text: string): Promise<void> => {
    box(h).value = text;
    box(h).dispatchEvent(new Event('input', { bubbles: true }));
    await h.settle();
  };
  const shown = (h: ScreenHarness) => [...h.el.querySelectorAll('nz-select .ant-select-selection-item-content')].map((t) => plain(t.textContent));
  const save = (h: ScreenHarness): void => ([...h.el.querySelectorAll('button')].find((b) => plain(b.textContent) === 'Save') as HTMLButtonElement).click();

  it('a comma adds what was typed, as free texts; the tags reach the service as a list', async () => {
    const h = await renderScreen({ components: [form()], dataSources, respond });
    expect(shown(h)).toEqual(['bug']);
    expect(box(h).id).toBe(h.el.querySelector('label')?.getAttribute('for'));
    await type(h, 'needs review, Bug,');
    expect(shown(h)).toEqual(['bug', 'needs review']);
    save(h);
    await h.until(() => h.requests.some((r) => r.method === 'POST'), 'saving');
    expect(h.requests.find((r) => r.method === 'POST')?.body).toEqual({ labels: ['bug', 'needs review'] });
    expect(h.reports).toEqual([]);
  });

  it('options are suggestions: choosing one adds it', async () => {
    const h = await renderScreen({ components: [form()], dataSources, respond });
    const options = await openSelect(h.el.querySelector('nz-select')!, () => h.settle());
    expect(options.map((o) => plain(o.textContent))).toEqual(['bug', 'feature', 'ui']);
    options.find((o) => plain(o.textContent) === 'ui')!.click();
    await h.settle();
    expect(shown(h)).toEqual(['bug', 'ui']);
  });

  it('suggest: the data source is asked with what was typed', async () => {
    // The menu scrolls to the option being typed, and jsdom has no scrolling.
    const proto = HTMLElement.prototype as { scrollTo?: unknown };
    const original = proto.scrollTo;
    proto.scrollTo = () => undefined;
    onTestFinished(() => {
      proto.scrollTo = original;
    });
    const h = await renderScreen({ components: [form({ options: ['bug', 'backport'], suggest: { source: 'labels', valueField: 'name' } })], dataSources, respond });
    await openSelect(h.el.querySelector('nz-select')!, () => h.settle());
    await type(h, 'bac');
    await h.until(() => h.requests.some((r) => r.url === '/api/labels' && r.query?.['q'] === 'bac'), 'suggestions asked');
    await h.until(() => document.body.querySelectorAll('.ant-select-item-option').length === 5, 'suggestions');
    const texts = [...document.body.querySelectorAll('.ant-select-item-option')].map((o) => plain(o.textContent));
    // What was typed (a new tag), the options of the field that contain it, then the rows of the data source.
    // The tags already chosen stay at the end of the menu, ticked (NG-ZORRO).
    expect(texts).toEqual(['bac', 'backport', 'backend', 'backlog', 'bug']);
    expect(h.reports).toEqual([]);
  });

  it('required, minItems and maxItems check the list', async () => {
    const h = await renderScreen({ components: [form({ required: true, minItems: 2 }, { labels: [] })], dataSources, respond });
    save(h);
    await h.settle();
    expect(h.el.querySelectorAll('.ant-form-item-explain-error').length).toBe(1);
    await type(h, 'one,');
    save(h);
    await h.settle();
    expect(plain(h.el.querySelector('.ant-form-item-explain-error')?.textContent)).toContain('2');
    await type(h, 'two,');
    save(h);
    await h.until(() => h.requests.some((r) => r.method === 'POST'), 'saving');
    expect(h.requests.find((r) => r.method === 'POST')?.body).toEqual({ labels: ['one', 'two'] });
  });

  it('in the filter bar no tag means no filter', async () => {
    const h = await renderScreen({
      components: [{ type: 'filterBar', bind: 'state.filters', fields: [{ name: 'labels', type: 'tags', label: 'Labels' }] }],
      dataSources: { data: { type: 'rest', method: 'GET', url: '/api/data', params: { labels: '{{ state.filters.labels }}' } } },
      respond: () => [],
    });
    await type(h, 'bug,');
    await h.until(() => JSON.stringify(h.requests.at(-1)?.query) === JSON.stringify({ labels: ['bug'] }), 'filtered');
    (h.el.querySelector('nz-select .ant-select-selection-item-remove') as HTMLElement).click();
    await h.until(() => JSON.stringify(h.requests.at(-1)?.query) === '{}', 'no filter');
  });
});
