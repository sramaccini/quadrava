import type { NodeDefinition, TableNode } from 'schema';
import { columnTexts, plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('row actions menu', () => {
  const rows = [{ id: 1, number: 'F-1', status: 'draft' }];
  const table = (extra: Partial<TableNode>): NodeDefinition => ({
    type: 'table',
    source: 'data',
    columns: [{ field: 'number', label: 'Number' }],
    rowActions: [
      { label: 'Open', onClick: [{ toast: 'opened {{row.number}}' }] },
      { label: 'Hidden', visibleIf: '{{false}}', onClick: [{ toast: 'never' }] },
      { label: 'Duplicate', onClick: [{ toast: 'duplicated' }] },
      { label: 'Delete', enabledIf: "{{row.status != 'draft'}}", onClick: [{ toast: 'deleted' }] },
    ],
    ...extra,
  } as NodeDefinition);
  const dataSources = { data: { type: 'rest' as const, method: 'GET' as const, url: '/api/data' } };
  const inlineButtons = (h: ScreenHarness): string[] => [...h.el.querySelectorAll('td .actions > span button')].map((b) => plain(b.textContent));
  const moreButton = (h: ScreenHarness): HTMLButtonElement | null => h.el.querySelector('td .actions button.more');
  const menuItems = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.ant-dropdown li.lc-row-action')];

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('without rowActionsInline all visible actions are buttons', async () => {
    const h = await renderScreen({ components: [table({})], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 1, 'rows');
    expect(inlineButtons(h)).toEqual(['Open', 'Duplicate', 'Delete']);
    expect(moreButton(h)).toBeNull();
  });

  it('with rowActionsInline: 1 the first is a button and the others are in the menu, with their enabled state', async () => {
    const h = await renderScreen({ components: [table({ rowActionsInline: 1 })], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 1, 'rows');
    expect(inlineButtons(h)).toEqual(['Open']);
    expect(moreButton(h)?.getAttribute('aria-label')).toBe('Altre azioni');
    moreButton(h)!.click();
    await h.until(() => menuItems().length === 2, 'menu open');
    expect(menuItems().map((i) => plain(i.textContent))).toEqual(['Duplicate', 'Delete']);
    expect(menuItems()[1].classList.contains('ant-dropdown-menu-item-disabled')).toBe(true);
    menuItems()[1].click();
    await h.settle();
    expect(h.toasts).toEqual([]);
    menuItems()[0].click();
    await h.until(() => h.toasts.length === 1, 'action from the menu');
    expect(h.toasts).toEqual(['duplicated']);
  });

  it('with rowActionsInline: 0 only the menu is left', async () => {
    const h = await renderScreen({ components: [table({ rowActionsInline: 0 })], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 1, 'rows');
    expect(inlineButtons(h)).toEqual([]);
    moreButton(h)!.click();
    await h.until(() => menuItems().length === 3, 'menu open');
    menuItems()[0].click();
    await h.until(() => h.toasts.length === 1, 'action from the menu');
    expect(h.toasts).toEqual(['opened F-1']);
  });
});
