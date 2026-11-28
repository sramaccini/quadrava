import { ScreenDialog, ScreenDialogHost } from 'core';
import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { searchResults } from './search.component';

describe('search', () => {
  const dataSources = { find: { type: 'rest' as const, method: 'GET' as const, url: '/api/find', params: { q: '{{ search }}' } } };
  const found = [
    { id: 1, title: 'Login fails', key: 'ODT-1', kind: 'bug' },
    { id: 2, title: 'Logout button', key: 'ODT-2', kind: 'task' },
  ];
  const node: NodeDefinition = {
    type: 'search',
    source: 'find',
    label: 'Search issues',
    labelField: 'title',
    secondaryField: 'key',
    iconField: 'kind',
    onPick: [{ toast: "{{ 'open ' + row.key + ' after ' + search }}" }],
    onSubmit: [{ toast: "{{ 'all for ' + search }}" }],
  } as NodeDefinition;
  const box = (h: ScreenHarness): HTMLInputElement => h.el.querySelector('lc-search input')!;
  const type = (h: ScreenHarness, text: string): void => {
    box(h).value = text;
    box(h).dispatchEvent(new Event('input'));
  };
  const key = (h: ScreenHarness, k: string): void => void box(h).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const options = (h: ScreenHarness): string[] => [...h.el.querySelectorAll('lc-search [role=option]')].map((o) => plain(o.textContent));

  it('reads label, secondary text and icon from the fields named, leaving out rows without a label', () => {
    expect(searchResults({ items: [...found, { id: 3 }] }, { labelField: 'title', secondaryField: 'key' }).map((r) => [r.label, r.secondary, r.icon])).toEqual([
      ['Login fails', 'ODT-1', ''],
      ['Logout button', 'ODT-2', ''],
    ]);
  });

  it('asks the data source with the text after minChars; the arrows and Enter pick a result, with its row', async () => {
    const h = await renderScreen({ components: [node], dataSources, respond: () => found });
    expect(box(h).getAttribute('role')).toBe('combobox');
    expect(box(h).getAttribute('aria-label')).toBe('Search issues');
    type(h, 'l');
    await h.settle();
    expect(h.requests).toEqual([]);
    type(h, 'log');
    await h.until(() => options(h).length === 2, 'the results');
    expect(h.requests.map((r) => r.query)).toEqual([{ q: 'log' }]);
    expect(options(h)).toEqual(['Login failsODT-1', 'Logout buttonODT-2']);
    expect(box(h).getAttribute('aria-expanded')).toBe('true');
    key(h, 'ArrowDown');
    key(h, 'ArrowDown');
    await h.settle();
    expect(box(h).getAttribute('aria-activedescendant')).toBe(h.el.querySelectorAll('lc-search [role=option]')[1].id);
    key(h, 'Enter');
    await h.until(() => h.toasts.length === 1, 'the steps of the pick');
    expect(h.toasts).toEqual(['open ODT-2 after log']);
    expect(options(h)).toEqual([]);
    expect(box(h).value).toBe('');
    expect(h.reports).toEqual([]);
  });

  it('Enter with no result chosen runs onSubmit with the text; Escape closes the list, then empties the box', async () => {
    const h = await renderScreen({ components: [node], dataSources, respond: () => [] });
    type(h, 'nothing');
    await h.until(() => plain(h.el.querySelector('lc-search .none')?.textContent) === 'No results.', 'no results');
    key(h, 'Escape');
    await h.settle();
    expect(h.el.querySelector('lc-search .panel')).toBeNull();
    key(h, 'Enter');
    await h.until(() => h.toasts.length === 1, 'the steps of the text');
    expect(h.toasts).toEqual(['all for nothing']);
  });
});

describe('openScreen and close', () => {
  it('openScreen asks for the screen with its parameters; the sequence goes on only when the screen closes as done', async () => {
    const opened: unknown[] = [];
    let answer = true;
    const dialog = { open: async (request: unknown) => (opened.push(request), answer) };
    const button: NodeDefinition = {
      type: 'button',
      label: 'Create',
      onClick: [{ openScreen: 'issue-create', params: { project: "{{ 'ODT' }}" }, size: 'large' }, { toast: 'created' }],
    };
    const h = await renderScreen({ components: [button], extraProviders: [{ provide: ScreenDialog, useValue: dialog }] });
    const click = (): void => [...h.el.querySelectorAll('button')].find((b) => plain(b.textContent) === 'Create')!.click();
    click();
    await h.until(() => h.toasts.length === 1, 'after the window');
    expect(opened).toEqual([{ screen: 'issue-create', params: { project: 'ODT' }, size: 'large' }]);
    answer = false;
    click();
    await h.until(() => opened.length === 2, 'the second window');
    await h.settle();
    expect(h.toasts).toEqual(['created']);
  });

  it('close closes the window the screen is in; outside one it is reported', async () => {
    let closed = 0;
    const host = { close: () => closed++ };
    const button: NodeDefinition = { type: 'button', label: 'Done', onClick: [{ close: true }, { toast: 'after' }] };
    const inside = await renderScreen({ components: [button], extraProviders: [{ provide: ScreenDialogHost, useValue: host }] });
    [...inside.el.querySelectorAll('button')].find((b) => plain(b.textContent) === 'Done')!.click();
    await inside.until(() => inside.toasts.length === 1, 'the steps after it');
    expect(closed).toBe(1);
    expect(inside.reports).toEqual([]);
  });

  it('close in a screen not in a window is reported and stops the sequence', async () => {
    const button: NodeDefinition = { type: 'button', label: 'Done', onClick: [{ close: true }, { toast: 'after' }] };
    const h = await renderScreen({ components: [button] });
    [...h.el.querySelectorAll('button')].find((b) => plain(b.textContent) === 'Done')!.click();
    await h.until(() => h.reports.length === 1, 'the report');
    expect(h.reports[0].source).toBe('close');
    expect(h.toasts).toEqual([]);
  });
});
