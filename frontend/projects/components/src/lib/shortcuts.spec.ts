import type { NodeDefinition, Shortcut } from 'schema';
import { plain, renderScreen } from './screen-testing';

describe('keyboard shortcuts of a screen', () => {
  const press = (key: string, target: EventTarget = document.body, mods: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    target.dispatchEvent(event);
    return event;
  };
  const components: NodeDefinition[] = [{ type: 'form', id: 'f', fields: [{ name: 'note', type: 'text', label: 'Note' }] }];
  const shortcuts: Shortcut[] = [
    { key: 'm', label: 'Comment', onClick: [{ toast: 'comment' }] },
    { key: 'shift+e', label: 'Edit', onClick: [{ toast: 'edit' }] },
    { key: 'i', label: 'Assign to me', visibleIf: '{{ false }}', onClick: [{ toast: 'assign' }] },
    { key: 'a', label: 'Assign', enabledIf: '{{ false }}', onClick: [{ toast: 'assign' }] },
  ];
  const dialog = (): HTMLElement | null => document.querySelector('.lc-shortcut-help [role="dialog"]') ?? document.querySelector('.lc-shortcut-help');

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('a key runs its steps; with Shift only the shortcut that asks for it', async () => {
    const h = await renderScreen({ components, shortcuts });
    expect(press('m').defaultPrevented).toBe(true);
    press('E', document.body, { shiftKey: true });
    press('e');
    await h.until(() => h.toasts.length === 2, 'the steps');
    expect(h.toasts).toEqual(['comment', 'edit']);
  });

  it('nothing happens while typing in a field, or for a shortcut hidden or disabled', async () => {
    const h = await renderScreen({ components, shortcuts });
    await h.until(() => !!h.el.querySelector('input'), 'the field');
    press('m', h.el.querySelector('input')!);
    press('i');
    press('a');
    await h.settle();
    expect(h.toasts).toEqual([]);
    expect(h.reports).toEqual([]);
  });

  it('? lists the shortcuts available now, with their keys, and itself', async () => {
    const h = await renderScreen({ components, shortcuts });
    press('?', document.body, { shiftKey: true });
    await h.until(() => !!dialog(), 'the list');
    const rows = [...dialog()!.querySelectorAll('dt')].map((dt) => plain(dt.textContent));
    const labels = [...dialog()!.querySelectorAll('dd')].map((dd) => plain(dd.textContent));
    expect(rows).toEqual(['M', 'Shift+E', '?']);
    expect(labels).toEqual(['Comment', 'Edit', 'Show the keyboard shortcuts']);
    expect(dialog()!.textContent).toContain('Keyboard shortcuts');
    // While the list is open, the keys of the screen under it do nothing.
    press('m');
    await h.settle();
    expect(h.toasts).toEqual([]);
  });
});
