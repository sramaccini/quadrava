import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { NavigationDefinition, ScreenDefinition, ThemeDefinition } from 'schema';
import { vi } from 'vitest';
import { PreviewApp } from './preview-app';
import { previewConfig } from './preview-config';
import { previewState, type FromPreview, type PreviewState } from './protocol';

describe('preview (inside the iframe)', () => {
  let fixture: ComponentFixture<PreviewApp>;
  let el: HTMLElement;
  let sent: FromPreview[];

  const screen: ScreenDefinition = {
    schemaVersion: '1.0',
    screen: 'test',
    dataSources: { list: { type: 'rest', method: 'GET', url: '/api/list' } },
    components: [
      { id: 'button-1', type: 'button', label: 'Notify', onClick: [{ toast: 'Done' }] },
      { id: 'table-1', type: 'table', source: 'list', columns: [{ field: 'name', label: 'Name' }] },
      {
        id: 'tabs-1',
        type: 'tabs',
        tabs: [
          { label: 'First', components: [{ id: 'text-1', type: 'text', text: 'One' }] },
          { label: 'Second', components: [{ id: 'text-2', type: 'text', text: 'Two' }] },
        ],
      },
    ],
  } as ScreenDefinition;

  beforeEach(async () => {
    sent = [];
    if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => undefined;
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, json: async () => ({}) }));
    // In jsdom the «parent» window is the same: what the preview sends to the editor is recorded.
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => void sent.push(message as FromPreview));
    TestBed.configureTestingModule({ providers: previewConfig.providers });
    fixture = TestBed.createComponent(PreviewApp);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
    document.getElementById('lc-nz-dark-theme')?.remove();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function until(condition: () => boolean, label: string): Promise<void> {
    for (let i = 0; i < 60; i++) {
      await settle();
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timeout: ${label}`);
  }

  async function deliver(state: Partial<PreviewState>, origin = location.origin): Promise<void> {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-preview:state', state: previewState(state) }, origin, source: window }));
    await settle();
  }

  it('declares itself ready, draws the received state and answers with the sample data', async () => {
    expect(sent).toContainEqual({ type: 'lc-preview:ready' });
    await deliver({ screen, samples: { list: [{ name: 'Mario' }] } });
    await until(() => !!el.querySelector('lc-table tbody')?.textContent?.includes('Mario'), 'sample row');
    expect(sent).toContainEqual({ type: 'lc-preview:event', event: { kind: 'request', text: 'GET /api/list → list' } });
  });

  it('ignores messages that do not come from the editor of the same origin', async () => {
    await deliver({ screen }, 'https://other.example');
    expect(el.querySelector('lc-screen')).toBeNull();
  });

  it('Alt+click, or a click in selection mode, sends the editor the id of the component without activating it', async () => {
    await deliver({ screen });
    await until(() => !!el.querySelector('lc-node[data-node-id="button-1"] button'), 'button-1');
    (el.querySelector('lc-node[data-node-id="button-1"] button') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
    await settle();
    expect(sent).toContainEqual({ type: 'lc-preview:select', id: 'button-1' });
    expect(document.querySelector('.ant-message-notice')).toBeNull();
    await deliver({ screen, selectMode: true });
    (el.querySelector('lc-node[data-node-id="text-1"] lc-text') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sent).toContainEqual({ type: 'lc-preview:select', id: 'text-1' });
  });

  it('in selection mode the components do not react: they are chosen on release, also when disabled, and take no focus', async () => {
    const form: ScreenDefinition = {
      schemaVersion: '1.0',
      screen: 'form',
      components: [
        { id: 'off', type: 'button', label: 'Disabled', enabledIf: '{{ false }}', onClick: [{ toast: 'Done' }] },
        { id: 'name', type: 'input', name: 'name', label: 'Name', field: 'text' },
      ],
    } as ScreenDefinition;
    await deliver({ screen: form, selectMode: true });
    await until(() => !!el.querySelector('lc-node[data-node-id="off"] button'), 'buttons');
    const button = el.querySelector('lc-node[data-node-id="off"] button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    // A press and a release in the same place choose the component, even if disabled (it receives no click).
    const reached: string[] = [];
    for (const type of ['pointerdown', 'mousedown', 'keydown', 'mouseenter']) button.addEventListener(type, () => reached.push(type));
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('mouseenter'));
    button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 11, clientY: 10 }));
    expect(sent.filter((m) => m.type === 'lc-preview:select')).toEqual([{ type: 'lc-preview:select', id: 'off' }]);
    expect(reached).toEqual([]);
    // The click that follows does not choose it again, nor activate it.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(sent.filter((m) => m.type === 'lc-preview:select')).toHaveLength(1);
    // A press released far away is a drag, not a choice.
    const input = el.querySelector('lc-node[data-node-id="name"] input') as HTMLInputElement;
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 80, clientY: 40 }));
    expect(sent.filter((m) => m.type === 'lc-preview:select')).toHaveLength(1);
    // Fields take no focus and no typing.
    input.focus();
    expect(document.activeElement).not.toBe(input);
    const typed = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a' });
    input.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(true);
    // Outside selection mode the components work again.
    await deliver({ screen: form, selectMode: false });
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it('in selection mode the editing shortcuts and the right click go to the editor', async () => {
    await deliver({ screen, selectMode: true });
    await until(() => !!el.querySelector('lc-node[data-node-id="button-1"] button'), 'button-1');
    const undo = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'z', ctrlKey: true });
    document.body.dispatchEvent(undo);
    expect(undo.defaultPrevented).toBe(true);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Delete' }));
    // Other keys are not shortcuts: they are not sent.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a' }));
    expect(sent.filter((m) => m.type === 'lc-preview:key')).toEqual([
      { type: 'lc-preview:key', key: 'z', ctrl: true, shift: false, alt: false },
      { type: 'lc-preview:key', key: 'Delete', ctrl: false, shift: false, alt: false },
    ]);
    const right = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 });
    el.querySelector('lc-node[data-node-id="button-1"] button')!.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true);
    expect(sent.slice(-2)).toEqual([
      { type: 'lc-preview:select', id: 'button-1' },
      { type: 'lc-preview:context', id: 'button-1', x: 30, y: 40 },
    ]);
    // Outside selection mode the keys belong to the screen being tried.
    await deliver({ screen, selectMode: false });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'z', ctrlKey: true }));
    expect(sent.filter((m) => m.type === 'lc-preview:key')).toHaveLength(2);
  });

  it('a component dragged from the palette onto the drawing: indicator and drop message to the editor', async () => {
    await deliver({ screen });
    await until(() => !!el.querySelector('lc-node[data-node-id="button-1"]'), 'button-1');
    const node = el.querySelector('lc-node[data-node-id="button-1"]') as HTMLElement;
    const drag = (type: string, target: Element, clientY = 0) => {
      const data = { types: ['application/x-lc-node-type'], getData: (t: string) => (t === 'application/x-lc-node-type' ? 'input.select' : ''), dropEffect: '' };
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY }) as DragEvent;
      Object.defineProperty(event, 'dataTransfer', { value: data });
      target.dispatchEvent(event);
      return event;
    };
    // In jsdom nodes have no size: the pointer falls in the middle, hence «after».
    expect(drag('dragover', node).defaultPrevented).toBe(true);
    await settle();
    expect(el.querySelector('.drop')).not.toBeNull();
    drag('drop', node);
    await settle();
    expect(sent).toContainEqual({ type: 'lc-preview:drop', kind: 'input.select', targetId: 'button-1', zone: 'after' });
    expect(el.querySelector('.drop')).toBeNull();
  });

  it('in selection mode components are dragged to move them; inside a grid there is the handle', async () => {
    const withGrid: ScreenDefinition = { ...screen, components: [...screen.components, { id: 'grid-1', type: 'grid', columns: 3, components: [{ id: 'cell', type: 'text', text: 'In the grid' }] }] };
    await deliver({ screen: withGrid });
    await until(() => !!el.querySelector('lc-node[data-node-id="cell"]'), 'grid-1');
    expect(el.querySelector('lc-node[data-node-id="button-1"]')?.getAttribute('draggable')).toBeNull();
    // In jsdom elements have no size: without measures there is no frame nor handle.
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON: () => ({}) } as DOMRect);
    await deliver({ screen: withGrid, selectMode: true, selectedId: 'cell' });
    expect(el.querySelector('lc-node[data-node-id="button-1"]')?.getAttribute('draggable')).toBe('true');
    expect(el.querySelector('.resize')).not.toBeNull();
    // The button (outside grids and boxes) has no handle.
    await deliver({ screen: withGrid, selectMode: true, selectedId: 'button-1' });
    expect(el.querySelector('.resize')).toBeNull();
    const store = new Map<string, string>();
    const data = { types: [] as string[], setData: (t: string, v: string) => (store.set(t, v), data.types.push(t)), getData: (t: string) => store.get(t) ?? '', dropEffect: '', effectAllowed: '' };
    const drag = (type: string, target: Element) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(event, 'dataTransfer', { value: data });
      target.dispatchEvent(event);
    };
    drag('dragstart', el.querySelector('lc-node[data-node-id="button-1"] button')!);
    drag('dragover', el.querySelector('lc-node[data-node-id="table-1"]')!);
    await settle();
    drag('drop', el.querySelector('lc-node[data-node-id="table-1"]')!);
    expect(sent).toContainEqual({ type: 'lc-preview:move', id: 'button-1', targetId: 'table-1', zone: 'before' });
    rect.mockRestore();
  });

  it('the node selected in a hidden tab makes that tab open', async () => {
    await deliver({ screen });
    await until(() => el.querySelector('.ant-tabs-tab-active')?.textContent?.trim() === 'First', 'first tab');
    await deliver({ screen, selectedId: 'text-2' });
    await until(() => el.querySelector('.ant-tabs-tab-active')?.textContent?.trim() === 'Second', 'second tab');
    // Every message arrives cloned: an equal screen is not redrawn, so the tab stays the open one.
    await deliver({ screen: structuredClone(screen), selectedId: null });
    await settle();
    expect(el.querySelector('.ant-tabs-tab-active')?.textContent?.trim()).toBe('Second');
  });

  it('menu with the simulated profile, translations of the editor, dark theme with its stylesheet', async () => {
    const navigation = {
      schemaVersion: '1.0',
      navigation: 'test',
      areas: [
        {
          id: 'area',
          label: 'Area',
          items: [
            { id: 'orders', label: "{{ t('p.orders', 'Orders') }}", screen: 'orders', requires: 'orders.order.read' },
            { id: 'other', label: 'Other', screen: 'other' },
          ],
        },
      ],
    } as NavigationDefinition;
    const theme = {
      schemaVersion: '1.0',
      theme: 'night',
      mode: 'dark',
      tokens: { colors: { primary: '#6aa6ff', onPrimary: '#0b1220', background: '#0f141b', surface: '#1a222d', onSurface: '#e6ebf2', border: '#2a3442' } },
    } as ThemeDefinition;
    const menu = (): string => el.querySelector('lc-sidebar')?.textContent?.replace(/\s+/g, ' ') ?? '';
    await deliver({ navigation, theme, locale: 'en', translations: { en: { 'p.orders': 'Orders' } } });
    await until(() => menu().includes('Orders'), 'item translated');
    // The menu alone: no screen next to it.
    expect(el.querySelector('lc-screen')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--lc-color-background')).toBe('#0f141b');
    expect(document.getElementById('lc-nz-dark-theme')).not.toBeNull();
    await deliver({ navigation, theme, locale: 'en', granted: [] });
    await until(() => !menu().includes('Orders') && menu().includes('Other'), 'item without permission hidden');
  });
});
