import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { highlight } from './tree.component';

describe('tree view', () => {
  it('highlights the searched parts regardless of case', () => {
    expect(highlight('Cards and carbon', 'CA')).toEqual([
      { text: 'Ca', match: true },
      { text: 'rds and ', match: false },
      { text: 'ca', match: true },
      { text: 'rbon', match: false },
    ]);
    expect(highlight('Hotel', '')).toEqual([{ text: 'Hotel', match: false }]);
  });

  const data = [
    { code: 'To', name: 'Purchases', children: [{ code: 'A1', name: 'Stationery <b>x</b>', children: [] }, { code: 'A2', name: 'IT' }] },
    { code: 'S', name: 'Services', children: [{ code: 'S1', name: 'Consulting', children: [{ code: 'S11', name: 'Legal' }] }] },
  ];
  const tree = (extra: Record<string, unknown> = {}): NodeDefinition =>
    ({
      type: 'tree',
      source: 'categories',
      keyField: 'code',
      labelField: 'name',
      childrenField: 'children',
      bind: 'state.category',
      searchable: true,
      onSelect: [{ toast: 'chosen {{ row.name }}' }],
      ...extra,
    }) as NodeDefinition;
  const dataSources = { categories: { type: 'rest' as const, method: 'GET' as const, url: '/api/categories' } };
  const titles = (h: ScreenHarness): string[] => [...h.el.querySelectorAll('lc-tree .title')].map((t) => plain(t.textContent));
  const title = (h: ScreenHarness, text: string): HTMLElement => [...h.el.querySelectorAll<HTMLElement>('lc-tree .title')].find((t) => plain(t.textContent) === text)!;

  it('opens the first level, writes the chosen key to the state and runs onSelect with the node', async () => {
    const h = await renderScreen({ components: [tree(), { type: 'text', text: 'Chosen: {{ state.category }}' }], dataSources, respond: () => data });
    await h.until(() => titles(h).length > 0, 'tree');
    // First level open: the roots and their children are visible, not the grandchildren.
    expect(titles(h)).toEqual(['Purchases', 'Stationery <b>x</b>', 'IT', 'Services', 'Consulting']);
    expect(h.el.querySelector('lc-tree .title b')).toBeNull();
    title(h, 'IT').click();
    await h.until(() => h.toasts.length === 1, 'chosen');
    expect(h.toasts).toEqual(['chosen IT']);
    expect(plain(h.el.querySelector('lc-text')?.textContent)).toBe('Chosen: A2');
    expect(h.el.querySelector('.ant-tree-node-selected')?.textContent).toContain('IT');
    // From the keyboard: Enter on the title.
    title(h, 'Consulting').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await h.until(() => h.toasts.length === 2, 'chosen from the keyboard');
    expect(plain(h.el.querySelector('lc-text')?.textContent)).toBe('Chosen: S1');
  });

  it('search highlights the text found; expandAll opens every branch', async () => {
    const h = await renderScreen({ components: [tree({ expandAll: true })], dataSources, respond: () => data });
    await h.until(() => titles(h).includes('Legal'), 'all branches open');
    const search = h.el.querySelector('lc-tree input[type="search"]') as HTMLInputElement;
    search.value = 'leg';
    search.dispatchEvent(new Event('input'));
    await h.settle();
    expect([...h.el.querySelectorAll('lc-tree mark')].map((m) => m.textContent)).toEqual(['Leg']);
    // No space added between the part found and the rest of the word.
    expect(h.el.querySelector('lc-tree mark')?.closest('.title')?.textContent?.trim()).toBe('Legal');
  });

  it('from the keyboard: arrows, Home and End move, right and left open and close, Enter chooses; Tab reaches a single node', async () => {
    const h = await renderScreen({ components: [tree()], dataSources, respond: () => data });
    await h.until(() => titles(h).length > 0, 'tree');
    const key = (k: string, el: HTMLElement): void => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    };
    const focused = (): string => plain((document.activeElement as HTMLElement | null)?.textContent);
    const tabbable = (): string[] => [...h.el.querySelectorAll<HTMLElement>('lc-tree .title[tabindex="0"]')].map((t) => plain(t.textContent));
    expect(h.el.querySelector('nz-tree')?.getAttribute('role')).toBe('tree');
    expect(tabbable()).toEqual(['Purchases']);
    const acquisti = title(h, 'Purchases');
    expect(acquisti.getAttribute('aria-expanded')).toBe('true');
    expect(acquisti.getAttribute('aria-level')).toBe('1');
    acquisti.focus();
    key('ArrowDown', acquisti);
    await h.settle();
    expect(focused()).toBe('Stationery <b>x</b>');
    expect(tabbable()).toEqual(['Stationery <b>x</b>']);
    key('ArrowLeft', document.activeElement as HTMLElement);
    await h.settle();
    expect(focused()).toBe('Purchases');
    // Left on an open branch closes it.
    key('ArrowLeft', title(h, 'Purchases'));
    await h.settle();
    expect(title(h, 'Purchases').getAttribute('aria-expanded')).toBe('false');
    expect(title(h, 'IT').getAttribute('data-shown')).toBe('false');
    // Right opens it again, then enters the first child.
    key('ArrowRight', title(h, 'Purchases'));
    await h.settle();
    expect(title(h, 'IT').getAttribute('data-shown')).toBe('true');
    key('ArrowRight', title(h, 'Purchases'));
    await h.settle();
    expect(focused()).toBe('Stationery <b>x</b>');
    key('End', document.activeElement as HTMLElement);
    await h.settle();
    expect(focused()).toBe('Consulting');
    // Consulting has closed children: right opens the branch and shows «Legal».
    key('ArrowRight', document.activeElement as HTMLElement);
    await h.settle();
    expect(titles(h)).toContain('Legal');
    key('Home', document.activeElement as HTMLElement);
    await h.settle();
    expect(focused()).toBe('Purchases');
    key(' ', document.activeElement as HTMLElement);
    await h.until(() => h.toasts.length === 1, 'chosen with the space bar');
    expect(h.toasts).toEqual(['chosen Purchases']);
    expect(title(h, 'Purchases').getAttribute('aria-selected')).toBe('true');
  });
});
