import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('window with components (view step)', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.textContent = '')));

  const button = (view: Record<string, unknown> = {}): NodeDefinition => ({
    type: 'button',
    label: 'Show workflow',
    onClick: [
      { set: { path: 'state.key', value: 'WEB-4' } },
      {
        view: {
          title: '<b>Workflow</b> of {{ state.key }}',
          size: 'large',
          components: [
            { type: 'text', text: 'Statuses: {{ size(data.statuses) }}' },
            { type: 'button', label: 'Inner', onClick: [{ toast: 'inner {{ state.key }}' }] },
          ],
          ...view,
        },
      },
      { toast: 'closed' },
    ],
  } as NodeDefinition);
  const dataSources = { statuses: { type: 'rest' as const, method: 'GET' as const, url: '/api/statuses' } };
  const respond = () => [{ id: 'open' }, { id: 'done' }];
  const dialog = (): HTMLElement | null => [...document.querySelectorAll<HTMLElement>('.lc-view-dialog .ant-modal')].at(-1) ?? null;
  const dialogButton = (text: string): HTMLButtonElement => [...dialog()!.querySelectorAll('button')].find((b) => plain(b.textContent) === text) as HTMLButtonElement;
  const open = async (h: ScreenHarness): Promise<HTMLButtonElement> => {
    const opener = [...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Show workflow')) as HTMLButtonElement;
    opener.focus();
    opener.click();
    await h.until(() => plain(dialog()?.querySelector('lc-node')?.textContent) === 'Statuses: 2', 'window open');
    return opener;
  };

  it('shows the title as text and the components with the data and state of the screen; Close lets the sequence go on', async () => {
    const h = await renderScreen({ components: [button()], dataSources, respond });
    const opener = await open(h);
    expect(plain(dialog()!.querySelector('h2')?.textContent)).toBe('<b>Workflow</b> of WEB-4');
    expect(dialog()!.querySelector('h2 b')).toBeNull();
    expect(dialog()!.closest('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe(dialog()!.querySelector('h2')?.id);
    expect(dialog()!.style.width).toBe('960px');
    dialogButton('Inner').click();
    await h.until(() => h.toasts.length === 1, 'inner button');
    expect(h.toasts).toEqual(['inner WEB-4']);
    dialogButton('Close').click();
    await h.until(() => h.toasts.length === 2, 'sequence goes on');
    expect(h.toasts).toEqual(['inner WEB-4', 'closed']);
    await h.until(() => document.activeElement === opener, 'focus back');
    expect(h.reports).toEqual([]);
  });

  it('a close label of its own and the medium size by default', async () => {
    const h = await renderScreen({ components: [button({ size: undefined, closeLabel: 'Back' })], dataSources, respond });
    await open(h);
    expect(dialog()!.style.width).toBe('720px');
    dialogButton('Back').click();
    await h.until(() => h.toasts.includes('closed'), 'closed');
  });
});
