import type { NodeDefinition } from 'schema';
import { buttonFace, type FaceRuntime } from './button-face';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('button face', () => {
  const runtime: FaceRuntime = {
    text: (t) => (t === '{{ bad }}' ? '{{ bad }}' : (t ?? '').replace('{{ n }}', '2')),
    isEnabled: (node) => node.enabledIf === '{{ true }}',
  };

  it('icon only needs an icon; the count goes after the text in the name; a toggle is pressed or not', () => {
    expect(buttonFace({ label: 'Watchers', icon: 'eye', display: 'icon', count: '{{ n }}', pressed: '{{ true }}' }, runtime, {})).toEqual({
      text: 'Watchers', count: '2', name: 'Watchers: 2', iconOnly: true, pressed: true, tone: null,
    });
    expect(buttonFace({ label: 'More', display: 'icon' }, runtime, {})).toMatchObject({ iconOnly: false, pressed: null, count: null, name: 'More' });
    expect(buttonFace({ label: 'Watch', pressed: '{{ oops }}' }, runtime, {}).pressed).toBe(false);
  });

  it('a tone is resolved; any other value is neutral, none is null', () => {
    expect(['danger', 'success', 'red', undefined].map((tone) => buttonFace({ label: 'A', tone }, runtime, {}).tone)).toEqual(['danger', 'success', 'neutral', null]);
  });

  it('a count that is empty, failed or not a number is not shown; numbers are formatted', () => {
    expect(['', '  ', '{{ bad }}', 'many'].map((count) => buttonFace({ label: 'A', count }, runtime, {}).count)).toEqual([null, null, null, null]);
    expect(buttonFace({ label: 'A', count: '1200' }, runtime, {}, (n) => n.toLocaleString('en-GB')).count).toBe('1,200');
  });
});

describe('icon buttons, counts and pressed state', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.textContent = '')));
  const set = (watching: boolean) => ({ set: { path: 'state.watching', value: watching } });

  it('an icon button shows only its icon and the count; the text is its name; pressed follows the expression', async () => {
    const node: NodeDefinition = {
      type: 'button',
      label: 'Watchers',
      icon: 'eye',
      display: 'icon',
      count: '{{ size(data.watchers) }}',
      pressed: '{{ has(state.watching) && state.watching }}',
      onClick: [set(true)],
    } as NodeDefinition;
    const h = await renderScreen({ components: [node], dataSources: { watchers: { type: 'rest', method: 'GET', url: '/api/watchers' } }, respond: () => [{ id: 1 }, { id: 2 }] });
    const button = (): HTMLButtonElement => h.el.querySelector('lc-button button')!;
    await h.until(() => plain(button().textContent) === '2', 'count');
    expect(button().getAttribute('aria-label')).toBe('Watchers: 2');
    expect(button().querySelector('lc-icon')).not.toBeNull();
    expect(button().classList.contains('ant-btn-primary')).toBe(false);
    expect(button().getAttribute('aria-pressed')).toBe('false');
    button().click();
    await h.until(() => button().getAttribute('aria-pressed') === 'true', 'pressed');
    expect(button().classList.contains('pressed')).toBe(true);
    expect(h.reports).toEqual([]);
  });

  it('a pressed flag takes the colour of its tone and its icon is drawn filled', async () => {
    const node: NodeDefinition = {
      type: 'button',
      label: 'Flag',
      icon: 'flag',
      display: 'icon',
      tone: 'danger',
      pressed: '{{ has(state.flagged) && state.flagged }}',
      onClick: [{ set: { path: 'state.flagged', value: true } }],
    } as NodeDefinition;
    const h = await renderScreen({ components: [node] });
    const button = (): HTMLButtonElement => h.el.querySelector('lc-button button')!;
    const svg = (): string => button().querySelector('.anticon-flag svg')?.innerHTML ?? '';
    const outline = svg();
    expect(outline).not.toBe('');
    expect(button().classList.contains('toned')).toBe(false);
    expect(button().style.getPropertyValue('--lc-pressed')).toContain('--lc-text-error');
    button().click();
    await h.until(() => button().getAttribute('aria-pressed') === 'true', 'pressed');
    await h.until(() => svg() !== '' && svg() !== outline, 'filled icon');
    expect(h.reports).toEqual([]);
  });

  it('a tone fills a button that is not a toggle; an icon button without a tone is neutral', async () => {
    const h = await renderScreen({
      components: [
        { type: 'button', label: 'Delete', icon: 'delete', tone: 'danger', onClick: [{ toast: 'x' }] },
        { type: 'button', label: 'Like', icon: 'like', display: 'icon', onClick: [{ toast: 'x' }] },
      ],
    });
    const [del, like] = [...h.el.querySelectorAll<HTMLButtonElement>('lc-button button')];
    expect(del.classList.contains('toned')).toBe(true);
    expect(del.classList.contains('ant-btn-primary')).toBe(false);
    expect(del.style.getPropertyValue('--lc-button-tone')).toContain('--lc-color-danger');
    expect(like.classList.contains('toned')).toBe(false);
    expect(like.classList.contains('ant-btn-primary')).toBe(false);
    expect(like.querySelector('.anticon-like')).not.toBeNull();
  });

  it('a button with text keeps it, without aria-label or aria-pressed when it is not a toggle', async () => {
    const h = await renderScreen({ components: [{ type: 'button', label: 'Save', icon: 'save', onClick: [{ toast: 'x' }] }] });
    const button = h.el.querySelector('lc-button button')!;
    expect(plain(button.textContent)).toBe('Save');
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(button.hasAttribute('aria-pressed')).toBe(false);
    expect(button.classList.contains('ant-btn-primary')).toBe(true);
  });

  it('an icon menu button has no arrow, its text is the name of the button and of the menu; a fixed item can be danger', async () => {
    const node: NodeDefinition = {
      type: 'menuButton',
      label: 'More actions',
      icon: 'more',
      display: 'icon',
      items: [
        { label: 'Clone', onClick: [{ toast: 'clone' }] },
        { divider: true },
        { label: 'Delete', icon: 'delete', tone: 'danger', onClick: [{ toast: 'delete' }] },
      ],
    } as NodeDefinition;
    const h: ScreenHarness = await renderScreen({ components: [node] });
    const button = h.el.querySelector<HTMLButtonElement>('lc-menu-button button')!;
    expect(plain(button.textContent)).toBe('');
    expect(button.getAttribute('aria-label')).toBe('More actions');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect([...button.querySelectorAll('lc-icon .anticon')].map((i) => i.className.match(/anticon-([a-z-]+)/)?.[1])).toEqual(['ellipsis']);
    button.click();
    await h.until(() => document.querySelectorAll('.ant-dropdown li[role="menuitem"]').length === 2, 'menu open');
    expect(document.querySelector('.ant-dropdown ul[role="menu"]')?.getAttribute('aria-label')).toBe('More actions');
    const items = [...document.querySelectorAll('.ant-dropdown li[role="menuitem"]')];
    expect(items.map((i) => i.classList.contains('danger'))).toEqual([false, true]);
  });

  it('a menu button with a count and a pressed state, as the eye of the watchers', async () => {
    const node: NodeDefinition = {
      type: 'menuButton',
      label: 'Watchers',
      icon: 'eye',
      display: 'icon',
      count: '3',
      pressed: '{{ has(state.watching) && state.watching }}',
      items: [{ label: 'Stop watching', onClick: [set(false)] }],
    } as NodeDefinition;
    const h = await renderScreen({ components: [{ type: 'button', label: 'Watch', onClick: [set(true)] }, node] });
    const button = h.el.querySelector<HTMLButtonElement>('lc-menu-button button')!;
    expect(plain(button.textContent)).toBe('3');
    expect(button.getAttribute('aria-label')).toBe('Watchers: 3');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    h.el.querySelector<HTMLButtonElement>('lc-button button')!.click();
    await h.until(() => button.getAttribute('aria-pressed') === 'true', 'pressed');
    expect(button.classList.contains('pressed')).toBe(true);
  });
});
