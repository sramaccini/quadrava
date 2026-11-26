import type { DataSourceState } from 'core';
import type { MenuItemDefinition, NodeDefinition } from 'schema';
import { menuEntries, toneOf, type MenuEnvironment } from './menu-entries';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('menu entries', () => {
  const env = (sources: Record<string, DataSourceState>): MenuEnvironment => ({
    text: (t) => t ?? '',
    isVisible: (item) => item.visibleIf !== 'no',
    isEnabled: (item, scope) => item.enabledIf !== 'no' && (scope['item'] as { blocked?: boolean } | undefined)?.blocked !== true,
    source: (name) => sources[name] ?? { status: 'idle', data: null },
    translate: (key, fallback) => (key === 'values.status.done' ? 'Done' : fallback),
  });
  const items: MenuItemDefinition[] = [
    { source: 'moves', labelField: 'name', badgeField: 'to', toneField: 'category', tones: { done: 'success' }, valueKey: 'values.status', onClick: [{ toast: '{{ item.id }}' }] },
    { divider: true },
    { label: 'View workflow', onClick: [{ toast: 'view' }] },
  ];

  it('gives one item per row with its badge, tone and row in the scope, then the fixed items', () => {
    const entries = menuEntries(items, env({ moves: { status: 'ready', data: [{ id: 't1', name: 'Close', to: 'done', category: 'done' }, { id: 't2', name: 'Reopen', to: 'open', category: 'new', blocked: true }] } }), { row: { id: 1 } });
    expect(entries.map((e) => e.kind === 'item' ? [e.label, e.badge, e.tone, e.disabled] : e.kind)).toEqual([
      ['Close', 'Done', 'success', false],
      ['Reopen', 'open', 'neutral', true],
      'divider',
      ['View workflow', undefined, 'neutral', false],
    ]);
    const first = entries[0];
    expect(first.kind === 'item' && first.scope).toEqual({ row: { id: 1 }, item: { id: 't1', name: 'Close', to: 'done', category: 'done' } });
  });

  it('an empty data source leaves no stray divider, and hidden fixed items are left out', () => {
    const entries = menuEntries([...items, { divider: true }, { label: 'Hidden', visibleIf: 'no', onClick: [{ toast: 'x' }] }], env({ moves: { status: 'ready', data: [] } }), {});
    expect(entries.map((e) => (e.kind === 'item' ? e.label : e.kind))).toEqual(['View workflow']);
  });

  it('a data source that is loading gives the indicator; the rows of a paged answer are read from items', () => {
    expect(menuEntries(items, env({ moves: { status: 'loading', data: null } }), {}).map((e) => e.kind)).toEqual(['loading', 'divider', 'item']);
    expect(menuEntries(items, env({ moves: { status: 'ready', data: { items: [{ id: 'a', name: 'Start' }] } } }), {}).map((e) => (e.kind === 'item' ? e.label : e.kind))).toEqual(['Start', 'divider', 'View workflow']);
  });

  it('a tone that is not one of the theme is neutral', () => {
    expect(['primary', 'success', 'danger', 'neutral', 'purple', '{{ oops }}', undefined].map(toneOf)).toEqual(['primary', 'success', 'danger', 'neutral', 'neutral', 'neutral', 'neutral']);
  });
});

describe('menu button', () => {
  const node = (extra: Record<string, unknown> = {}): NodeDefinition => ({
    type: 'menuButton',
    label: '{{ data.issue.status }}',
    tone: "{{ data.issue.category == 'done' ? 'success' : 'primary' }}",
    items: [
      { source: 'moves', labelField: 'name', badgeField: 'to', onClick: [{ toast: 'moved {{ item.id }}' }] },
      { divider: true },
      { label: 'View workflow', onClick: [{ toast: 'workflow' }] },
    ],
    ...extra,
  } as NodeDefinition);
  const dataSources = {
    issue: { type: 'rest' as const, method: 'GET' as const, url: '/api/issue' },
    moves: { type: 'rest' as const, method: 'GET' as const, url: '/api/moves' },
  };
  const respond = (moves: unknown[]) => (r: { url: string }) => (r.url.endsWith('/issue') ? { status: 'In progress', category: 'doing' } : moves);
  const button = (h: ScreenHarness): HTMLButtonElement => h.el.querySelector('lc-menu-button button')!;
  const items = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.ant-dropdown li[role="menuitem"]')];

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.textContent = '')));

  it('shows the label and tone from expressions and announces a menu', async () => {
    const h = await renderScreen({ components: [node()], dataSources, respond: respond([]) });
    await h.until(() => plain(button(h).textContent) === 'In progress', 'label');
    expect(button(h).getAttribute('aria-haspopup')).toBe('menu');
    expect(button(h).getAttribute('aria-expanded')).toBe('false');
    expect(button(h).classList.contains('ant-btn-primary')).toBe(true);
    expect(h.reports).toEqual([]);
  });

  it('opens the menu with the items of the data source and the fixed ones; an item runs its steps with the row', async () => {
    const h = await renderScreen({ components: [node()], dataSources, respond: respond([{ id: 't1', name: 'Done', to: 'Closed' }]) });
    await h.until(() => plain(button(h).textContent) === 'In progress', 'label');
    button(h).click();
    await h.until(() => items().length === 2, 'menu open');
    await h.until(() => button(h).getAttribute('aria-expanded') === 'true', 'expanded');
    expect(items().map((i) => [plain(i.querySelector('.row > span')?.textContent), plain(i.querySelector('nz-tag')?.textContent ?? '')])).toEqual([['Done', 'Closed'], ['View workflow', '']]);
    expect(document.querySelectorAll('.ant-dropdown li[role="separator"]').length).toBe(1);
    await h.until(() => document.activeElement === items()[0], 'focus on the first item');
    items()[0].click();
    await h.until(() => h.toasts.length === 1, 'steps run');
    expect(h.toasts).toEqual(['moved t1']);
    expect(h.reports).toEqual([]);
  });

  it('with an empty data source the fixed items stay, without the divider', async () => {
    const h = await renderScreen({ components: [node()], dataSources, respond: respond([]) });
    await h.until(() => plain(button(h).textContent) === 'In progress', 'label');
    button(h).click();
    await h.until(() => items().length === 1, 'menu open');
    expect(items().map((i) => plain(i.textContent))).toEqual(['View workflow']);
    expect(document.querySelectorAll('.ant-dropdown li[role="separator"]').length).toBe(0);
  });

  it('arrows move among the items and Escape is left to the menu', async () => {
    const h = await renderScreen({ components: [node()], dataSources, respond: respond([{ id: 't1', name: 'Done' }, { id: 't2', name: 'Reject' }]) });
    await h.until(() => plain(button(h).textContent) === 'In progress', 'label');
    button(h).click();
    await h.until(() => items().length === 3 && document.activeElement === items()[0], 'menu open');
    const list = document.querySelector<HTMLElement>('.ant-dropdown ul[role="menu"]')!;
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items()[1]);
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(items()[2]);
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items()[0]);
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await h.until(() => h.toasts.length === 1, 'chosen with Enter');
    expect(h.toasts).toEqual(['moved t1']);
  });

  it('a menu with nothing to show says so', async () => {
    const h = await renderScreen({ components: [node({ items: [{ source: 'moves', labelField: 'name', onClick: [{ toast: 'x' }] }] })], dataSources, respond: respond([]) });
    await h.until(() => plain(button(h).textContent) === 'In progress', 'label');
    button(h).click();
    await h.until(() => plain(document.querySelector('.ant-dropdown ul')?.textContent) === 'Nothing to choose', 'empty menu');
  });
});
