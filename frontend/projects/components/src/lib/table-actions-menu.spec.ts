import type { NodeDefinition, TableNode } from 'schema';
import { columnTexts, plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('menu delle azioni di riga', () => {
  const rows = [{ id: 1, numero: 'F-1', stato: 'bozza' }];
  const table = (extra: Partial<TableNode>): NodeDefinition => ({
    type: 'table',
    source: 'dati',
    columns: [{ field: 'numero', label: 'Numero' }],
    rowActions: [
      { label: 'Apri', onClick: [{ toast: 'aperta {{row.numero}}' }] },
      { label: 'Nascosta', visibleIf: '{{false}}', onClick: [{ toast: 'mai' }] },
      { label: 'Duplica', onClick: [{ toast: 'duplicata' }] },
      { label: 'Elimina', enabledIf: "{{row.stato != 'bozza'}}", onClick: [{ toast: 'eliminata' }] },
    ],
    ...extra,
  } as NodeDefinition);
  const dataSources = { dati: { type: 'rest' as const, method: 'GET' as const, url: '/api/dati' } };
  const inlineButtons = (h: ScreenHarness): string[] => [...h.el.querySelectorAll('td .actions > span button')].map((b) => plain(b.textContent));
  const moreButton = (h: ScreenHarness): HTMLButtonElement | null => h.el.querySelector('td .actions button.more');
  const menuItems = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.ant-dropdown li.lc-row-action')];

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('senza rowActionsInline tutte le azioni visibili sono pulsanti', async () => {
    const h = await renderScreen({ components: [table({})], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 1, 'righe');
    expect(inlineButtons(h)).toEqual(['Apri', 'Duplica', 'Elimina']);
    expect(moreButton(h)).toBeNull();
  });

  it('con rowActionsInline: 1 la prima è un pulsante e le altre stanno nel menu, con lo stato abilitato', async () => {
    const h = await renderScreen({ components: [table({ rowActionsInline: 1 })], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 1, 'righe');
    expect(inlineButtons(h)).toEqual(['Apri']);
    expect(moreButton(h)?.getAttribute('aria-label')).toBe('Altre azioni');
    moreButton(h)!.click();
    await h.until(() => menuItems().length === 2, 'menu aperto');
    expect(menuItems().map((i) => plain(i.textContent))).toEqual(['Duplica', 'Elimina']);
    expect(menuItems()[1].classList.contains('ant-dropdown-menu-item-disabled')).toBe(true);
    menuItems()[1].click();
    await h.settle();
    expect(h.toasts).toEqual([]);
    menuItems()[0].click();
    await h.until(() => h.toasts.length === 1, 'azione dal menu');
    expect(h.toasts).toEqual(['duplicata']);
  });

  it('con rowActionsInline: 0 resta solo il menu', async () => {
    const h = await renderScreen({ components: [table({ rowActionsInline: 0 })], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 1, 'righe');
    expect(inlineButtons(h)).toEqual([]);
    moreButton(h)!.click();
    await h.until(() => menuItems().length === 3, 'menu aperto');
    menuItems()[0].click();
    await h.until(() => h.toasts.length === 1, 'azione dal menu');
    expect(h.toasts).toEqual(['aperta F-1']);
  });
});
